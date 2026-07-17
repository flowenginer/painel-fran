import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { listarAgendamentos } from "@/lib/agenda";
import { hexDaCor } from "@/lib/google-cores";
import { horaCurta } from "@/lib/dates";
import { AgendamentoDialog } from "@/components/agenda/AgendamentoDialog";
import type { AgendamentoComRelacoes, StatusAgendamento } from "@/lib/types";

const STATUS_LABEL: Record<StatusAgendamento, string> = {
  agendado: "Agendado",
  confirmado: "Confirmado",
  compareceu: "Compareceu",
  faltou: "Faltou",
  cancelado: "Cancelado",
};

// YYYY-MM-DD (local) de uma data.
function ymd(d: Date): string {
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

export function Agenda() {
  const queryClient = useQueryClient();
  const [dia, setDia] = useState(() => ymd(new Date()));
  const [formOpen, setFormOpen] = useState(false);
  const [editando, setEditando] = useState<AgendamentoComRelacoes | null>(null);

  // Janela do dia (00:00 → 23:59:59 local) em ISO.
  const { deIso, ateIso } = useMemo(() => {
    const inicio = new Date(`${dia}T00:00:00`);
    const fim = new Date(`${dia}T23:59:59`);
    return { deIso: inicio.toISOString(), ateIso: fim.toISOString() };
  }, [dia]);

  const { data: agendamentos, isLoading } = useQuery({
    queryKey: ["agendamentos", dia],
    queryFn: () => listarAgendamentos(deIso, ateIso),
    staleTime: 10000,
  });

  // Realtime.
  useEffect(() => {
    const canal = supabase
      .channel("agenda_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "agendamentos" },
        () => queryClient.invalidateQueries({ queryKey: ["agendamentos"] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(canal);
    };
  }, [queryClient]);

  function mudarDia(delta: number) {
    const d = new Date(`${dia}T12:00:00`);
    d.setDate(d.getDate() + delta);
    setDia(ymd(d));
  }

  function abrirNovo() {
    setEditando(null);
    setFormOpen(true);
  }

  function abrirEdicao(a: AgendamentoComRelacoes) {
    setEditando(a);
    setFormOpen(true);
  }

  const rotuloDia = new Date(`${dia}T12:00:00`).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Agenda</h1>
          <p className="text-sm text-muted-foreground">
            Agendamentos da clínica (sincroniza com o Google Calendar).
          </p>
        </div>
        <Button onClick={abrirNovo}>
          <Plus className="mr-2 h-4 w-4" />
          Novo agendamento
        </Button>
      </div>

      {/* Navegação de dia */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => mudarDia(-1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" onClick={() => mudarDia(1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="outline" onClick={() => setDia(ymd(new Date()))}>
          Hoje
        </Button>
        <Input
          type="date"
          value={dia}
          onChange={(e) => setDia(e.target.value)}
          className="w-auto"
        />
        <span className="text-sm capitalize text-muted-foreground">
          {rotuloDia}
        </span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Do dia</CardTitle>
          <CardDescription>
            {isLoading
              ? "Carregando..."
              : `${agendamentos?.length ?? 0} agendamento(s)`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!isLoading && (agendamentos?.length ?? 0) === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nenhum agendamento neste dia.
            </p>
          ) : (
            <ul className="space-y-2">
              {agendamentos?.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => abrirEdicao(a)}
                    className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50"
                  >
                    <span
                      className="h-10 w-1.5 shrink-0 rounded-full"
                      style={{
                        backgroundColor: hexDaCor(
                          a.categoria?.google_color_id ?? null,
                        ),
                      }}
                    />
                    <div className="w-20 shrink-0 text-sm font-medium tabular-nums">
                      {horaCurta(a.inicio)}
                      <span className="block text-xs font-normal text-muted-foreground">
                        {horaCurta(a.fim)}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{a.titulo}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {a.paciente?.nome ||
                          a.paciente?.telefone ||
                          "Sem paciente"}
                        {a.categoria ? ` · ${a.categoria.nome}` : ""}
                      </p>
                    </div>
                    <Badge
                      variant={
                        a.status === "cancelado" || a.status === "faltou"
                          ? "secondary"
                          : "default"
                      }
                    >
                      {STATUS_LABEL[a.status]}
                    </Badge>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <AgendamentoDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        inicial={editando}
        dataPadrao={dia}
      />
    </div>
  );
}
