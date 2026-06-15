import { Image as ImageIcon, Mic, Video, FileText, Check } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { detectarMidia, type MensagemParsed } from "@/lib/conversas";
import type { MidiaAberta } from "./VisualizadorMidia";

interface Props {
  mensagem: MensagemParsed;
  /** Nome da operadora que enviou (quando enviado_por estiver setado). */
  autorNome?: string | null;
  /** Abre imagem/documento no visualizador interno (modal). */
  onAbrirMidia?: (midia: MidiaAberta) => void;
}

const ICONES_MIDIA = {
  audio: { Icon: Mic, label: "Áudio" },
  imagem: { Icon: ImageIcon, label: "Imagem" },
  documento: { Icon: FileText, label: "Documento" },
  video: { Icon: Video, label: "Vídeo" },
} as const;

function formatHora(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

// Renderiza *negrito* no estilo WhatsApp (usado na assinatura "*Nome:*").
function renderConteudo(content: string): ReactNode {
  const partes = content.split(/(\*[^*\n]+\*)/g);
  return partes.map((parte, i) => {
    if (/^\*[^*\n]+\*$/.test(parte)) {
      return <strong key={i}>{parte.slice(1, -1)}</strong>;
    }
    return <span key={i}>{parte}</span>;
  });
}

// Tipo de mídia: usa media_tipo se vier; senão deduz pelo mime.
function tipoMidia(m: MensagemParsed): "audio" | "imagem" | "documento" | "video" {
  const t = (m.media_tipo || "").toLowerCase();
  if (t === "audio" || t === "imagem" || t === "documento" || t === "video") {
    return t;
  }
  const mime = (m.media_mime || "").toLowerCase();
  if (mime.startsWith("audio")) return "audio";
  if (mime.startsWith("image")) return "imagem";
  if (mime.startsWith("video")) return "video";
  return "documento";
}

function RenderMidia({
  m,
  onAbrirMidia,
}: {
  m: MensagemParsed;
  onAbrirMidia?: (midia: MidiaAberta) => void;
}) {
  const url = m.media_url as string;
  const tipo = tipoMidia(m);

  if (tipo === "audio") {
    return <audio controls preload="metadata" src={url} className="w-60 max-w-full" />;
  }
  if (tipo === "imagem") {
    return (
      <button
        type="button"
        onClick={() =>
          onAbrirMidia?.({ url, tipo, nome: m.media_nome, mime: m.media_mime })
        }
        className="block"
        title="Ampliar"
      >
        <img
          src={url}
          alt="imagem"
          className="max-h-64 max-w-full cursor-pointer rounded-md object-contain"
        />
      </button>
    );
  }
  if (tipo === "video") {
    return (
      <video controls src={url} className="max-h-64 max-w-full rounded-md" />
    );
  }
  return (
    <button
      type="button"
      onClick={() =>
        onAbrirMidia?.({ url, tipo, nome: m.media_nome, mime: m.media_mime })
      }
      className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent/40"
    >
      <FileText className="h-4 w-4 shrink-0" />
      {m.media_nome || "Abrir documento"}
    </button>
  );
}

export function MensagemBubble({ mensagem, autorNome, onAbrirMidia }: Props) {
  // "ai" = mensagem nossa (Fran ou operadora) → direita/azul.
  // "human" = mensagem do lead → esquerda/cinza.
  const ehNosso = mensagem.type === "ai";
  const ehOperadora = ehNosso && !!mensagem.enviado_por;
  const temMidia = !!mensagem.media_url;
  const placeholder = temMidia ? null : detectarMidia(mensagem.content);
  const meta = placeholder ? ICONES_MIDIA[placeholder] : null;
  const hora = formatHora(mensagem.created_at);

  // Rótulo: operadora não mostra (a assinatura "*Nome:*" já vai no texto).
  const label = ehNosso ? (ehOperadora ? null : "Fran") : "Devedor";

  return (
    <div className={cn("flex w-full", ehNosso ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-lg px-3 py-2 text-sm shadow-sm",
          ehNosso
            ? "rounded-tr-sm bg-primary text-primary-foreground"
            : "rounded-tl-sm bg-muted text-foreground"
        )}
      >
        {label && (
          <div
            className={cn(
              "mb-0.5 text-[10px] font-medium uppercase tracking-wide",
              ehNosso ? "text-primary-foreground/70" : "text-muted-foreground"
            )}
          >
            {label}
          </div>
        )}

        {temMidia ? (
          <div className="space-y-1">
            <RenderMidia m={mensagem} onAbrirMidia={onAbrirMidia} />
            {mensagem.transcricao && (
              <p className="text-xs italic opacity-80">
                “{mensagem.transcricao}”
              </p>
            )}
          </div>
        ) : meta ? (
          <div className="flex items-center gap-2 italic opacity-90">
            <meta.Icon className="h-4 w-4 shrink-0" />
            <span>[{meta.label}]</span>
          </div>
        ) : (
          <div className="whitespace-pre-wrap break-words">
            {mensagem.content ? (
              renderConteudo(mensagem.content)
            ) : (
              <span className="italic opacity-60">(sem conteúdo)</span>
            )}
          </div>
        )}

        <div
          className={cn(
            "mt-0.5 flex items-center justify-end gap-1 text-[10px]",
            ehNosso ? "text-primary-foreground/60" : "text-muted-foreground"
          )}
        >
          {autorNome && ehOperadora && (
            <span className="mr-auto opacity-80">{autorNome}</span>
          )}
          {hora && <span>{hora}</span>}
          {/* Enviado (✓). Entregue/lido dependem de receipts da UAZAPI. */}
          {ehOperadora && <Check className="h-3 w-3" />}
        </div>
      </div>
    </div>
  );
}
