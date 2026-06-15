import { useRef, useState, type KeyboardEvent } from "react";
import { Loader2, Mic, Paperclip, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useEnviarMensagem } from "@/hooks/useEnviarMensagem";
import { EmojiPicker } from "./EmojiPicker";

interface Props {
  telefoneNormalizado: string | null;
  /** Desabilita o envio (ex.: conversa sem devedor identificado). */
  disabled?: boolean;
}

export function Composer({ telefoneNormalizado, disabled }: Props) {
  const [texto, setTexto] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);
  const { mutateAsync, isPending } = useEnviarMensagem(telefoneNormalizado);

  const podeEnviar =
    !disabled && !!telefoneNormalizado && texto.trim().length > 0 && !isPending;

  async function enviar() {
    const t = texto.trim();
    if (!t || !telefoneNormalizado || isPending) return;
    try {
      await mutateAsync(t);
      setTexto("");
      taRef.current?.focus();
    } catch {
      /* toast de erro já exibido pela mutation */
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void enviar();
    }
  }

  function inserirEmoji(emoji: string) {
    setTexto((t) => t + emoji);
    taRef.current?.focus();
  }

  return (
    <div className="shrink-0 border-t bg-background p-3">
      <div className="flex items-end gap-2">
        <EmojiPicker onSelect={inserirEmoji} />

        {/* Anexo e áudio chegam na Fase B */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-muted-foreground"
          disabled
          title="Anexos chegam em breve"
        >
          <Paperclip className="h-5 w-5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-muted-foreground"
          disabled
          title="Áudio chega em breve"
        >
          <Mic className="h-5 w-5" />
        </Button>

        <Textarea
          ref={taRef}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={
            disabled
              ? "Conversa sem devedor identificado"
              : "Escreva uma mensagem... (Enter envia, Shift+Enter quebra linha)"
          }
          disabled={disabled || !telefoneNormalizado}
          rows={1}
          className="max-h-32 min-h-[40px] flex-1 resize-none"
        />

        <Button
          type="button"
          onClick={() => void enviar()}
          disabled={!podeEnviar}
          className="h-10 shrink-0"
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          <span className="ml-2 hidden sm:inline">Enviar</span>
        </Button>
      </div>
    </div>
  );
}
