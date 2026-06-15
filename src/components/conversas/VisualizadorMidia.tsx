import { ExternalLink } from "lucide-react";

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

export function VisualizadorMidia({ midia, onClose }: Props) {
  const ehImagem = midia?.tipo === "imagem";
  const ehPdf =
    !!midia &&
    (midia.tipo === "documento"
      ? (midia.mime || "").includes("pdf") ||
        (midia.url || "").toLowerCase().includes(".pdf")
      : false);

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
            ) : ehPdf ? (
              <iframe
                src={midia.url}
                title={midia.nome || "documento"}
                className="h-[78vh] w-full rounded-md border"
              />
            ) : (
              <div className="flex flex-col items-center gap-3 py-10 text-center text-sm text-muted-foreground">
                <p>
                  Este tipo de arquivo não pode ser pré-visualizado aqui.
                </p>
              </div>
            )}

            <div className="flex justify-end">
              <a
                href={midia.url}
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
