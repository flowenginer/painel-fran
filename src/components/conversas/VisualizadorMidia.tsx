import { useEffect, useState } from "react";
import { Download, ExternalLink, Loader2 } from "lucide-react";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { urlMidiaProxy } from "@/lib/midia-proxy";

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

function ehOffice(contentType: string, url: string): boolean {
  const mime = contentType.toLowerCase();
  if (
    mime.includes("word") ||
    mime.includes("excel") ||
    mime.includes("spreadsheet") ||
    mime.includes("presentation") ||
    mime.includes("powerpoint")
  ) {
    return true;
  }
  return /\.(docx?|xlsx?|pptx?)(\?|#|$)/i.test(url);
}

/**
 * Busca o arquivo pelo proxy (que já resolve a auth do Zernio) e devolve um
 * blob: URL local. O tipo/mime que vem junto da mensagem nem sempre bate com
 * a realidade (ex.: o Zernio às vezes marca foto enviada sem compressão como
 * "documento", sem mime) — então a pré-visualização confia no Content-Type
 * de verdade que o proxy devolve, não no rótulo declarado.
 */
export function VisualizadorMidia({ midia, onClose }: Props) {
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [contentType, setContentType] = useState("");

  useEffect(() => {
    if (!midia) return;
    let cancelado = false;
    setCarregando(true);
    setErro(null);
    setBlobUrl(null);
    setContentType("");

    fetch(urlMidiaProxy(midia.url, midia.nome))
      .then(async (resp) => {
        if (!resp.ok) throw new Error(`Falha ao buscar o arquivo (HTTP ${resp.status})`);
        const blob = await resp.blob();
        if (cancelado) return;
        setContentType(resp.headers.get("content-type") || blob.type || "");
        setBlobUrl(URL.createObjectURL(blob));
      })
      .catch((e) => {
        if (!cancelado) setErro(e instanceof Error ? e.message : "Erro ao carregar o arquivo");
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });

    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [midia?.url, midia?.nome]);

  // Libera o blob anterior sempre que um novo é criado (ou o modal fecha).
  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  const ehImagem = contentType.toLowerCase().startsWith("image/");
  const ehPdf = contentType.toLowerCase().includes("pdf");
  const office = ehOffice(contentType, midia?.url ?? "");
  // O visualizador do Office precisa buscar o arquivo pelos servidores da
  // Microsoft — não dá pra usar o blob local, só a URL pública do proxy.
  const officeSrc = midia
    ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(
        urlMidiaProxy(midia.url, midia.nome)
      )}`
    : "";
  const downloadHref = blobUrl ?? (midia ? urlMidiaProxy(midia.url, midia.nome) : "");

  return (
    <Dialog open={!!midia} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl">
        {midia && (
          <div className="space-y-3">
            {carregando ? (
              <div className="flex flex-col items-center gap-2 py-16 text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Carregando pré-visualização…
              </div>
            ) : erro ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center text-sm text-muted-foreground">
                <p>{erro}</p>
              </div>
            ) : ehImagem ? (
              <img
                src={blobUrl ?? ""}
                alt={midia.nome || "imagem"}
                className="mx-auto max-h-[78vh] w-full rounded-md object-contain"
              />
            ) : ehPdf ? (
              <iframe
                src={blobUrl ?? ""}
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
                href={downloadHref}
                download={midia.nome || undefined}
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:underline"
              >
                <Download className="h-4 w-4" />
                Baixar
              </a>
              <a
                href={downloadHref}
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
