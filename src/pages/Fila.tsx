import { useMemo, useState } from "react";
import { Loader2, Pause, Play, Trash2, X, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useFila } from "@/hooks/useFila";
import { useFilaStats } from "@/hooks/useFilaStats";
import {
  useCancelarItemFila,
  useEsvaziarFila,
  useProcessarFilaAgora,
} from "@/hooks/useFilaMutations";
import { useConfig } from "@/hooks/useConfig";
import { useSaveConfig } from "@/hooks/useSaveConfig";
import { useToast } from "@/hooks/use-toast";
import { formatBRL } from "@/lib/formatters";
import { FilaConfigCard } from "@/components/fila/FilaConfigCard";

// Estimativa de quanto tempo a fila atual leva para esvaziar, dado o teto
// diário e a janela de horário. Puramente informativa.
function estimarDias(naFila: number, limiteDiario: number): string {
  if (naFila === 0) return "—";
  if (limiteDiario <= 0) return "indefinido";
  const dias = Math.ceil(naFila / limiteDiario);
  return dias === 1 ? "hoje (~1 dia)" : `~${dias} dias`;
}

export function Fila() {
  const { data: itens, isLoading } = useFila("na_fila");
  const { data: stats } = useFilaStats();
  const { data: config } = useConfig();

  const cancelar = useCancelarItemFila();
  const esvaziar = useEsvaziarFila();
  const processar = useProcessarFilaAgora();
  const { mutateAsync: salvarConfig, isPending: salvandoConfig } =
    useSaveConfig();
  const { toast } = useToast();

  const [confirmEsvaziar, setConfirmEsvaziar] = useState(false);

  const filaAtiva = (config?.fila_ativa ?? "false") === "true";
  const porHora = Number(config?.fila_disparos_por_hora ?? "10") || 0;
  const limiteDiario = Number(config?.limite_diario_disparos ?? "40") || 0;
  const horaInicio = config?.horario_disparo_inicio?.trim() || "08:00";
  const horaFim = config?.horario_disparo_fim?.trim() || "20:00";

  const naFila = stats?.naFila ?? itens?.length ?? 0;
  const previsao = useMemo(
    () => estimarDias(naFila, limiteDiario),
    [naFila, limiteDiario]
  );

  async function togglePausa() {
    try {
      await salvarConfig([
        { chave: "fila_ativa", valor: filaAtiva ? "false" : "true" },
      ]);
      toast({
        variant: "success",
        title: filaAtiva ? "Fila pausada" : "Fila ativada",
        description: filaAtiva
          ? "O processamento automático foi interrompido."
          : `Disparando até ${porHora}/hora, máx ${limiteDiario}/dia, entre ${horaInicio}–${horaFim}.`,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro ao alterar a fila",
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
    }
  }

  async function handleProcessar() {
    try {
      const r = await processar.mutateAsync();
      if (r.enviados > 0) {
        toast({
          variant: "success",
          title: `${r.enviados} disparo(s) enviados`,
          description: `Restam ${r.restante_dia ?? "?"} hoje (limite ${
            r.limite_diario ?? limiteDiario
          }).`,
        });
      } else {
        toast({
          title: "Nenhum disparo neste ciclo",
          description: descreverMotivo(r.motivo, { horaInicio, horaFim }),
        });
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro ao processar fila",
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
    }
  }

  async function handleEsvaziar() {
    try {
      await esvaziar.mutateAsync();
      toast({ variant: "success", title: "Fila esvaziada" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro ao esvaziar",
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
    } finally {
      setConfirmEsvaziar(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Fila de Disparo
          </h1>
          <p className="text-sm text-muted-foreground">
            Distribuição automática em gotejamento: até {porHora}/hora, máx{" "}
            {limiteDiario}/dia, entre {horaInicio}–{horaFim}. Ao bater o
            limite, retoma no dia seguinte.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={filaAtiva ? "default" : "secondary"}>
            {filaAtiva ? "Ativa" : "Pausada"}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={togglePausa}
            disabled={salvandoConfig}
          >
            {filaAtiva ? (
              <Pause className="mr-2 h-4 w-4" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            {filaAtiva ? "Pausar" : "Ativar"}
          </Button>
          <Button
            size="sm"
            onClick={handleProcessar}
            disabled={processar.isPending}
            title="Processa uma leva agora, sem esperar o ciclo automático"
          >
            {processar.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Zap className="mr-2 h-4 w-4" />
            )}
            Processar agora
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Na fila" value={naFila} />
        <StatCard label="Enviados hoje" value={stats?.enviadosHoje ?? 0} />
        <StatCard label="Já disparados (fila)" value={stats?.enviados ?? 0} />
        <StatCard label="Previsão para esvaziar" value={previsao} />
      </div>

      <FilaConfigCard />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Aguardando disparo</CardTitle>
            <CardDescription>
              Ordem de processamento (primeiro a sair no topo).
            </CardDescription>
          </div>
          {naFila > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmEsvaziar(true)}
              disabled={esvaziar.isPending}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Esvaziar fila
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !itens || itens.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Fila vazia. Selecione devedores no Dashboard e use{" "}
              <strong>“Enviar para fila”</strong>.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Devedor</TableHead>
                  <TableHead>Instituição</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Campanha</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itens.map((item, idx) => (
                  <TableRow key={item.id}>
                    <TableCell className="text-muted-foreground">
                      {idx + 1}
                    </TableCell>
                    <TableCell className="font-medium">
                      {item.devedor?.nome_devedor ?? `#${item.devedor_id}`}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {item.devedor?.instituicao ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {item.devedor?.telefone ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatBRL(item.devedor?.valor_atualizado)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {item.campanha ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="Remover da fila"
                        onClick={() => cancelar.mutate(item.id)}
                        disabled={cancelar.isPending}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={confirmEsvaziar} onOpenChange={setConfirmEsvaziar}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Esvaziar a fila?</DialogTitle>
            <DialogDescription>
              Os {naFila} devedor(es) aguardando serão removidos da fila
              (marcados como cancelados). Eles continuam na base e podem ser
              enfileirados de novo. Disparos já enviados não são afetados.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmEsvaziar(false)}
              disabled={esvaziar.isPending}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleEsvaziar}
              disabled={esvaziar.isPending}
            >
              {esvaziar.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Esvaziar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-bold tracking-tight">{value}</div>
      </CardContent>
    </Card>
  );
}

function descreverMotivo(
  motivo: string | undefined,
  janela: { horaInicio: string; horaFim: string }
): string {
  switch (motivo) {
    case "fila_pausada":
      return "A fila está pausada. Clique em “Ativar”.";
    case "fila_vazia":
      return "Não há devedores aguardando na fila.";
    case "fora_horario":
      return `Fora da janela de horário (${janela.horaInicio}–${janela.horaFim}).`;
    case "fora_dia_semana":
      return "Hoje não é um dia de disparo configurado.";
    case "limite_diario_atingido":
      return "Limite diário já atingido. Retoma amanhã.";
    case "limite_hora_atingido":
      return "Teto desta hora atingido. Próxima leva na próxima hora.";
    case "taxa_por_hora_zerada":
      return "Defina a taxa por hora nas Configurações.";
    case "nenhum_elegivel":
      return "Os itens da fila não estavam mais elegíveis.";
    default:
      return "Sem quota disponível neste momento.";
  }
}
