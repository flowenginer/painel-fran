import { useState } from "react";
import { Bot, Copy, Loader2, RefreshCw, Send, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useSugestao } from "@/hooks/useSugestao";
import type { SugestaoTurno } from "@/lib/sugestao";

interface Props {
  telefone: string | null;
}

/**
 * Assistente de sugestão de resposta (IA). Botão flutuante no canto da thread;
 * ao abrir, gera uma sugestão para a última mensagem do devedor. A operadora
 * pode refinar num mini-chat e copiar o texto. Não envia nem grava nada.
 */
export function SugestaoPanel({ telefone }: Props) {
  const [aberto, setAberto] = useState(false);
  const [turnos, setTurnos] = useState<SugestaoTurno[]>([]);
  const [texto, setTexto] = useState("");
  const { mutateAsync, isPending } = useSugestao();
  const { toast } = useToast();

  if (!telefone) return null;

  async function gerar(mensagens: SugestaoTurno[], refino?: string) {
    const base = refino
      ? [...mensagens, { role: "user" as const, content: refino }]
      : mensagens;
    if (refino) setTurnos(base);
    try {
      const sugestao = await mutateAsync({ telefone: telefone!, mensagens: base });
      setTurnos([...base, { role: "assistant", content: sugestao }]);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro na sugestão",
        description: err instanceof Error ? err.message : "Falhou",
      });
    }
  }

  function abrir() {
    setAberto(true);
    if (turnos.length === 0) void gerar([]);
  }

  async function copiar(t: string) {
    try {
      await navigator.clipboard.writeText(t);
      toast({ variant: "success", title: "Copiado!" });
    } catch {
      toast({ variant: "destructive", title: "Não foi possível copiar" });
    }
  }

  function enviarRefino() {
    const t = texto.trim();
    if (!t || isPending) return;
    setTexto("");
    void gerar(turnos, t);
  }

  if (!aberto) {
    return (
      <Button
        onClick={abrir}
        className="absolute bottom-20 right-4 z-10 h-11 w-11 rounded-full bg-orange-500 p-0 text-white shadow-lg hover:bg-orange-600"
        title="Sugestão de resposta (IA)"
      >
        <Bot className="h-5 w-5" />
      </Button>
    );
  }

  return (
    <div className="absolute bottom-20 right-4 z-20 flex h-[26rem] w-80 max-w-[calc(100%-2rem)] flex-col rounded-lg border bg-background shadow-xl">
      <div className="flex shrink-0 items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <Bot className="h-4 w-4 text-orange-500" />
          Sugestão de resposta
        </div>
        <button
          type="button"
          onClick={() => setAberto(false)}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {turnos.length === 0 && !isPending && (
          <p className="text-xs text-muted-foreground">
            Gerando uma sugestão para a última mensagem do devedor…
          </p>
        )}
        {turnos.map((t, i) =>
          t.role === "assistant" ? (
            <div
              key={i}
              className="rounded-md border bg-muted/40 p-2 text-sm"
            >
              <p className="whitespace-pre-wrap">{t.content}</p>
              <div className="mt-1.5 flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => copiar(t.content)}
                >
                  <Copy className="mr-1 h-3.5 w-3.5" />
                  Copiar
                </Button>
              </div>
            </div>
          ) : (
            <div
              key={i}
              className="ml-auto w-fit max-w-[85%] rounded-md bg-primary/10 px-2 py-1 text-xs"
            >
              {t.content}
            </div>
          )
        )}
        {isPending && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Gerando…
          </div>
        )}
      </div>

      <div className="shrink-0 border-t p-2">
        {turnos.some((t) => t.role === "assistant") && (
          <Button
            variant="outline"
            size="sm"
            className="mb-2 w-full text-xs"
            disabled={isPending}
            onClick={() => void gerar([])}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Gerar outra
          </Button>
        )}
        <div className="flex items-center gap-1.5">
          <Input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                enviarRefino();
              }
            }}
            placeholder="Refinar: 'mais curto', 'oferece parcelamento'…"
            className="h-8 text-xs"
            disabled={isPending}
          />
          <Button
            size="sm"
            className="h-8 px-2"
            disabled={isPending || !texto.trim()}
            onClick={enviarRefino}
            title="Refinar"
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
