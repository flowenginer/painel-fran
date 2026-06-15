import { Image as ImageIcon, Mic, Video, FileText } from "lucide-react";

import { cn } from "@/lib/utils";
import { detectarMidia, type MensagemParsed } from "@/lib/conversas";

interface Props {
  mensagem: MensagemParsed;
  /** Nome da operadora que enviou (quando enviado_por estiver setado). */
  autorNome?: string | null;
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

export function MensagemBubble({ mensagem, autorNome }: Props) {
  // "ai" = mensagem nossa (Fran ou operadora) → direita/azul.
  // "human" = mensagem do lead → esquerda/cinza.
  const ehNosso = mensagem.type === "ai";
  const midia = detectarMidia(mensagem.content);
  const meta = midia ? ICONES_MIDIA[midia] : null;
  const hora = formatHora(mensagem.created_at);

  const autor = ehNosso
    ? mensagem.enviado_por
      ? autorNome || "Operadora"
      : "Fran"
    : "Devedor";

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
        <div
          className={cn(
            "mb-0.5 text-[10px] font-medium uppercase tracking-wide",
            ehNosso ? "text-primary-foreground/70" : "text-muted-foreground"
          )}
        >
          {autor}
        </div>
        {meta ? (
          <div className="flex items-center gap-2 italic opacity-90">
            <meta.Icon className="h-4 w-4 shrink-0" />
            <span>[{meta.label}]</span>
          </div>
        ) : (
          <div className="whitespace-pre-wrap break-words">
            {mensagem.content || (
              <span className="italic opacity-60">(sem conteúdo)</span>
            )}
          </div>
        )}
        {hora && (
          <div
            className={cn(
              "mt-0.5 text-right text-[10px]",
              ehNosso ? "text-primary-foreground/60" : "text-muted-foreground"
            )}
          >
            {hora}
          </div>
        )}
      </div>
    </div>
  );
}
