import { Send } from "lucide-react";

import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface ComposerProps {
  /** Janela de 24h fechada (canal oficial) — trava o envio. */
  janelaFechada?: boolean;
}

// Barra de envio. Na fase 3a o envio ainda não está ligado (as Edge Functions
// dos provedores entram na 3b), então o composer fica desabilitado com aviso.
export function Composer({ janelaFechada }: ComposerProps) {
  return (
    <div className="border-t p-3">
      {janelaFechada && (
        <p className="mb-2 text-center text-xs text-amber-600">
          Janela de 24h fechada — só um template reabre a conversa (canal
          oficial).
        </p>
      )}
      <div className="flex items-end gap-2 opacity-60">
        <Textarea
          rows={1}
          disabled
          placeholder="Envio de mensagens chega na próxima fase (3b)…"
          className="min-h-[40px] resize-none"
        />
        <Button type="button" size="icon" disabled aria-label="Enviar">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
