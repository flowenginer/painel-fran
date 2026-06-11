import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useConversas } from "@/hooks/useConversas";
import { useConversasRealtime } from "@/hooks/useConversasRealtime";
import { useAuth } from "@/hooks/useAuth";
import { useOperadores } from "@/hooks/useOperadores";
import { ListaConversas } from "@/components/conversas/ListaConversas";
import { ThreadMensagens } from "@/components/conversas/ThreadMensagens";

const TODOS = "todos";

export function Conversas() {
  // Mantém o realtime ativo enquanto a página estiver montada
  useConversasRealtime();

  const { isAdmin } = useAuth();
  const { data: operadores } = useOperadores();
  const [filtroResp, setFiltroResp] = useState<string>(TODOS);

  const { data, isLoading, isFetching, refetch } = useConversas(
    isAdmin && filtroResp !== TODOS ? filtroResp : null
  );
  const [selecionada, setSelecionada] = useState<string | null>(null);

  const conversas = data ?? [];
  const ativa = conversas.find((c) => c.telefone_normalizado === selecionada);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Conversas</h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin
              ? "Histórico das conversas entre a Fran e os devedores. Atualiza em tempo real."
              : "Suas conversas atribuídas. Atualiza em tempo real."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Select value={filtroResp} onValueChange={setFiltroResp}>
              <SelectTrigger className="h-9 w-[200px]">
                <SelectValue placeholder="Filtrar por operador" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos os operadores</SelectItem>
                {(operadores ?? []).map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.nome || o.email || o.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
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
      </div>

      {/* Layout estilo WhatsApp Web: lista | thread */}
      <div className="grid h-[calc(100vh-220px)] min-h-[500px] grid-cols-1 grid-rows-[1fr] overflow-hidden rounded-md border md:grid-cols-[340px_1fr]">
        <div className="min-h-0 overflow-hidden">
          <ListaConversas
            conversas={conversas}
            selecionada={selecionada}
            onSelecionar={setSelecionada}
            isLoading={isLoading}
            mostrarResponsavel={isAdmin}
            operadores={operadores ?? []}
          />
        </div>
        <div className="min-h-0 overflow-hidden">
          <ThreadMensagens conversa={ativa ?? null} />
        </div>
      </div>
    </div>
  );
}
