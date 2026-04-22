// Dialog de edição manual de um devedor já cadastrado.
// Reaproveita a UI de campos do modal de revisão, acrescentando
// controle de status_negociacao.
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAtualizarDevedor } from "@/hooks/useDevedorMutations";
import { useInstituicoes } from "@/hooks/useInstituicoes";
import { formatBRL } from "@/lib/formatters";
import type { Devedor, StatusNegociacao } from "@/lib/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  devedor: Devedor | null;
}

interface FormState {
  nome_devedor: string;
  primeiro_nome: string;
  tratamento: "Sr." | "Sra.";
  email: string;
  telefone: string;
  telefone_2: string;
  telefone_3: string;
  endereco: string;
  bairro: string;
  cidade: string;
  estado: string;
  cep: string;
  instituicao: string;
  nome_aluno: string;
  acordo_anterior: "sim" | "nao";
  dado_adicional: string;
  observacoes_negociacao: string;
  status_negociacao: StatusNegociacao;
}

const STATUS_OPTIONS: { value: StatusNegociacao; label: string }[] = [
  { value: "pendente", label: "Pendente" },
  { value: "primeira_msg", label: "1ª Mensagem" },
  { value: "em_negociacao", label: "Em Negociação" },
  { value: "acordo_aceito", label: "Acordo Fechado" },
  { value: "escalado", label: "Escalado" },
  { value: "sem_acordo", label: "Sem Acordo" },
  { value: "aguardando_retorno", label: "Aguardando" },
];

function formFromDevedor(d: Devedor): FormState {
  const tratamento: "Sr." | "Sra." =
    d.tratamento === "Sra." ? "Sra." : "Sr.";
  return {
    nome_devedor: d.nome_devedor ?? "",
    primeiro_nome: d.primeiro_nome ?? "",
    tratamento,
    email: d.email ?? "",
    telefone: d.telefone ?? "",
    telefone_2: d.telefone_2 ?? "",
    telefone_3: d.telefone_3 ?? "",
    endereco: d.endereco ?? "",
    bairro: d.bairro ?? "",
    cidade: d.cidade ?? "",
    estado: d.estado ?? "",
    cep: d.cep ?? "",
    instituicao: d.instituicao ?? "",
    nome_aluno: d.nome_aluno ?? "",
    acordo_anterior: d.acordo_anterior === "sim" ? "sim" : "nao",
    dado_adicional: d.dado_adicional ?? "",
    observacoes_negociacao: d.observacoes_negociacao ?? "",
    status_negociacao: (d.status_negociacao as StatusNegociacao) ?? "pendente",
  };
}

