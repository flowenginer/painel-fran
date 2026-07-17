import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ETAPAS_FUNIL } from "@/lib/pacientes-funil";
import {
  atualizarPaciente,
  criarPaciente,
  listarUnidades,
} from "@/lib/pacientes";
import type { Paciente, StatusFunil } from "@/lib/types";

const schema = z.object({
  telefone: z
    .string()
    .min(10, "Informe um telefone válido com DDD")
    .refine((v) => v.replace(/\D/g, "").length >= 10, "Telefone inválido"),
  nome: z.string().optional(),
  email: z
    .string()
    .email("E-mail inválido")
    .optional()
    .or(z.literal("")),
  procedimento: z.string().optional(),
  status_funil: z.string(),
  unidade_id: z.string().min(1, "Selecione a unidade"),
});

type FormValues = z.infer<typeof schema>;

interface PacienteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Paciente em edição; null = novo (pré-cadastro). */
  inicial: Paciente | null;
}

export function PacienteDialog({
  open,
  onOpenChange,
  inicial,
}: PacienteDialogProps) {
  const { perfil, isAdmin, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const editando = !!inicial;

  // Unidades só importam para o admin escolher; atendente usa a própria.
  const { data: unidades } = useQuery({
    queryKey: ["unidades"],
    queryFn: listarUnidades,
    enabled: open && isAdmin,
    staleTime: 1000 * 60 * 5,
  });

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      telefone: "",
      nome: "",
      email: "",
      procedimento: "",
      status_funil: "lead_novo",
      unidade_id: "",
    },
  });

  // Preenche o formulário ao abrir / trocar de paciente.
  useEffect(() => {
    if (!open) return;
    const unidadePadrao = isAdmin
      ? inicial?.unidade_id
        ? String(inicial.unidade_id)
        : ""
      : perfil?.unidade_id != null
        ? String(perfil.unidade_id)
        : "";
    reset({
      telefone: inicial?.telefone ?? "",
      nome: inicial?.nome ?? "",
      email: inicial?.email ?? "",
      procedimento: inicial?.procedimento ?? "",
      status_funil: inicial?.status_funil ?? "lead_novo",
      unidade_id: unidadePadrao,
    });
  }, [open, inicial, isAdmin, perfil, reset]);

  const statusAtual = watch("status_funil");
  const unidadeAtual = watch("unidade_id");

  async function onSubmit(values: FormValues) {
    try {
      const unidadeId = Number(values.unidade_id);
      if (!Number.isFinite(unidadeId) || unidadeId <= 0) {
        toast({
          variant: "destructive",
          title: "Unidade obrigatória",
          description: "Selecione a unidade do paciente.",
        });
        return;
      }

      if (editando && inicial) {
        await atualizarPaciente(inicial.id, {
          telefone: values.telefone,
          nome: values.nome,
          email: values.email,
          procedimento: values.procedimento,
          status_funil: values.status_funil as StatusFunil,
          unidade_id: isAdmin ? unidadeId : undefined,
        });
        toast({ title: "Paciente atualizado" });
      } else {
        await criarPaciente({
          unidade_id: unidadeId,
          telefone: values.telefone,
          nome: values.nome,
          email: values.email,
          procedimento: values.procedimento,
          status_funil: values.status_funil as StatusFunil,
          responsavel_id: user?.id ?? null,
        });
        toast({ title: "Paciente cadastrado" });
      }
      await queryClient.invalidateQueries({ queryKey: ["pacientes"] });
      onOpenChange(false);
    } catch (err) {
      toast({
        variant: "destructive",
        title: editando ? "Erro ao atualizar" : "Erro ao cadastrar",
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editando ? "Editar paciente" : "Novo paciente"}
          </DialogTitle>
          <DialogDescription>
            {editando
              ? "Atualize os dados e a etapa do funil."
              : "Pré-cadastro: o telefone já basta. O resto pode ser completado depois."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="telefone">
              Telefone <span className="text-destructive">*</span>
            </Label>
            <Input
              id="telefone"
              placeholder="(62) 99135-7861"
              autoComplete="off"
              {...register("telefone")}
            />
            {errors.telefone && (
              <p className="text-xs text-destructive">
                {errors.telefone.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="nome">Nome</Label>
            <Input id="nome" placeholder="Nome do paciente" {...register("nome")} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                placeholder="email@exemplo.com"
                {...register("email")}
              />
              {errors.email && (
                <p className="text-xs text-destructive">
                  {errors.email.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Etapa do funil</Label>
              <Select
                value={statusAtual}
                onValueChange={(v) => setValue("status_funil", v)}
              >
                <SelectTrigger id="status">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {ETAPAS_FUNIL.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="procedimento">Procedimento de interesse</Label>
            <Textarea
              id="procedimento"
              rows={2}
              placeholder="Ex.: avaliação, clareamento, implante…"
              {...register("procedimento")}
            />
          </div>

          {/* Unidade: admin escolhe; atendente fica travada na própria. */}
          {isAdmin ? (
            <div className="space-y-2">
              <Label htmlFor="unidade">
                Unidade <span className="text-destructive">*</span>
              </Label>
              <Select
                value={unidadeAtual}
                onValueChange={(v) => setValue("unidade_id", v)}
              >
                <SelectTrigger id="unidade">
                  <SelectValue placeholder="Selecione a unidade" />
                </SelectTrigger>
                <SelectContent>
                  {(unidades ?? []).map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>
                      {u.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.unidade_id && (
                <p className="text-xs text-destructive">
                  {errors.unidade_id.message}
                </p>
              )}
            </div>
          ) : (
            <input type="hidden" {...register("unidade_id")} />
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {editando ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
