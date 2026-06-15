import { useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { LeadPanel } from "@/components/conversas/LeadPanel";
import type { StatusNegociacao } from "@/lib/types";

const TODOS = "todos";

const STATUS_FILTRO: { value: StatusNegociacao; label: string }[] = [
  { value: "pendente", label: "Pendente" },
  { value: "primeira_msg", label: "1ª Mensagem" },
  { value: "em_negociacao", label: "Em Negociação" },
  { value: "acordo_aceito", label: "Acordo Fechado" },
  { value: "escalado", label: "Escalado" },
  { value: "sem_acordo", label: "Sem Acordo" },
  { value: "aguardando_retorno", label: "Aguardando" },
];

export function Conversas() {
  // Mantém o realtime ativo enquanto a página estiver montada
  useConversasRealtime();

  const { isAdmin } = useAuth();
  const { data: operadores } = useOperadores();
  const [filtroResp, setFiltroResp] = useState<string>(TODOS);
  const [filtroStatus, setFiltroStatus] = useState<string>(TODOS);
  const [filtroData, setFiltroData] = useState<string>("");

  const { data, isLoading, isFetching, refetch } = useConversas(
    isAdmin && filtroResp !== TODOS ? filtroResp : null
  );
  const [selecionada, setSelecionada] = useState<string | null>(null);

  const conversas = data ?? [];
  // O thread selecionado persiste mesmo que os filtros o escondam da lista.
  const ativa = conversas.find((c) => c.telefone_normalizado === selecionada);

  const filtradas = useMemo(() => {
    const inicioData = filtroData
      ? new Date(`${filtroData}T00:00:00-03:00`).getTime()
      : null;
    return conversas.filter((c) => {
      if (filtroStatus !== TODOS) {
        if (c.devedor?.status_negociacao !== filtroStatus) return false;
      }
      if (inicioData != null) {
        const iso = c.ultima_mensagem?.created_at;
        if (!iso) return false;
        if (new Date(iso).getTime() < inicioData) return false;
      }
      return true;
    });
  }, [conversas, filtroStatus, filtroData]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Conversas</h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin
              ? "Atendimento dos leads. Atualiza em tempo real."
              : "Suas conversas atribuídas. Atualiza em tempo real."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <Select value={filtroResp} onValueChange={setFiltroResp}>
              <SelectTrigger className="h-9 w-[170px]">
                <SelectValue placeholder="Operador" />
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
          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
            <SelectTrigger className="h-9 w-[160px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos os status</SelectItem>
              {STATUS_FILTRO.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={filtroData}
            onChange={(e) => setFiltroData(e.target.value)}
            className="h-9 w-[150px]"
            title="Mostrar conversas com mensagem a partir desta data"
          />
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

      {/* Layout CRM: lista | thread | painel do lead */}
      <div className="grid h-[calc(100vh-220px)] min-h-[520px] grid-cols-1 grid-rows-[1fr] overflow-hidden rounded-md border md:grid-cols-[320px_1fr] lg:grid-cols-[320px_1fr_320px]">
        <div className="min-h-0 overflow-hidden">
          <ListaConversas
            conversas={filtradas}
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
        <LeadPanel conversa={ativa ?? null} />
      </div>
    </div>
  );
}
