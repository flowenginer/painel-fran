import { Loader2, Trash2 } from "lucide-react";

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
import { useRemoverDevedor } from "@/hooks/useDevedorMutations";
import type { Devedor } from "@/lib/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  devedor: Devedor | null;
}

export function RemoverDevedorDialog({ open, onOpenChange, devedor }: Props) {
  const { mutateAsync, isPending } = useRemoverDevedor();
  const { toast } = useToast();

  async function confirmar() {
    if (!devedor) return;
    try {
      await mutateAsync(devedor.id);
      toast({
        variant: "success",
        title: "Devedor removido",
        description: devedor.nome_devedor,
      });
      onOpenChange(false);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro ao remover",
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Remover devedor?</DialogTitle>
          <DialogDescription>
            Esta ação não pode ser desfeita. O histórico de disparos desse
            devedor em fran_disparos é mantido (referência por id) mas a
            relação com o devedor se perde.
          </DialogDescription>
        </DialogHeader>
        {devedor && (
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <p className="font-medium">{devedor.nome_devedor}</p>
            <p className="text-xs text-muted-foreground">
              CPF: {devedor.cpf ?? "—"} · Instituição: {devedor.instituicao}
            </p>
          </div>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={confirmar}
            disabled={isPending}
          >
            {isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="mr-2 h-4 w-4" />
            )}
            Remover
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
