import { useMemo, useState } from "react";
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
import { LeadPanel } from "@/components/conversas/LeadPanel";
import { FiltroPeriodo } from "@/components/conversas/FiltroPeriodo";
import { dentroDoPeriodo, type Periodo } from "@/lib/periodo";
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
  const [periodo, setPeriodo] = useState<Periodo>({ tipo: "todas" });

  const { data, isLoading, isFetching, refetch } = useConversas(
    isAdmin && filtroResp !== TODOS ? filtroResp : null
  );
  const [selecionada, setSelecionada] = useState<string | null>(null);

  const conversas = data ?? [];
  // O thread selecionado persiste mesmo que os filtros o escondam da lista.
  const ativa = conversas.find((c) => c.telefone_normalizado === selecionada);

  // Aplica o filtro de status primeiro; a contagem por período é feita
  // sobre essa base (para os números baterem com o que a data vai mostrar).
  const porStatus = useMemo(
    () =>
      filtroStatus === TODOS
        ? conversas
        : conversas.filter(
            (c) => c.devedor?.status_negociacao === filtroStatus
          ),
    [conversas, filtroStatus]
  );

  const counts = useMemo(() => {
    const conta = (p: Periodo) =>
      porStatus.filter((c) =>
        dentroDoPeriodo(c.ultima_mensagem?.created_at, p)
      ).length;
    return {
      total: porStatus.length,
      hoje: conta({ tipo: "hoje" }),
      ontem: conta({ tipo: "ontem" }),
      semana: conta({ tipo: "semana" }),
    };
  }, [porStatus]);

  const filtradas = useMemo(
    () =>
      porStatus.filter((c) =>
        dentroDoPeriodo(c.ultima_mensagem?.created_at, periodo)
      ),
    [porStatus, periodo]
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-col gap-2 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
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
          <FiltroPeriodo
            value={periodo}
            onChange={setPeriodo}
            counts={counts}
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

      {/* Layout CRM: lista | thread | painel do lead (ocupa a tela toda) */}
      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[1fr] overflow-hidden md:grid-cols-[320px_1fr] lg:grid-cols-[320px_1fr_340px]">
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
