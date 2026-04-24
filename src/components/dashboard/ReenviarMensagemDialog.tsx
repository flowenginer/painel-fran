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
import { formatTelefone } from "@/lib/formatters";
import type { Devedor } from "@/lib/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  devedor: Devedor | null;
}

export function ReenviarMensagemDialog({
  open,
  onOpenChange,
  devedor,
}: Props) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  async function confirmar() {
    if (!devedor) return;
    setLoading(true);
    try {
      const resp = await dispararLote({
        devedor_ids: [devedor.id],
        reenviar: true,
      });
      queryClient.invalidateQueries({ queryKey: ["devedores"] });
      queryClient.invalidateQueries({ queryKey: ["kpis"] });

      if (resp.ok) {
        toast({
          variant: "success",
          title: "Mensagem reenviada",
          description: `Restam ${resp.limite_restante}/${resp.limite_diario} hoje.`,
        });
        onOpenChange(false);
      } else {
        toast({
          variant: "destructive",
          title: "Falha ao reenviar",
          description: resp.webhook_error ?? "Webhook n8n retornou erro.",
        });
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro ao reenviar",
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reenviar 1ª mensagem?</DialogTitle>
          <DialogDescription>
            Vai disparar novamente a primeira mensagem pela Fran. Conta no
            limite diário e no horário permitido. O status e a data do
            primeiro disparo são preservados.
          </DialogDescription>
        </DialogHeader>
        {devedor && (
          <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
            <p className="font-medium">{devedor.nome_devedor}</p>
            <p className="text-xs text-muted-foreground">
              {formatTelefone(devedor.telefone)} · {devedor.instituicao}
            </p>
          </div>
        )}
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
            Reenviar agora
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
