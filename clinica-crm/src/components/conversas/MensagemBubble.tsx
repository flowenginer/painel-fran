import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { horaCurta } from "@/lib/dates";
import type { Mensagem } from "@/lib/types";

// Renderiza *negrito* estilo WhatsApp.
function renderConteudo(texto: string) {
  const partes = texto.split(/(\*[^*]+\*)/g);
  return partes.map((p, i) => {
    if (p.startsWith("*") && p.endsWith("*") && p.length > 2) {
      return <strong key={i}>{p.slice(1, -1)}</strong>;
    }
    return <span key={i}>{p}</span>;
  });
}

function RenderMidia({ m }: { m: Mensagem }) {
  if (!m.media_url) return null;
  if (m.tipo === "imagem") {
    return (
      <a href={m.media_url} target="_blank" rel="noreferrer">
        <img
          src={m.media_url}
          alt="imagem"
          className="max-h-64 max-w-full rounded-md"
        />
      </a>
    );
  }
  if (m.tipo === "audio") {
    return <audio controls src={m.media_url} className="max-w-full" />;
  }
  if (m.tipo === "video") {
    return (
      <video controls src={m.media_url} className="max-h-64 max-w-full rounded-md" />
    );
  }
  return (
    <a
      href={m.media_url}
      target="_blank"
      rel="noreferrer"
      className="text-sm underline"
    >
      📄 Abrir documento
    </a>
  );
}

export function MensagemBubble({ m }: { m: Mensagem }) {
  const saida = m.direcao === "out";
  return (
    <div className={cn("flex", saida ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm",
          saida
            ? "rounded-br-sm bg-primary text-primary-foreground"
            : "rounded-bl-sm bg-muted text-foreground",
        )}
      >
        {m.media_url && (
          <div className="mb-1">
            <RenderMidia m={m} />
          </div>
        )}
        {m.conteudo && (
          <p className="whitespace-pre-wrap break-words">
            {renderConteudo(m.conteudo)}
          </p>
        )}
        <div
          className={cn(
            "mt-1 flex items-center justify-end gap-1 text-[10px]",
            saida ? "text-primary-foreground/70" : "text-muted-foreground",
          )}
        >
          {horaCurta(m.created_at)}
          {saida && m.enviado_por && <Check className="h-3 w-3" />}
        </div>
      </div>
    </div>
  );
}
