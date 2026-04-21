import { useState } from "react";
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
import { AdicionarDevedorDialog } from "@/components/adicionar-devedor/AdicionarDevedorDialog";
import { useDevedoresFilters } from "@/hooks/useDevedoresFilters";
import { useDevedoresRealtime } from "@/hooks/useDevedoresRealtime";

export function Dashboard() {
  const { state, setFilters, setPage, setSort, clear, hasFiltersAtivos } =
    useDevedoresFilters();
  const flashIds = useDevedoresRealtime();
  const [adicionarOpen, setAdicionarOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Visão geral da operação. Lista de devedores, filtros e disparos.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAdicionarOpen(true)}
          >
            <Plus className="mr-2 h-4 w-4" />
            Adicionar Devedor
          </Button>
          <Button size="sm" disabled>
            <Send className="mr-2 h-4 w-4" />
            Disparar Campanha
          </Button>
        </div>
      </div>

      <AdicionarDevedorDialog
        open={adicionarOpen}
        onOpenChange={setAdicionarOpen}
      />

      <KpiCards />

      <Card>
        <CardHeader>
          <CardTitle>Devedores</CardTitle>
          <CardDescription>
            Filtros e ordenação salvos na URL. Atualizações da Fran aparecem
            em tempo real.
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
          />
        </CardContent>
      </Card>
    </div>
  );
}
