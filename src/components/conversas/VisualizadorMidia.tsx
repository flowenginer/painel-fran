import { Download, ExternalLink } from "lucide-react";

import { Dialog, DialogContent } from "@/components/ui/dialog";

export interface MidiaAberta {
  url: string;
  tipo: string; // "imagem" | "documento" | "video" | ...
  nome?: string | null;
  mime?: string | null;
}

interface Props {
  midia: MidiaAberta | null;
  onClose: () => void;
}

// URL do proxy de mídia (Edge Function). Busca o arquivo no servidor e devolve
// inline, com content-type certo e SEM X-Frame-Options — assim o navegador
// renderiza PDF nativamente e o UAZAPI para de recusar o iframe.
function urlProxy(m: MidiaAberta): string {
  const base = import.meta.env.VITE_SUPABASE_URL;
  const qs = new URLSearchParams({ url: m.url });
  if (m.nome) qs.set("nome", m.nome);
  return `${base}/functions/v1/midia-proxy?${qs.toString()}`;
}

function ehPdf(m: MidiaAberta): boolean {
  return (
    (m.mime ?? "").toLowerCase().includes("pdf") ||
    /\.pdf(\?|#|$)/i.test(m.url)
  );
}

function ehOffice(m: MidiaAberta): boolean {
  const mime = (m.mime ?? "").toLowerCase();
  if (
    mime.includes("word") ||
    mime.includes("excel") ||
    mime.includes("spreadsheet") ||
    mime.includes("presentation") ||
    mime.includes("powerpoint")
  ) {
    return true;
  }
  return /\.(docx?|xlsx?|pptx?)(\?|#|$)/i.test(m.url);
}

export function VisualizadorMidia({ midia, onClose }: Props) {
  const proxied = midia ? urlProxy(midia) : "";
  const ehImagem = midia?.tipo === "imagem";
  const pdf = midia ? ehPdf(midia) : false;
  const office = midia ? ehOffice(midia) : false;
  const officeSrc = midia
    ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(proxied)}`
    : "";

  return (
    <Dialog open={!!midia} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl">
        {midia && (
          <div className="space-y-3">
            {ehImagem ? (
              <img
                src={midia.url}
                alt={midia.nome || "imagem"}
                className="mx-auto max-h-[78vh] w-full rounded-md object-contain"
              />
            ) : pdf ? (
              <iframe
                src={proxied}
                title={midia.nome || "documento"}
                className="h-[78vh] w-full rounded-md border bg-white"
              />
            ) : office ? (
              <iframe
                src={officeSrc}
                title={midia.nome || "documento"}
                className="h-[78vh] w-full rounded-md border bg-white"
              />
            ) : (
              <div className="flex flex-col items-center gap-3 py-10 text-center text-sm text-muted-foreground">
                <p>
                  Este tipo de arquivo não tem pré-visualização. Use os botões
                  abaixo para abrir ou baixar.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-4">
              <a
                href={proxied}
                download={midia.nome || undefined}
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:underline"
              >
                <Download className="h-4 w-4" />
                Baixar
              </a>
              <a
                href={proxied}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                <ExternalLink className="h-4 w-4" />
                Abrir em nova aba
              </a>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
