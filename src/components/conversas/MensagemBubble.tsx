import { Image as ImageIcon, Mic, Video, FileText } from "lucide-react";

import { cn } from "@/lib/utils";
import { detectarMidia, type MensagemParsed } from "@/lib/conversas";

interface Props {
  mensagem: MensagemParsed;
}

const ICONES_MIDIA = {
  audio: { Icon: Mic, label: "Áudio" },
  imagem: { Icon: ImageIcon, label: "Imagem" },
  documento: { Icon: FileText, label: "Documento" },
  video: { Icon: Video, label: "Vídeo" },
} as const;

export function MensagemBubble({ mensagem }: Props) {
  const ehFran = mensagem.type === "ai";
  const midia = detectarMidia(mensagem.content);
  const meta = midia ? ICONES_MIDIA[midia] : null;

  return (
    <div
      className={cn(
        "flex w-full",
        ehFran ? "justify-start" : "justify-end"
      )}
    >
      <div
        className={cn(
          "max-w-[80%] rounded-lg px-3 py-2 text-sm shadow-sm",
          ehFran
            ? "rounded-tl-sm bg-muted text-foreground"
            : "rounded-tr-sm bg-primary text-primary-foreground"
        )}
      >
        <div
          className={cn(
            "mb-0.5 text-[10px] font-medium uppercase tracking-wide",
            ehFran
              ? "text-muted-foreground"
              : "text-primary-foreground/70"
          )}
        >
          {ehFran ? "Fran" : "Devedor"}
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
      </div>
    </div>
  );
}
