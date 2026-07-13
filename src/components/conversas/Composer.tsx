import {
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import {
  FileText,
  Loader2,
  Mic,
  Paperclip,
  Send,
  Square,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useEnviarMensagem } from "@/hooks/useEnviarMensagem";
import { useToast } from "@/hooks/use-toast";
import { uploadMidia } from "@/lib/storage";
import type { TipoEnvio } from "@/lib/mensagens";
import { EmojiPicker } from "./EmojiPicker";

interface Props {
  telefoneNormalizado: string | null;
  /** Canal da conversa (ex.: "zernio:..."), para rotear o envio sem consulta extra. */
  canal?: string | null;
  /** Desabilita o envio (ex.: conversa sem devedor identificado). */
  disabled?: boolean;
}

interface Anexo {
  file: File;
  tipo: "imagem" | "documento";
  preview?: string;
}

export function Composer({ telefoneNormalizado, canal, disabled }: Props) {
  const [texto, setTexto] = useState("");
  const [anexo, setAnexo] = useState<Anexo | null>(null);
  const [audio, setAudio] = useState<{ blob: Blob; url: string } | null>(null);
  const [gravando, setGravando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const mrRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const { mutateAsync } = useEnviarMensagem(telefoneNormalizado, canal);
  const { toast } = useToast();

  const temMidia = !!anexo || !!audio;
  const bloqueado = disabled || !telefoneNormalizado;
  const podeEnviar =
    !bloqueado &&
    !enviando &&
    !gravando &&
    (temMidia || texto.trim().length > 0);

  function escolherArquivo(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const tipo = f.type.startsWith("image/") ? "imagem" : "documento";
    setAudio(null);
    setAnexo({
      file: f,
      tipo,
      preview: tipo === "imagem" ? URL.createObjectURL(f) : undefined,
    });
  }

  async function iniciarGravacao() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (ev) => {
        if (ev.data.size) chunksRef.current.push(ev.data);
      };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: mr.mimeType || "audio/webm",
        });
        setAnexo(null);
        setAudio({ blob, url: URL.createObjectURL(blob) });
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start();
      mrRef.current = mr;
      setGravando(true);
    } catch {
      toast({
        variant: "destructive",
        title: "Microfone bloqueado",
        description: "Permita o acesso ao microfone para gravar áudio.",
      });
    }
  }

  function pararGravacao() {
    mrRef.current?.stop();
    setGravando(false);
  }

  function cancelarMidia() {
    setAnexo(null);
    setAudio(null);
  }

  async function enviar() {
    if (!telefoneNormalizado || enviando || gravando) return;
    const caption = texto.trim();
    if (!temMidia && !caption) return;

    // Texto puro: envio otimista — limpa o campo na hora e não bloqueia.
    // A bolha aparece imediatamente (onMutate) e o request roda em background.
    if (!temMidia) {
      setTexto("");
      taRef.current?.focus();
      mutateAsync({ texto: caption }).catch(() => {
        /* erro já tratado no onError da mutation */
      });
      return;
    }

    // Mídia: precisa subir o arquivo antes de enviar, então mantém o spinner.
    setEnviando(true);
    let tipo: TipoEnvio = "texto";
    let mediaUrl: string | null = null;

    try {
      if (audio) {
        tipo = "audio";
        mediaUrl = await uploadMidia(audio.blob, `gravacao-${Date.now()}.webm`);
      } else if (anexo) {
        tipo = anexo.tipo;
        mediaUrl = await uploadMidia(anexo.file, anexo.file.name);
      }
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Falha no upload",
        description: e instanceof Error ? e.message : "Erro ao subir o arquivo",
      });
      setEnviando(false);
      return;
    }

    try {
      await mutateAsync({ tipo, media_url: mediaUrl, texto: caption });
      setTexto("");
      setAnexo(null);
      setAudio(null);
      taRef.current?.focus();
    } catch {
      /* erro de envio já exibido pela mutation */
    } finally {
      setEnviando(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void enviar();
    }
  }

  return (
    <div className="shrink-0 border-t bg-background p-3">
      {/* Pré-visualização da mídia pendente */}
      {(temMidia || gravando) && (
        <div className="mb-2 flex items-center gap-3 rounded-md border bg-muted/30 p-2">
          {gravando ? (
            <span className="flex items-center gap-2 text-sm text-destructive">
              <span className="h-2 w-2 animate-pulse rounded-full bg-destructive" />
              Gravando áudio…
            </span>
          ) : audio ? (
            <audio controls src={audio.url} className="h-9 max-w-[260px]" />
          ) : anexo?.tipo === "imagem" ? (
            <img
              src={anexo.preview}
              alt="anexo"
              className="h-14 w-14 rounded object-cover"
            />
          ) : (
            <span className="flex items-center gap-2 truncate text-sm">
              <FileText className="h-4 w-4 shrink-0" />
              {anexo?.file.name}
            </span>
          )}
          <div className="flex-1" />
          {!gravando && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={cancelarMidia}
              title="Remover"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}

      <div className="flex items-end gap-2">
        <EmojiPicker onSelect={(e) => setTexto((t) => t + e)} />

        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
          className="hidden"
          onChange={escolherArquivo}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-muted-foreground"
          disabled={bloqueado || gravando || enviando}
          onClick={() => fileRef.current?.click()}
          title="Anexar imagem ou arquivo"
        >
          <Paperclip className="h-5 w-5" />
        </Button>

        <Button
          type="button"
          variant={gravando ? "destructive" : "ghost"}
          size="icon"
          className="h-9 w-9"
          disabled={bloqueado || enviando}
          onClick={gravando ? pararGravacao : iniciarGravacao}
          title={gravando ? "Parar gravação" : "Gravar áudio"}
        >
          {gravando ? (
            <Square className="h-4 w-4" />
          ) : (
            <Mic className="h-5 w-5 text-muted-foreground" />
          )}
        </Button>

        <Textarea
          ref={taRef}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={
            bloqueado
              ? "Conversa sem devedor identificado"
              : temMidia
                ? "Legenda (opcional)…"
                : "Escreva uma mensagem... (Enter envia, Shift+Enter quebra linha)"
          }
          disabled={bloqueado || gravando}
          rows={1}
          className="max-h-32 min-h-[40px] flex-1 resize-none"
        />

        <Button
          type="button"
          onClick={() => void enviar()}
          disabled={!podeEnviar}
          className="h-10 shrink-0"
        >
          {enviando ? (
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
