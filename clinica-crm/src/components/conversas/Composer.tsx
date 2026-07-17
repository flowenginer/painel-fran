import { useState, type KeyboardEvent } from "react";
import { Loader2, Send } from "lucide-react";

import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useEnviarMensagem } from "@/hooks/useEnviarMensagem";

interface ComposerProps {
  conversaId: number;
  /** Janela de 24h fechada (canal oficial) — trava o envio. */
  janelaFechada?: boolean;
}

export function Composer({ conversaId, janelaFechada }: ComposerProps) {
  const [texto, setTexto] = useState("");
  const enviar = useEnviarMensagem(conversaId);

  function submeter() {
    const t = texto.trim();
    if (!t || enviar.isPending || janelaFechada) return;
    setTexto(""); // limpa na hora (bolha otimista cuida da UI)
    enviar.mutate({ texto: t });
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submeter();
    }
  }

  return (
    <div className="border-t p-3">
      {janelaFechada && (
        <p className="mb-2 text-center text-xs text-amber-600">
          Janela de 24h fechada — só um template reabre a conversa (canal
          oficial).
        </p>
      )}
      <div className="flex items-end gap-2">
        <Textarea
          rows={1}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={janelaFechada}
          placeholder={
            janelaFechada
              ? "Janela fechada — envie um template para reabrir"
              : "Escreva uma mensagem… (Enter envia, Shift+Enter quebra linha)"
          }
          className="max-h-32 min-h-[40px] resize-none"
        />
        <Button
          type="button"
          size="icon"
          aria-label="Enviar"
          disabled={janelaFechada || enviar.isPending || !texto.trim()}
          onClick={submeter}
        >
          {enviar.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
