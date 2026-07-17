import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, Mail, Pencil, Phone, Stethoscope } from "lucide-react";

import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatTelefone } from "@/lib/formatters";
import { buscarPaciente, atualizarPaciente } from "@/lib/pacientes";
import { ETAPAS_FUNIL } from "@/lib/pacientes-funil";
import { PacienteDialog } from "@/components/pacientes/PacienteDialog";
import { AgendamentoDialog } from "@/components/agenda/AgendamentoDialog";
import type { ConversaComPaciente, StatusFunil } from "@/lib/types";

interface LeadPanelProps {
  conversa: ConversaComPaciente | null;
}

export function LeadPanel({ conversa }: LeadPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editarOpen, setEditarOpen] = useState(false);
  const [agendarOpen, setAgendarOpen] = useState(false);

  const pacienteId = conversa?.paciente_id ?? null;
  const { data: paciente } = useQuery({
    queryKey: ["paciente", pacienteId],
    queryFn: () => buscarPaciente(pacienteId!),
    enabled: !!pacienteId,
    staleTime: 10000,
  });

  if (!conversa) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
        Selecione uma conversa.
      </div>
    );
  }

  async function mudarStatus(novo: string) {
    if (!paciente) return;
    try {
      await atualizarPaciente(paciente.id, {
        status_funil: novo as StatusFunil,
      });
      await queryClient.invalidateQueries({ queryKey: ["paciente", pacienteId] });
      await queryClient.invalidateQueries({ queryKey: ["conversas"] });
      toast({ title: "Status atualizado" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro ao atualizar status",
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
    }
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto p-4">
      <div className="mb-4">
        <h2 className="text-sm font-semibold">Dados do lead</h2>
        <p className="text-xs text-muted-foreground">
          Info do paciente e próximos passos
        </p>
      </div>

      {/* Ações rápidas */}
      <div className="mb-4 grid grid-cols-2 gap-2">
        <Button
          size="sm"
          onClick={() => setAgendarOpen(true)}
          disabled={!pacienteId}
        >
          <CalendarPlus className="mr-1.5 h-4 w-4" />
          Agendar
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setEditarOpen(true)}
          disabled={!paciente}
        >
          <Pencil className="mr-1.5 h-4 w-4" />
          Editar
        </Button>
      </div>

      {/* Status do funil */}
      <div className="mb-4 space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          Status de atendimento
        </label>
        <Select
          value={paciente?.status_funil ?? "lead_novo"}
          onValueChange={mudarStatus}
          disabled={!paciente}
        >
          <SelectTrigger>
            <SelectValue />
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

      {/* Info do lead */}
      <dl className="space-y-3 text-sm">
        <Campo
          icon={<Phone className="h-4 w-4" />}
          label="Telefone"
          valor={formatTelefone(paciente?.telefone ?? conversa.telefone)}
        />
        <Campo
          icon={<Mail className="h-4 w-4" />}
          label="E-mail"
          valor={paciente?.email || "—"}
        />
        <Campo
          icon={<Stethoscope className="h-4 w-4" />}
          label="Procedimento"
          valor={paciente?.procedimento || "—"}
        />
      </dl>

      {/* Origem de anúncio */}
      {paciente?.origem_campanha && (
        <div className="mt-4 rounded-md border bg-muted/30 p-3">
          <p className="text-xs font-medium text-muted-foreground">
            Origem do anúncio
          </p>
          <Badge variant="outline" className="mt-1">
            {paciente.origem_campanha}
          </Badge>
          {paciente.origem_criativo && (
            <p className="mt-1 text-xs text-muted-foreground">
              Criativo: {paciente.origem_criativo}
            </p>
          )}
        </div>
      )}

      {paciente && (
        <PacienteDialog
          open={editarOpen}
          onOpenChange={setEditarOpen}
          inicial={paciente}
        />
      )}
      <AgendamentoDialog
        open={agendarOpen}
        onOpenChange={setAgendarOpen}
        inicial={null}
        pacientePadrao={pacienteId}
      />
    </div>
  );
}

function Campo({
  icon,
  label,
  valor,
}: {
  icon: ReactNode;
  label: string;
  valor: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="truncate font-medium">{valor}</dd>
      </div>
    </div>
  );
}
