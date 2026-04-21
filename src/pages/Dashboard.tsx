import { useMemo, useState } from "react";
import { Plus, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DevedoresTable } from "@/components/dashboard/DevedoresTable";
import { FiltrosBar } from "@/components/dashboard/FiltrosBar";
import { KpiCards } from "@/components/dashboard/KpiCards";
import { DispararDialog } from "@/components/dashboard/DispararDialog";
import { AdicionarDevedorDialog } from "@/components/adicionar-devedor/AdicionarDevedorDialog";
import { useDevedoresFilters } from "@/hooks/useDevedoresFilters";
import { useDevedoresRealtime } from "@/hooks/useDevedoresRealtime";
import { useSelecaoDevedores } from "@/hooks/useSelecaoDevedores";
import { useKpis } from "@/hooks/useKpis";
import { useConfig } from "@/hooks/useConfig";
import { horaAtualSaoPaulo } from "@/lib/dates";

function dentroDoHorario(inicio: string, fim: string): boolean {
  const { hora, minuto } = horaAtualSaoPaulo();
  const atual = hora * 60 + minuto;
  const [iH, iM] = inicio.split(":").map(Number);
  const [fH, fM] = fim.split(":").map(Number);
  return atual >= iH * 60 + iM && atual <= fH * 60 + fM;
}

export function Dashboard() {
  const { state, setFilters, setPage, setSort, clear, hasFiltersAtivos } =
    useDevedoresFilters();
  const flashIds = useDevedoresRealtime();
  const { selecionados, toggle, togglePagina, limpar } = useSelecaoDevedores();

  const [adicionarOpen, setAdicionarOpen] = useState(false);
  const [dispararOpen, setDispararOpen] = useState(false);

  const { data: kpis } = useKpis();
  const { data: config } = useConfig();

  const limiteDiario = Number(config?.limite_diario_disparos ?? "40") || 40;
  const disparosHoje = kpis?.disparosHoje ?? 0;
  const restante = Math.max(0, limiteDiario - disparosHoje);

  const horaInicio = config?.horario_disparo_inicio?.trim() || "08:00";
  const horaFim = config?.horario_disparo_fim?.trim() || "20:00";
  const horarioOk = dentroDoHorario(horaInicio, horaFim);

  const selCount = selecionados.size;
  const excedeLimite = selCount > restante;

  const { podeDisparar, motivoBloqueio } = useMemo(() => {
    if (selCount === 0)
      return {
        podeDisparar: false,
        motivoBloqueio: "Selecione ao menos um devedor pendente.",
      };
    if (!horarioOk)
      return {
        podeDisparar: false,
        motivoBloqueio: `Fora do horário permitido (${horaInicio}–${horaFim}, São Paulo).`,
      };
    if (restante <= 0)
      return {
        podeDisparar: false,
        motivoBloqueio: `Limite diário atingido (${disparosHoje}/${limiteDiario}).`,
      };
    if (excedeLimite)
      return {
        podeDisparar: false,
        motivoBloqueio: `Selecionou ${selCount} mas só restam ${restante} hoje.`,
      };
    return { podeDisparar: true, motivoBloqueio: null };
  }, [
    selCount,
    horarioOk,
    horaInicio,
    horaFim,
    restante,
    disparosHoje,
    limiteDiario,
    excedeLimite,
  ]);

  const idsParaDisparar = useMemo(
    () => Array.from(selecionados),
    [selecionados]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Visão geral da operação. Lista de devedores, filtros e disparos.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="text-xs text-muted-foreground"
            title={`Horário de disparo: ${horaInicio}–${horaFim}`}
          >
            <strong className="text-foreground">
              {restante}/{limiteDiario}
            </strong>{" "}
            disparos restantes hoje
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAdicionarOpen(true)}
          >
            <Plus className="mr-2 h-4 w-4" />
            Adicionar Devedor
          </Button>
          <Button
            size="sm"
            disabled={!podeDisparar}
            title={motivoBloqueio ?? undefined}
            onClick={() => setDispararOpen(true)}
          >
            <Send className="mr-2 h-4 w-4" />
            Disparar Campanha
            {selCount > 0 && ` (${selCount})`}
          </Button>
        </div>
      </div>

      {selCount > 0 && motivoBloqueio && (
        <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-700 dark:text-yellow-400">
          ⚠ {motivoBloqueio}
        </div>
      )}

      <AdicionarDevedorDialog
        open={adicionarOpen}
        onOpenChange={setAdicionarOpen}
      />

      <DispararDialog
        open={dispararOpen}
        onOpenChange={setDispararOpen}
        devedorIds={idsParaDisparar}
        onSuccess={limpar}
      />

      <KpiCards />

      <Card>
        <CardHeader>
          <CardTitle>Devedores</CardTitle>
          <CardDescription>
            Selecione pendentes e dispare em lote. Atualizações da Fran
            aparecem em tempo real.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FiltrosBar
            filters={state.filters}
            onChange={setFilters}
            onClear={clear}
            hasFiltersAtivos={hasFiltersAtivos}
          />
          <DevedoresTable
            state={state}
            onPageChange={setPage}
            onSortChange={setSort}
            hasFiltersAtivos={hasFiltersAtivos}
            flashIds={flashIds}
            selecionados={selecionados}
            onToggleSelecionado={toggle}
            onTogglePaginaAtual={togglePagina}
          />
        </CardContent>
      </Card>
    </div>
  );
}
