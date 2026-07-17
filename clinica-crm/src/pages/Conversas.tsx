import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useConversasRealtime } from "@/hooks/useConversasRealtime";
import { listarConversas, marcarConversaLida } from "@/lib/conversas";
import { ListaConversas } from "@/components/conversas/ListaConversas";
import { ThreadMensagens } from "@/components/conversas/ThreadMensagens";
import { LeadPanel } from "@/components/conversas/LeadPanel";

type FiltroCanal = "todos" | "zernio" | "uazapi";

export function Conversas() {
  useConversasRealtime();

  const [busca, setBusca] = useState("");
  const [filtroCanal, setFiltroCanal] = useState<FiltroCanal>("todos");
  const [soNaoLidas, setSoNaoLidas] = useState(false);
  const [selecionada, setSelecionada] = useState<number | null>(null);

  const { data: conversas, isLoading } = useQuery({
    queryKey: ["conversas", { busca, filtroCanal, soNaoLidas }],
    queryFn: () =>
      listarConversas({
        busca,
        canalTipo: filtroCanal === "todos" ? null : filtroCanal,
        naoLidas: soNaoLidas,
      }),
    staleTime: 10000,
  });

  const ativa = useMemo(
    () => conversas?.find((c) => c.id === selecionada) ?? null,
    [conversas, selecionada],
  );

  // Marca como lida ao abrir uma conversa não-lida.
  useEffect(() => {
    if (ativa && ativa.nao_lida) {
      void marcarConversaLida(ativa.id);
    }
  }, [ativa]);

  return (
    <div className="grid h-full min-h-0 grid-cols-1 md:grid-cols-[320px_1fr] lg:grid-cols-[320px_1fr_320px]">
      {/* Coluna esquerda: lista */}
      <aside
        className={cn(
          "flex min-h-0 flex-col border-r",
          // No mobile, esconde a lista quando há conversa aberta.
          selecionada != null && "hidden md:flex",
        )}
      >
        <div className="space-y-2 border-b p-3">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou telefone"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-8"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Chip
              ativo={filtroCanal === "todos"}
              onClick={() => setFiltroCanal("todos")}
              label="Todos"
            />
            <Chip
              ativo={filtroCanal === "zernio"}
              onClick={() => setFiltroCanal("zernio")}
              label="Oficial"
            />
            <Chip
              ativo={filtroCanal === "uazapi"}
              onClick={() => setFiltroCanal("uazapi")}
              label="Não-oficial"
            />
            <Chip
              ativo={soNaoLidas}
              onClick={() => setSoNaoLidas((v) => !v)}
              label="Não lidas"
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ListaConversas
            conversas={conversas ?? []}
            selecionada={selecionada}
            onSelecionar={setSelecionada}
            isLoading={isLoading}
          />
        </div>
      </aside>

      {/* Coluna direita: thread */}
      <main className={cn("min-h-0", selecionada == null && "hidden md:block")}>
        {selecionada != null && (
          <button
            type="button"
            onClick={() => setSelecionada(null)}
            className="border-b px-4 py-2 text-sm text-primary md:hidden"
          >
            ← Voltar
          </button>
        )}
        <ThreadMensagens conversa={ativa} />
      </main>

      {/* Coluna direita: dados do lead (só em telas grandes) */}
      <aside className="hidden min-h-0 border-l lg:block">
        <LeadPanel conversa={ativa} />
      </aside>
    </div>
  );
}

function Chip({
  ativo,
  onClick,
  label,
}: {
  ativo: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
        ativo
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input bg-background text-muted-foreground hover:bg-muted",
      )}
    >
      {label}
    </button>
  );
}
