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

const kpis = [
  { label: "Total devedores", value: "—" },
  { label: "Em negociação", value: "—" },
  { label: "Acordos (mês)", value: "—" },
  { label: "Escalados", value: "—" },
  { label: "Disparos hoje", value: "0 / 40" },
];

export function Dashboard() {
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
          <Button variant="outline" size="sm" disabled>
            <Plus className="mr-2 h-4 w-4" />
            Adicionar Devedor
          </Button>
          <Button size="sm" disabled>
            <Send className="mr-2 h-4 w-4" />
            Disparar Campanha
          </Button>
        </div>
      </div>

      {/* KPIs — valores reais entram na TASK-010 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardHeader className="pb-2">
              <CardDescription className="text-xs">{kpi.label}</CardDescription>
              <CardTitle className="text-2xl">{kpi.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Devedores</CardTitle>
          <CardDescription>
            Filtros, busca e Realtime serão implementados nas tasks 009 e 011.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DevedoresTable />
        </CardContent>
      </Card>
    </div>
  );
}
