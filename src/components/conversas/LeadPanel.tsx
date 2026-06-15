import { Mail, Phone, Building2, User as UserIcon } from "lucide-react";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAtualizarStatus } from "@/hooks/useDevedorMutations";
import { useToast } from "@/hooks/use-toast";
import { formatTelefone } from "@/lib/formatters";
import type { ConversaItem } from "@/hooks/useConversas";
import type { StatusNegociacao } from "@/lib/types";

const STATUS_OPTIONS: { value: StatusNegociacao; label: string }[] = [
  { value: "pendente", label: "Pendente" },
  { value: "primeira_msg", label: "1ª Mensagem" },
  { value: "em_negociacao", label: "Em Negociação" },
  { value: "acordo_aceito", label: "Acordo Fechado" },
  { value: "escalado", label: "Escalado" },
  { value: "sem_acordo", label: "Sem Acordo" },
  { value: "aguardando_retorno", label: "Aguardando" },
];

function formatBRL(v: number | null | undefined): string {
  if (v == null) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(v);
}

interface Props {
  conversa: ConversaItem | null;
}

export function LeadPanel({ conversa }: Props) {
  const { mutateAsync: atualizarStatus, isPending } = useAtualizarStatus();
  const { toast } = useToast();
  const devedor = conversa?.devedor ?? null;

  async function trocarStatus(status: StatusNegociacao) {
    if (!devedor || devedor.status_negociacao === status) return;
    try {
      await atualizarStatus({ id: devedor.id, status });
      toast({ variant: "success", title: "Status atualizado" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro ao atualizar status",
        description: err instanceof Error ? err.message : "Falhou",
      });
    }
  }

  if (!conversa) {
    return (
      <div className="hidden h-full flex-col items-center justify-center border-l bg-muted/5 p-6 text-center text-xs text-muted-foreground lg:flex">
        Selecione uma conversa para ver os dados do lead.
      </div>
    );
  }

  return (
    <div className="hidden h-full min-h-0 flex-col overflow-y-auto border-l bg-muted/5 lg:flex">
      <div className="border-b bg-background px-4 py-3">
        <p className="text-sm font-semibold">Dados do lead</p>
      </div>

      <div className="space-y-4 p-4">
        {!devedor ? (
          <p className="text-xs text-muted-foreground">
            Conversa sem devedor identificado (telefone {" "}
            +{conversa.telefone_normalizado}).
          </p>
        ) : (
          <>
            <Campo icon={UserIcon} label="Nome" valor={devedor.nome_devedor} />
            <Campo icon={Mail} label="E-mail" valor={devedor.email || "—"} />
            <Campo
              icon={Phone}
              label="Telefone"
              valor={formatTelefone(devedor.telefone)}
            />
            <Campo
              icon={Building2}
              label="Instituição"
              valor={devedor.instituicao || "—"}
            />
            <div className="grid grid-cols-2 gap-3">
              <Mini label="CPF" valor={devedor.cpf || "—"} />
              <Mini label="Valor atualizado" valor={formatBRL(devedor.valor_atualizado)} />
            </div>

            <div className="space-y-1.5 pt-1">
              <Label className="text-xs">Status</Label>
              <Select
                value={devedor.status_negociacao ?? undefined}
                onValueChange={(v) => void trocarStatus(v as StatusNegociacao)}
                disabled={isPending}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Definir status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Muda o status do devedor no sistema (integrado ao Dashboard).
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Campo({
  icon: Icon,
  label,
  valor,
}: {
  icon: typeof Mail;
  label: string;
  valor: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="flex items-center gap-1.5 text-xs">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        {label}
      </Label>
      <div className="rounded-md border bg-background px-3 py-2 text-sm">
        {valor}
      </div>
    </div>
  );
}

function Mini({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <div className="truncate rounded-md border bg-background px-2 py-1.5 text-xs">
        {valor}
      </div>
    </div>
  );
}
