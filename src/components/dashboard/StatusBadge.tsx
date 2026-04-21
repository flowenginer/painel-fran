import { cn } from "@/lib/utils";
import type { StatusNegociacao } from "@/lib/types";

// Mapa de estilos e labels por status (seção 6.2 do PRD).
const STATUS_CONFIG: Record<
  StatusNegociacao,
  { label: string; className: string; icon: string }
> = {
  pendente: {
    label: "Pendente",
    className: "bg-muted text-muted-foreground border-border",
    icon: "○",
  },
  primeira_msg: {
    label: "1ª Mensagem",
    className:
      "bg-blue-500/15 text-blue-600 border-blue-500/30 dark:text-blue-400",
    icon: "●",
  },
  em_negociacao: {
    label: "Em Negociação",
    className:
      "bg-yellow-500/15 text-yellow-700 border-yellow-500/30 dark:text-yellow-400",
    icon: "●",
  },
  acordo_aceito: {
    label: "Acordo Fechado",
    className:
      "bg-green-500/15 text-green-700 border-green-500/30 dark:text-green-400",
    icon: "✓",
  },
  escalado: {
    label: "Escalado",
    className:
      "bg-orange-500/15 text-orange-700 border-orange-500/30 dark:text-orange-400",
    icon: "⚠",
  },
  sem_acordo: {
    label: "Sem Acordo",
    className:
      "bg-red-500/15 text-red-700 border-red-500/30 dark:text-red-400",
    icon: "✕",
  },
  aguardando_retorno: {
    label: "Aguardando",
    className:
      "bg-purple-500/15 text-purple-700 border-purple-500/30 dark:text-purple-400",
    icon: "◷",
  },
};

interface StatusBadgeProps {
  status: StatusNegociacao | null | undefined;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const cfg = STATUS_CONFIG[status ?? "pendente"];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        cfg.className
      )}
    >
      <span aria-hidden>{cfg.icon}</span>
      {cfg.label}
    </span>
  );
}
