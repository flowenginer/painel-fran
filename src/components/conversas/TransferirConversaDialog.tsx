import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTransferirConversa } from "@/hooks/useTransferirConversa";
import type { OperadorLite } from "@/lib/conversas-transfer";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  devedorId: number;
  devedorNome: string;
  responsavelAtualId: string | null;
  operadores: OperadorLite[];
}

export function TransferirConversaDialog({
  open,
  onOpenChange,
  devedorId,
  devedorNome,
  responsavelAtualId,
  operadores,
}: Props) {
  const { mutateAsync, isPending } = useTransferirConversa();
  const [paraId, setParaId] = useState<string>("");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setParaId("");
      setMotivo("");
      setErro(null);
    }
  }, [open]);

  // Não faz sentido transferir para o responsável atual.
  const opcoes = operadores.filter((o) => o.id !== responsavelAtualId);

  async function confirmar() {
    if (!paraId) {
      setErro("Escolha o operador de destino.");
      return;
    }
    try {
      await mutateAsync({
        devedorId,
        paraUsuarioId: paraId,
        motivo: motivo.trim() || null,
      });
      onOpenChange(false);
    } catch {
      /* toast de erro já exibido pela mutation */
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Transferir conversa</DialogTitle>
          <DialogDescription>
            Passe o atendimento de <strong>{devedorNome}</strong> para outro
            operador.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Transferir para</Label>
            <Select value={paraId} onValueChange={setParaId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um operador" />
              </SelectTrigger>
              <SelectContent>
                {opcoes.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.nome || o.email || o.id}
                    {o.role === "admin" ? " (admin)" : ""}
                  </SelectItem>
                ))}
                {opcoes.length === 0 && (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    Nenhum outro operador disponível.
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="transf-motivo">Motivo (opcional)</Label>
            <Textarea
              id="transf-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex: cliente pediu atendimento com outra pessoa"
              rows={3}
            />
          </div>

          {erro && <p className="text-xs text-destructive">{erro}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void confirmar()} disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Transferir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
