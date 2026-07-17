import { useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { Loader2, Mic, Paperclip, Send, Square } from "lucide-react";

import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useEnviarMensagem } from "@/hooks/useEnviarMensagem";
import { uploadMidia } from "@/lib/storage";
import { EmojiPicker } from "./EmojiPicker";

interface ComposerProps {
  conversaId: number;
  janelaFechada?: boolean;
}

export function Composer({ conversaId, janelaFechada }: ComposerProps) {
  const { toast } = useToast();
  const [texto, setTexto] = useState("");
  const [enviandoMidia, setEnviandoMidia] = useState(false);
  const [gravando, setGravando] = useState(false);
  const enviar = useEnviarMensagem(conversaId);

  const fileRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const ocupado = enviar.isPending || enviandoMidia;

  function submeter() {
    const t = texto.trim();
    if (!t || ocupado || janelaFechada) return;
    setTexto("");
    enviar.mutate({ texto: t });
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submeter();
    }
  }

  async function enviarArquivo(file: File) {
    setEnviandoMidia(true);
    try {
      const m = await uploadMidia(file);
      enviar.mutate({ texto: "", tipo: m.tipo, media_url: m.url });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Falha no upload",
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
    } finally {
      setEnviandoMidia(false);
    }
  }

  function onArquivo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite reenviar o mesmo arquivo
    if (file) void enviarArquivo(file);
  }

  async function iniciarGravacao() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const file = new File([blob], "audio.webm", { type: "audio/webm" });
        void enviarArquivo(file);
      };
      recRef.current = rec;
      rec.start();
      setGravando(true);
    } catch {
      toast({
        variant: "destructive",
        title: "Microfone indisponível",
        description: "Permita o acesso ao microfone para gravar áudio.",
      });
    }
  }

  function pararGravacao() {
    recRef.current?.stop();
    recRef.current = null;
    setGravando(false);
  }

  return (
    <div className="border-t p-3">
      {janelaFechada && (
        <p className="mb-2 text-center text-xs text-amber-600">
          Janela de 24h fechada — só um template reabre a conversa (canal
          oficial).
        </p>
      )}
      <div className="flex items-end gap-1.5">
        <EmojiPicker onSelect={(e) => setTexto((t) => t + e)} />

        <input
          ref={fileRef}
          type="file"
          className="hidden"
          accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx"
          onChange={onArquivo}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0"
          disabled={janelaFechada || ocupado}
          onClick={() => fileRef.current?.click()}
          aria-label="Anexar"
        >
          <Paperclip className="h-5 w-5" />
        </Button>

        <Textarea
          rows={1}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={janelaFechada || gravando}
          placeholder={
            gravando
              ? "Gravando áudio…"
              : janelaFechada
                ? "Janela fechada — envie um template para reabrir"
                : "Escreva uma mensagem… (Enter envia, Shift+Enter quebra linha)"
          }
          className="max-h-32 min-h-[40px] resize-none"
        />

        {/* Áudio: alterna gravar/parar */}
        {gravando ? (
          <Button
            type="button"
            size="icon"
            variant="destructive"
            className="shrink-0"
            onClick={pararGravacao}
            aria-label="Parar e enviar"
          >
            <Square className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="shrink-0"
            disabled={janelaFechada || ocupado}
            onClick={iniciarGravacao}
            aria-label="Gravar áudio"
          >
            <Mic className="h-5 w-5" />
          </Button>
        )}

        {/* Enviar texto */}
        <Button
          type="button"
          size="icon"
          className="shrink-0"
          disabled={janelaFechada || ocupado || !texto.trim()}
          onClick={submeter}
          aria-label="Enviar"
        >
          {ocupado ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
