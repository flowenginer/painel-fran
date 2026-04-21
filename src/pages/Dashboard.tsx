import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Visão geral da operação. Lista de devedores, filtros e disparos.
        </p>
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
          <CardTitle>Lista de devedores</CardTitle>
          <CardDescription>
            A tabela, filtros, busca e realtime serão implementados nas
            tasks 008–011.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-48 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
            Placeholder da lista de devedores
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
