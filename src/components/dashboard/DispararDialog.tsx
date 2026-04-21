import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { dispararLote } from "@/lib/disparo";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  devedorIds: number[];
  onSuccess: () => void;
}

export function DispararDialog({
  open,
  onOpenChange,
  devedorIds,
  onSuccess,
}: Props) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const total = devedorIds.length;

  async function confirmar() {
    setLoading(true);
    try {
      const resp = await dispararLote({ devedor_ids: devedorIds });

      queryClient.invalidateQueries({ queryKey: ["devedores"] });
      queryClient.invalidateQueries({ queryKey: ["kpis"] });

      if (resp.ok) {
        toast({
          variant: "success",
          title: `${resp.enviados} disparo(s) enviados`,
          description: `Restam ${resp.limite_restante}/${resp.limite_diario} hoje.${
            resp.inelegiveis.length > 0
              ? ` ${resp.inelegiveis.length} inelegível(is) ignorado(s).`
              : ""
          }`,
        });
        onSuccess();
      } else {
        toast({
          variant: "destructive",
          title: "Falha no disparo",
          description: resp.webhook_error ?? "Webhook n8n retornou erro.",
        });
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro ao disparar",
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
    } finally {
      setLoading(false);
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Confirmar disparo</DialogTitle>
          <DialogDescription>
            Enviar primeira mensagem para <strong>{total}</strong> devedor
            {total !== 1 ? "es" : ""}? Esta ação aciona o fluxo da Fran no n8n
            e não pode ser desfeita.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={loading}>
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Disparar agora
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