export function EditarDevedorDialog({ open, onOpenChange, devedor }: Props) {
  const [form, setForm] = useState<FormState | null>(null);
  const [erros, setErros] = useState<
    Partial<Record<keyof FormState, string>>
  >({});

  const { data: instituicoes } = useInstituicoes();
  const { mutateAsync, isPending } = useAtualizarDevedor();
  const { toast } = useToast();

  useEffect(() => {
    if (devedor && open) {
      setForm(formFromDevedor(devedor));
      setErros({});
    }
    if (!open) {
      setForm(null);
      setErros({});
    }
  }, [devedor, open]);

  if (!devedor || !form) return null;

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    if (erros[key]) {
      setErros((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }

  function validar(): boolean {
    if (!form) return false;
    const novosErros: Partial<Record<keyof FormState, string>> = {};
    if (!form.nome_devedor.trim())
      novosErros.nome_devedor = "Nome obrigatório";
    const telDigitos = form.telefone.replace(/\D/g, "");
    if (!telDigitos) novosErros.telefone = "Telefone obrigatório";
    else if (telDigitos.length < 12 || telDigitos.length > 13)
      novosErros.telefone = "Telefone inválido (12–13 dígitos)";
    if (!form.instituicao.trim())
      novosErros.instituicao = "Instituição obrigatória";
    setErros(novosErros);
    return Object.keys(novosErros).length === 0;
  }

  async function salvar() {
    if (!form || !devedor) return;
    if (!validar()) {
      toast({
        variant: "destructive",
        title: "Preencha os campos obrigatórios",
      });
      return;
    }
    try {
      await mutateAsync({
        id: devedor.id,
        input: {
          nome_devedor: form.nome_devedor.trim(),
          primeiro_nome: form.primeiro_nome.trim() || null,
          tratamento: form.tratamento,
          email: form.email.trim() || null,
          telefone: form.telefone.replace(/\D/g, ""),
          telefone_2: form.telefone_2.replace(/\D/g, "") || null,
          telefone_3: form.telefone_3.replace(/\D/g, "") || null,
          endereco: form.endereco.trim() || null,
          bairro: form.bairro.trim() || null,
          cidade: form.cidade.trim() || null,
          estado: form.estado.trim() || null,
          cep: form.cep.replace(/\D/g, "") || null,
          instituicao: form.instituicao.trim(),
          nome_aluno: form.nome_aluno.trim() || null,
          acordo_anterior: form.acordo_anterior,
          dado_adicional: form.dado_adicional.trim() || null,
          observacoes_negociacao:
            form.observacoes_negociacao.trim() || null,
          status_negociacao: form.status_negociacao,
        },
      });
      toast({ variant: "success", title: "Devedor atualizado" });
      onOpenChange(false);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
    }
  }

  const Campo = ({
    label,
    error,
    className,
    children,
  }: {
    label: string;
    error?: string;
    className?: string;
    children: React.ReactNode;
  }) => (
    <div className={cn("space-y-1", className)}>
      <Label className="text-xs">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );

  const instMapping = devedor.cod_credor
    ? instituicoes?.find((i) => i.cod_credor === devedor.cod_credor)
    : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Editar devedor</DialogTitle>
          <DialogDescription>
            Ajuste os dados cadastrais, status e observações. Campos de
            acordo (quando houver) são preservados.
          </DialogDescription>
        </DialogHeader>

        {/* Identificação Cedrus (read-only) */}
        {(devedor.id_devedor ||
          devedor.cod_credor ||
          devedor.cod_devedor ||
          devedor.cpf) && (
          <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
            <p className="mb-1 font-medium text-foreground">
              Identificação Cedrus
            </p>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {devedor.cpf && (
                <span>
                  CPF: <code className="font-mono">{devedor.cpf}</code>
                </span>
              )}
              {devedor.id_devedor && (
                <span>
                  id_devedor:{" "}
                  <code className="font-mono">{devedor.id_devedor}</code>
                </span>
              )}
              {devedor.cod_credor && (
                <span>
                  cod_credor:{" "}
                  <code className="font-mono">{devedor.cod_credor}</code>
                </span>
              )}
              {devedor.cod_devedor && (
                <span>
                  cod_devedor:{" "}
                  <code className="font-mono">{devedor.cod_devedor}</code>
                </span>
              )}
            </div>
          </div>
        )}

        <div className="space-y-4">
          {/* Status (destaque) */}
          <section className="rounded-md border bg-primary/5 p-3">
            <Campo label="Status da negociação">
              <Select
                value={form.status_negociacao}
                onValueChange={(v) =>
                  set("status_negociacao", v as StatusNegociacao)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Campo>
          </section>

          {/* Pessoa */}
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo label="Tratamento">
              <Select
                value={form.tratamento}
                onValueChange={(v) => set("tratamento", v as "Sr." | "Sra.")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Sr.">Sr.</SelectItem>
                  <SelectItem value="Sra.">Sra.</SelectItem>
                </SelectContent>
              </Select>
            </Campo>
            <Campo label="Email">
              <Input
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
              />
            </Campo>
            <Campo
              label="Nome completo *"
              error={erros.nome_devedor}
              className="sm:col-span-2"
            >
              <Input
                value={form.nome_devedor}
                onChange={(e) => set("nome_devedor", e.target.value)}
              />
            </Campo>
            <Campo label="Primeiro nome">
              <Input
                value={form.primeiro_nome}
                onChange={(e) => set("primeiro_nome", e.target.value)}
              />
            </Campo>
          </section>

          {/* Telefones */}
          <section className="space-y-3">
            <h3 className="text-sm font-medium">
              Telefones{" "}
              <span className="text-xs font-normal text-muted-foreground">
                (1º é o destino do WhatsApp)
              </span>
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Campo label="Principal *" error={erros.telefone}>
                <Input
                  value={form.telefone}
                  onChange={(e) => set("telefone", e.target.value)}
                />
              </Campo>
              <Campo label="Alternativo 1">
                <Input
                  value={form.telefone_2}
                  onChange={(e) => set("telefone_2", e.target.value)}
                />
              </Campo>
              <Campo label="Alternativo 2">
                <Input
                  value={form.telefone_3}
                  onChange={(e) => set("telefone_3", e.target.value)}
                />
              </Campo>
            </div>
          </section>

          {/* Instituição */}
          <section>
            <Campo
              label="Nome da instituição *"
              error={erros.instituicao}
            >
              <Input
                value={form.instituicao}
                onChange={(e) => set("instituicao", e.target.value)}
              />
            </Campo>
            {instMapping && (
              <p className="mt-1 text-xs text-muted-foreground">
                cod_credor{" "}
                <code className="font-mono">{devedor.cod_credor}</code>{" "}
                mapeado para "{instMapping.nome}"
              </p>
            )}
          </section>

          {/* Dívida */}
          <section className="space-y-3">
            <h3 className="text-sm font-medium">Dívida</h3>
            <Campo label="Aluno(s)">
              <Input
                value={form.nome_aluno}
                onChange={(e) => set("nome_aluno", e.target.value)}
              />
            </Campo>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Campo label="Valor original">
                <Input
                  readOnly
                  value={formatBRL(devedor.valor_original)}
                  className="bg-muted/30"
                />
              </Campo>
              <Campo label="Valor atualizado">
                <Input
                  readOnly
                  value={formatBRL(devedor.valor_atualizado)}
                  className="bg-muted/30"
                />
              </Campo>
              <Campo label="Parcelas em aberto">
                <Input
                  readOnly
                  value={String(devedor.qtd_parcelas_aberto ?? "—")}
                  className="bg-muted/30"
                />
              </Campo>
              <Campo label="Acordo anterior">
                <Select
                  value={form.acordo_anterior}
                  onValueChange={(v) =>
                    set("acordo_anterior", v as "sim" | "nao")
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sim">Sim</SelectItem>
                    <SelectItem value="nao">Não</SelectItem>
                  </SelectContent>
                </Select>
              </Campo>
            </div>
          </section>

          {/* Endereço */}
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo label="Logradouro" className="sm:col-span-2">
              <Input
                value={form.endereco}
                onChange={(e) => set("endereco", e.target.value)}
              />
            </Campo>
            <Campo label="Bairro">
              <Input
                value={form.bairro}
                onChange={(e) => set("bairro", e.target.value)}
              />
            </Campo>
            <Campo label="Cidade">
              <Input
                value={form.cidade}
                onChange={(e) => set("cidade", e.target.value)}
              />
            </Campo>
            <Campo label="UF">
              <Input
                value={form.estado}
                maxLength={2}
                onChange={(e) => set("estado", e.target.value)}
              />
            </Campo>
            <Campo label="CEP">
              <Input
                value={form.cep}
                onChange={(e) => set("cep", e.target.value)}
              />
            </Campo>
          </section>

          {/* Notas */}
          <section className="space-y-3">
            <Campo label="Observação / dado adicional">
              <Textarea
                value={form.dado_adicional}
                onChange={(e) => set("dado_adicional", e.target.value)}
                rows={2}
              />
            </Campo>
            <Campo label="Observações da negociação">
              <Textarea
                value={form.observacoes_negociacao}
                onChange={(e) =>
                  set("observacoes_negociacao", e.target.value)
                }
                rows={2}
                placeholder="Anotações internas visíveis só para o painel"
              />
            </Campo>
          </section>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
