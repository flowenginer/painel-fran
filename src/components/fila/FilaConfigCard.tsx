import { useEffect, useMemo, useState } from "react";
import { Loader2, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConfig } from "@/hooks/useConfig";
import { useSaveConfig } from "@/hooks/useSaveConfig";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// Rótulos dos dias seguindo Date.getDay(): 0=domingo .. 6=sábado.
const DIAS = [
  { idx: 0, label: "Dom" },
  { idx: 1, label: "Seg" },
  { idx: 2, label: "Ter" },
  { idx: 3, label: "Qua" },
  { idx: 4, label: "Qui" },
  { idx: 5, label: "Sex" },
  { idx: 6, label: "Sáb" },
];

interface FormState {
  limiteDiario: string;
  porHora: string;
  horaInicio: string;
  horaFim: string;
  dias: Set<number>;
}

function parseDias(valor: string | undefined): Set<number> {
  const s = new Set<number>();
  for (const parte of (valor ?? "").split(",")) {
    const n = Number(parte.trim());
    if (Number.isInteger(n) && n >= 0 && n <= 6) s.add(n);
  }
  // Vazio = todos os dias.
  if (s.size === 0) for (let i = 0; i <= 6; i++) s.add(i);
  return s;
}

const VAZIO: FormState = {
  limiteDiario: "40",
  porHora: "10",
  horaInicio: "08:00",
  horaFim: "20:00",
  dias: new Set([1, 2, 3, 4, 5]),
};

export function FilaConfigCard() {
  const { data, isLoading } = useConfig();
  const { mutateAsync: salvar, isPending } = useSaveConfig();
  const { toast } = useToast();

  const [form, setForm] = useState<FormState>(VAZIO);
  const [sujo, setSujo] = useState(false);

  useEffect(() => {
    if (data) {
      setForm({
        limiteDiario: data.limite_diario_disparos ?? "40",
        porHora: data.fila_disparos_por_hora ?? "10",
        horaInicio: data.horario_disparo_inicio?.trim() || "08:00",
        horaFim: data.horario_disparo_fim?.trim() || "20:00",
        dias: parseDias(data.fila_dias_semana),
      });
      setSujo(false);
    }
  }, [data]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSujo(true);
  }

  function toggleDia(idx: number) {
    setForm((prev) => {
      const dias = new Set(prev.dias);
      if (dias.has(idx)) dias.delete(idx);
      else dias.add(idx);
      return { ...prev, dias };
    });
    setSujo(true);
  }

  const resumo = useMemo(() => {
    const limite = Number(form.limiteDiario) || 0;
    const hora = Number(form.porHora) || 0;
    return `Até ${hora}/hora, máx ${limite}/dia, entre ${form.horaInicio}–${form.horaFim}.`;
  }, [form]);

  async function handleSalvar() {
    const limite = Number(form.limiteDiario);
    if (!Number.isInteger(limite) || limite <= 0) {
      toast({
        variant: "destructive",
        title: "Limite diário inválido",
        description: "Informe um número inteiro positivo.",
      });
      return;
    }
    const hora = Number(form.porHora);
    if (!Number.isInteger(hora) || hora <= 0) {
      toast({
        variant: "destructive",
        title: "Limite por hora inválido",
        description: "Informe um número inteiro positivo.",
      });
      return;
    }
    const [iH, iM] = form.horaInicio.split(":").map(Number);
    const [fH, fM] = form.horaFim.split(":").map(Number);
    if (iH * 60 + iM >= fH * 60 + fM) {
      toast({
        variant: "destructive",
        title: "Horário inválido",
        description: "O início deve ser anterior ao fim.",
      });
      return;
    }
    if (form.dias.size === 0) {
      toast({
        variant: "destructive",
        title: "Selecione ao menos um dia",
        description: "A fila precisa de pelo menos um dia da semana.",
      });
      return;
    }

    const diasOrdenados = Array.from(form.dias).sort((a, b) => a - b);
    try {
      await salvar([
        { chave: "limite_diario_disparos", valor: String(limite) },
        { chave: "fila_disparos_por_hora", valor: String(hora) },
        { chave: "horario_disparo_inicio", valor: form.horaInicio },
        { chave: "horario_disparo_fim", valor: form.horaFim },
        { chave: "fila_dias_semana", valor: diasOrdenados.join(",") },
      ]);
      toast({ variant: "success", title: "Configurações da fila salvas" });
      setSujo(false);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configurações da fila</CardTitle>
        <CardDescription>{resumo}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs">Limite por dia</Label>
            <Input
              type="number"
              min={1}
              value={form.limiteDiario}
              onChange={(e) => set("limiteDiario", e.target.value)}
              disabled={isLoading}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Limite por hora</Label>
            <Input
              type="number"
              min={1}
              value={form.porHora}
              onChange={(e) => set("porHora", e.target.value)}
              disabled={isLoading}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Horário início</Label>
            <Input
              type="time"
              value={form.horaInicio}
              onChange={(e) => set("horaInicio", e.target.value)}
              disabled={isLoading}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Horário fim</Label>
            <Input
              type="time"
              value={form.horaFim}
              onChange={(e) => set("horaFim", e.target.value)}
              disabled={isLoading}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Dias da semana</Label>
          <div className="flex flex-wrap gap-2">
            {DIAS.map((d) => {
              const ativo = form.dias.has(d.idx);
              return (
                <button
                  key={d.idx}
                  type="button"
                  onClick={() => toggleDia(d.idx)}
                  disabled={isLoading}
                  className={cn(
                    "h-9 w-12 rounded-md border text-sm font-medium transition-colors",
                    ativo
                      ? "border-transparent bg-primary text-primary-foreground hover:bg-primary/80"
                      : "border-input bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                  aria-pressed={ativo}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Nos dias desmarcados a fila não dispara (retoma no próximo dia
            permitido).
          </p>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSalvar} disabled={!sujo || isPending}>
            {isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Salvar configurações
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
