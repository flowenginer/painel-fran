import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarCheck,
  MessageSquare,
  UserCheck,
  Users,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { carregarDashboard } from "@/lib/dashboard";
import { ETAPAS_FUNIL } from "@/lib/pacientes-funil";

export function Dashboard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard"],
    queryFn: carregarDashboard,
    staleTime: 30000,
  });

  const etapas = [...ETAPAS_FUNIL].sort((a, b) => a.ordem - b.ordem);
  const maxFunil = data
    ? Math.max(1, ...etapas.map((e) => data.funil[e.id] ?? 0))
    : 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Visão geral: leads, funil, atendimento e origem de anúncio.
        </p>
      </div>

      {isError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          Erro ao carregar o dashboard.
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi
          titulo="Total de leads"
          valor={data?.totalLeads}
          loading={isLoading}
          icon={<Users className="h-4 w-4" />}
        />
        <Kpi
          titulo="Novos (7 dias)"
          valor={data?.novos7d}
          loading={isLoading}
          icon={<UserCheck className="h-4 w-4" />}
        />
        <Kpi
          titulo="Agendados"
          valor={data?.agendados}
          loading={isLoading}
          icon={<CalendarCheck className="h-4 w-4" />}
        />
        <Kpi
          titulo="Conversas não lidas"
          valor={data?.conversasNaoLidas}
          loading={isLoading}
          icon={<MessageSquare className="h-4 w-4" />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Funil */}
        <Card>
          <CardHeader>
            <CardTitle>Funil</CardTitle>
            <CardDescription>Pacientes por etapa</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {etapas.map((e) => {
              const total = data?.funil[e.id] ?? 0;
              const pct = Math.round((total / maxFunil) * 100);
              return (
                <div key={e.id} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span>{e.label}</span>
                    <span className="font-medium tabular-nums">{total}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${isLoading ? 0 : pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Origem de anúncio */}
        <Card>
          <CardHeader>
            <CardTitle>Origem de anúncio</CardTitle>
            <CardDescription>
              Campanhas que mais trouxeram leads (Click-to-WhatsApp)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!isLoading && (data?.origens.length ?? 0) === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Ainda sem atribuição de anúncio. Ela é preenchida quando um lead
                chega pelo canal oficial com dados de campanha.
              </p>
            ) : (
              <ul className="space-y-2">
                {data?.origens.map((o) => (
                  <li
                    key={o.campanha}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="truncate pr-2">{o.campanha}</span>
                    <span className="font-medium tabular-nums">{o.total}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Kpi({
  titulo,
  valor,
  loading,
  icon,
}: {
  titulo: string;
  valor: number | undefined;
  loading: boolean;
  icon: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{titulo}</p>
          <span className="text-muted-foreground">{icon}</span>
        </div>
        <p className="mt-2 text-3xl font-bold tabular-nums">
          {loading ? "—" : (valor ?? 0)}
        </p>
      </CardContent>
    </Card>
  );
}
