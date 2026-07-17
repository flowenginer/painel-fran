import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";

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
import {
  criarAgendamento,
  atualizarAgendamento,
  removerAgendamento,
  listarCategorias,
} from "@/lib/agenda";
import { listarPacientes } from "@/lib/pacientes";
import { hexDaCor } from "@/lib/google-cores";
import type {
  AgendamentoComRelacoes,
  StatusAgendamento,
} from "@/lib/types";

const STATUS: { id: StatusAgendamento; label: string }[] = [
  { id: "agendado", label: "Agendado" },
  { id: "confirmado", label: "Confirmado" },
  { id: "compareceu", label: "Compareceu" },
  { id: "faltou", label: "Faltou" },
  { id: "cancelado", label: "Cancelado" },
];

// ISO → valor de <input type="datetime-local"> no fuso local.
function paraLocalInput(iso: string): string {
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 16);
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  inicial: AgendamentoComRelacoes | null;
  /** Data pré-selecionada ao criar (YYYY-MM-DD). */
  dataPadrao?: string;
  /** Paciente pré-selecionado ao criar (ex.: agendar direto da conversa). */
  pacientePadrao?: number | null;
}

export function AgendamentoDialog({
  open,
  onOpenChange,
  inicial,
  dataPadrao,
  pacientePadrao,
}: Props) {
  const { perfil, isAdmin, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const editando = !!inicial;

  const { data: categorias } = useQuery({
    queryKey: ["agenda_categorias"],
    queryFn: listarCategorias,
    enabled: open,
    staleTime: 1000 * 60 * 5,
  });
  const { data: pacientes } = useQuery({
    queryKey: ["pacientes", "picker"],
    queryFn: () => listarPacientes({}),
    enabled: open,
    staleTime: 1000 * 30,
  });

  const [titulo, setTitulo] = useState("");
  const [pacienteId, setPacienteId] = useState<string>("nenhum");
  const [categoriaId, setCategoriaId] = useState<string>("nenhuma");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [status, setStatus] = useState<StatusAgendamento>("agendado");
  const [descricao, setDescricao] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (inicial) {
      setTitulo(inicial.titulo);
      setPacienteId(inicial.paciente_id ? String(inicial.paciente_id) : "nenhum");
      setCategoriaId(
        inicial.categoria_id ? String(inicial.categoria_id) : "nenhuma",
      );
      setInicio(paraLocalInput(inicial.inicio));
      setFim(paraLocalInput(inicial.fim));
      setStatus(inicial.status);
      setDescricao(inicial.descricao ?? "");
    } else {
      const base = dataPadrao ?? new Date().toISOString().slice(0, 10);
      setTitulo("Avaliação");
      setPacienteId(pacientePadrao ? String(pacientePadrao) : "nenhum");
      setCategoriaId("nenhuma");
      setInicio(`${base}T09:00`);
      setFim(`${base}T09:30`);
      setStatus("agendado");
      setDescricao("");
    }
  }, [open, inicial, dataPadrao, pacientePadrao]);

  async function salvar() {
    if (!titulo.trim() || !inicio || !fim) {
      toast({ variant: "destructive", title: "Preencha título e horários" });
      return;
    }
    const unidadeId = isAdmin
      ? (inicial?.unidade_id ?? perfil?.unidade_id ?? null)
      : (perfil?.unidade_id ?? null);
    if (!unidadeId) {
      toast({
        variant: "destructive",
        title: "Sem unidade",
        description: "Seu usuário precisa de uma unidade para agendar.",
      });
      return;
    }
    setSalvando(true);
    try {
      const dados = {
        titulo,
        paciente_id: pacienteId === "nenhum" ? null : Number(pacienteId),
        categoria_id: categoriaId === "nenhuma" ? null : Number(categoriaId),
        inicio: new Date(inicio).toISOString(),
        fim: new Date(fim).toISOString(),
        status,
        descricao,
      };
      if (editando && inicial) {
        await atualizarAgendamento(inicial.id, dados);
      } else {
        await criarAgendamento({
          ...dados,
          unidade_id: unidadeId,
          responsavel_id: user?.id ?? null,
        });
      }
      await queryClient.invalidateQueries({ queryKey: ["agendamentos"] });
      toast({ title: editando ? "Agendamento atualizado" : "Agendamento criado" });
      onOpenChange(false);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
    } finally {
      setSalvando(false);
    }
  }

  async function remover() {
    if (!inicial) return;
    setSalvando(true);
    try {
      await removerAgendamento(inicial.id);
      await queryClient.invalidateQueries({ queryKey: ["agendamentos"] });
      toast({ title: "Agendamento removido" });
      onOpenChange(false);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro ao remover",
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editando ? "Editar agendamento" : "Novo agendamento"}
          </DialogTitle>
          <DialogDescription>
            Vincule um paciente e uma cor (categoria). A cor vai junto pro Google.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Título</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Paciente</Label>
              <Select value={pacienteId} onValueChange={setPacienteId}>
                <SelectTrigger>
                  <SelectValue placeholder="Nenhum" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhum">Nenhum</SelectItem>
                  {(pacientes ?? []).map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.nome || p.telefone}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Categoria (cor)</Label>
              <Select value={categoriaId} onValueChange={setCategoriaId}>
                <SelectTrigger>
                  <SelectValue placeholder="Nenhuma" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhuma">Nenhuma</SelectItem>
                  {(categorias ?? []).map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="inline-block h-3 w-3 rounded-full"
                          style={{ backgroundColor: hexDaCor(c.google_color_id) }}
                        />
                        {c.nome}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Início</Label>
              <Input
                type="datetime-local"
                value={inicio}
                onChange={(e) => setInicio(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Fim</Label>
              <Input
                type="datetime-local"
                value={fim}
                onChange={(e) => setFim(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Status</Label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as StatusAgendamento)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea
              rows={2}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          {editando ? (
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={remover}
              disabled={salvando}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Remover
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={salvando}
            >
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={salvando}>
              {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
