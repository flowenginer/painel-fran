import { cn } from "@/lib/utils";
import { formatTelefone } from "@/lib/formatters";
import { horaCurta } from "@/lib/dates";
import type { ConversaComPaciente } from "@/lib/types";

interface ListaConversasProps {
  conversas: ConversaComPaciente[];
  selecionada: number | null;
  onSelecionar: (id: number) => void;
  isLoading: boolean;
}

function inicial(nome: string | null, telefone: string) {
  const base = nome?.trim() || telefone;
  return base.slice(0, 1).toUpperCase();
}

export function ListaConversas({
  conversas,
  selecionada,
  onSelecionar,
  isLoading,
}: ListaConversasProps) {
  if (isLoading) {
    return (
      <div className="space-y-2 p-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-muted/50" />
        ))}
      </div>
    );
  }

  if (conversas.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
        Nenhuma conversa ainda.
      </div>
    );
  }

  return (
    <ul className="divide-y">
      {conversas.map((c) => {
        const oficial = c.canal?.tipo === "zernio";
        const ativa = c.id === selecionada;
        const nome = c.paciente?.nome || formatTelefone(c.telefone);
        return (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onSelecionar(c.id)}
              className={cn(
                "flex w-full items-start gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/50",
                ativa && "bg-muted",
              )}
            >
              <div
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ring-2",
                  oficial
                    ? "bg-emerald-500/10 text-emerald-600 ring-emerald-500/40"
                    : "bg-pink-500/10 text-pink-600 ring-pink-500/40",
                )}
                title={oficial ? "Canal oficial" : "Canal não-oficial"}
              >
                {inicial(c.paciente?.nome ?? null, c.telefone)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium">{nome}</p>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {horaCurta(c.ultima_mensagem_at)}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <p className="truncate text-xs text-muted-foreground">
                    {c.ultima_direcao === "out" && "Você: "}
                    {c.ultima_mensagem_preview || "—"}
                  </p>
                  {c.nao_lida && (
                    <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-primary" />
                  )}
                </div>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
