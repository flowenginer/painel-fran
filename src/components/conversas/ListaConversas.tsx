import { useMemo, useState } from "react";
import { Ban, Search, UserRound } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { previewContent } from "@/lib/conversas";
import { nomeOperador, type OperadorLite } from "@/lib/conversas-transfer";
import { formatTelefone } from "@/lib/formatters";
import { STATUS_BLOCK_IA } from "@/hooks/useDevedorMutations";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import type { ConversaItem } from "@/hooks/useConversas";

interface Props {
  conversas: ConversaItem[];
  selecionada: string | null;
  onSelecionar: (telefone: string) => void;
  isLoading: boolean;
  /** Mostra o operador responsável em cada item (visão de admin). */
  mostrarResponsavel?: boolean;
  operadores?: OperadorLite[];
}

function iniciais(nome: string | null | undefined): string {
  if (!nome) return "?";
  return nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

export function ListaConversas({
  conversas,
  selecionada,
  onSelecionar,
  isLoading,
  mostrarResponsavel = false,
  operadores,
}: Props) {
  const [busca, setBusca] = useState("");

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return conversas;
    return conversas.filter((c) => {
      const nome = c.devedor?.nome_devedor?.toLowerCase() ?? "";
      const tel = c.telefone_normalizado;
      return nome.includes(q) || tel.includes(q.replace(/\D/g, ""));
    });
  }, [conversas, busca]);

  return (
    <div className="flex h-full min-h-0 flex-col border-r bg-muted/10">
      <div className="shrink-0 border-b p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar nome ou telefone..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="h-9 pl-8"
          />
        </div>
        {!isLoading && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            {filtradas.length} conversa{filtradas.length !== 1 ? "s" : ""}
            {busca && ` · de ${conversas.length} totais`}
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading && (
          <div className="space-y-1 p-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-2">
                <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-3 w-2/3" />
                  <Skeleton className="h-2 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && filtradas.length === 0 && (
          <p className="p-6 text-center text-sm text-muted-foreground">
            Nenhuma conversa encontrada.
          </p>
        )}

        <ul className="divide-y">
          {filtradas.map((c) => {
            const ativo = c.telefone_normalizado === selecionada;
            const nomeExibido =
              c.devedor?.nome_devedor ??
              (c.telefone_normalizado
                ? `+${c.telefone_normalizado}`
                : "(sem identificação)");
            return (
              <li key={c.telefone_normalizado}>
                <button
                  type="button"
                  onClick={() => onSelecionar(c.telefone_normalizado)}
                  className={cn(
                    "flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent",
                    ativo && "bg-accent"
                  )}
                >
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarFallback>{iniciais(nomeExibido)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">
                        {nomeExibido}
                      </span>
                      {c.ultima_mensagem && (
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          #{c.ultima_mensagem.id}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.devedor
                        ? formatTelefone(c.devedor.telefone)
                        : `+${c.telefone_normalizado}`}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {mostrarResponsavel && c.devedor && (
                        <span
                          className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground"
                          title="Operador responsável"
                        >
                          <UserRound className="h-3 w-3" />
                          {nomeOperador(operadores, c.devedor.responsavel_id) ??
                            "sem responsável"}
                        </span>
                      )}
                      {c.devedor?.status_negociacao && (
                        <StatusBadge
                          status={c.devedor.status_negociacao}
                        />
                      )}
                      {c.devedor?.status === STATUS_BLOCK_IA && (
                        <span
                          className="inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive"
                          title="IA bloqueada para este devedor"
                        >
                          <Ban className="h-3 w-3" />
                          IA bloqueada
                        </span>
                      )}
                    </div>
                    {c.ultima_mensagem ? (
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        <span
                          className={cn(
                            "font-medium",
                            c.ultima_mensagem.type === "ai"
                              ? "text-primary"
                              : "text-foreground"
                          )}
                        >
                          {c.ultima_mensagem.type === "ai"
                            ? "Fran: "
                            : "Devedor: "}
                        </span>
                        {previewContent(c.ultima_mensagem.content)}
                      </p>
                    ) : (
                      <p className="mt-1 truncate text-xs italic text-muted-foreground">
                        sem mensagens
                      </p>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
