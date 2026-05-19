import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useConversas } from "@/hooks/useConversas";
import { useConversasRealtime } from "@/hooks/useConversasRealtime";
import { ListaConversas } from "@/components/conversas/ListaConversas";
import { ThreadMensagens } from "@/components/conversas/ThreadMensagens";

export function Conversas() {
  // Mantém o realtime ativo enquanto a página estiver montada
  useConversasRealtime();

  const { data, isLoading, isFetching, refetch } = useConversas();
  const [selecionada, setSelecionada] = useState<string | null>(null);

  const conversas = data ?? [];
  const ativa = conversas.find(
    (c) => c.telefone_normalizado === selecionada
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Conversas</h1>
          <p className="text-sm text-muted-foreground">
            Histórico das conversas entre a Fran e os devedores. Atualiza
            em tempo real.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void refetch()}
          disabled={isFetching}
        >
          {isFetching ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Atualizar
        </Button>
      </div>

      {/* Layout estilo WhatsApp Web: lista | thread */}
      <div className="grid h-[calc(100vh-220px)] min-h-[500px] grid-cols-1 grid-rows-[1fr] overflow-hidden rounded-md border md:grid-cols-[340px_1fr]">
        <div className="min-h-0 overflow-hidden">
          <ListaConversas
            conversas={conversas}
            selecionada={selecionada}
            onSelecionar={setSelecionada}
            isLoading={isLoading}
          />
        </div>
        <div className="min-h-0 overflow-hidden">
          <ThreadMensagens conversa={ativa ?? null} />
        </div>
      </div>
    </div>
  );
}
