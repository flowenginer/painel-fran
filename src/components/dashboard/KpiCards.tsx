import { cn } from "@/lib/utils";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useKpis } from "@/hooks/useKpis";
import { useConfig } from "@/hooks/useConfig";

export function KpiCards() {
  const { data: kpis, isLoading } = useKpis();
  const { data: config } = useConfig();

  const limite = Number(config?.limite_diario_disparos ?? "40") || 40;
  const disparosHoje = kpis?.disparosHoje ?? 0;
  const atingiuLimite = disparosHoje >= limite;

  const items = [
    { label: "Total devedores", value: kpis?.total },
    { label: "Em negociação", value: kpis?.emNegociacao },
    { label: "Acordos (mês)", value: kpis?.acordosMes },
    { label: "Escalados", value: kpis?.escalados, warning: kpis?.escalados },
    {
      label: "Disparos hoje",
      value: `${disparosHoje} / ${limite}`,
      warning: atingiuLimite,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((it) => (
        <Card
          key={it.label}
          className={cn(
            it.warning &&
              typeof it.warning === "boolean" &&
              "border-orange-500/40"
          )}
        >
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">{it.label}</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {isLoading ? (
                <Skeleton className="h-7 w-16" />
              ) : (
                (it.value ?? "—")
              )}
            </CardTitle>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}
