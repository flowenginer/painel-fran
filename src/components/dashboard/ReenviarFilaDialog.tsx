import { Loader2, RefreshCw } from "lucide-react";

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
import { useEnfileirar } from "@/hooks/useFilaMutations";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  devedorIds: number[];
  onSuccess: () => void;
}

export function ReenviarFilaDialog({
  open,
  onOpenChange,
  devedorIds,
  onSuccess,
}: Props) {
  const { toast } = useToast();
  const enfileirar = useEnfileirar();
  const total = devedorIds.length;

  async function confirmar() {
    try {
      const r = await enfileirar.mutateAsync({ devedorIds, reenvio: true });
      const partes: string[] = [];
      if (r.jaNaFila > 0) partes.push(`${r.jaNaFila} já estavam na fila`);
      if (r.naoElegiveis > 0)
        partes.push(`${r.naoElegiveis} ignorado(s) (negociação/acordo)`);
      if (r.enfileirados > 0) {
        toast({
          variant: "success",
          title: `${r.enfileirados} reenvio(s) na fila`,
          description: partes.length
            ? partes.join(". ") + ". Vão sair em gotejamento."
            : "Vão sair em gotejamento.",
        });
        onSuccess();
      } else {
        toast({
          title: "Nada enfileirado",
          description: partes.length
            ? partes.join(". ") + "."
            : "Nenhum contato elegível para reenvio.",
        });
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro ao enfileirar reenvio",
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
    } finally {
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reenviar 1ª mensagem pela fila</DialogTitle>
          <DialogDescription>
            Colocar <strong>{total}</strong> contato{total !== 1 ? "s" : ""} na
            fila para reenvio da 1ª mensagem. Vão sair em{" "}
            <strong>gotejamento</strong> (respeitando limites, horário e o
            rodízio de canais conectados). Quem está em{" "}
            <strong>negociação</strong> ou com <strong>acordo fechado</strong> é
            ignorado automaticamente.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={enfileirar.isPending}
          >
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={enfileirar.isPending}>
            {enfileirar.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Enfileirar reenvio
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
