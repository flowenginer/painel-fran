// Catálogo do funil de pacientes/leads. Fonte única usada pelo filtro de etapas
// e pelos badges de status na tela de Pacientes.
import type { StatusFunil } from "@/lib/types";

// Variantes de Badge disponíveis (shadcn).
type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

export interface EtapaFunil {
  id: StatusFunil;
  label: string;
  /** Ordem no funil (para exibir os filtros na sequência certa). */
  ordem: number;
  /** Variante do Badge que representa a etapa. */
  variant: BadgeVariant;
  /** Classe extra p/ dar cor além das variantes padrão (opcional). */
  className?: string;
}

export const ETAPAS_FUNIL: EtapaFunil[] = [
  {
    id: "lead_novo",
    label: "Lead novo",
    ordem: 1,
    variant: "outline",
    className: "border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  },
  {
    id: "em_atendimento",
    label: "Em atendimento",
    ordem: 2,
    variant: "outline",
    className:
      "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  {
    id: "agendou",
    label: "Agendou",
    ordem: 3,
    variant: "outline",
    className:
      "border-violet-500/40 bg-violet-500/10 text-violet-600 dark:text-violet-400",
  },
  {
    id: "compareceu",
    label: "Compareceu",
    ordem: 4,
    variant: "outline",
    className:
      "border-teal-500/40 bg-teal-500/10 text-teal-600 dark:text-teal-400",
  },
  {
    id: "paciente",
    label: "Paciente",
    ordem: 5,
    variant: "outline",
    className:
      "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  {
    id: "perdido",
    label: "Perdido",
    ordem: 6,
    variant: "outline",
    className:
      "border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400",
  },
];

const POR_ID = new Map(ETAPAS_FUNIL.map((e) => [e.id, e]));

export function etapaFunil(id: StatusFunil | string | null | undefined): EtapaFunil {
  return (
    (id && POR_ID.get(id as StatusFunil)) ?? {
      id: "lead_novo",
      label: String(id ?? "—"),
      ordem: 99,
      variant: "outline",
    }
  );
}
