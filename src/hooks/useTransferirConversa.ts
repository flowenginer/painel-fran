// Mutation de transferência de conversa. Invalida a lista de conversas e os
// devedores para refletir o novo responsável.
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { transferirConversa } from "@/lib/conversas-transfer";
import { useToast } from "@/hooks/use-toast";

interface TransferirInput {
  devedorId: number;
  paraUsuarioId: string;
  motivo?: string | null;
}

export function useTransferirConversa() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ devedorId, paraUsuarioId, motivo }: TransferirInput) =>
      transferirConversa(devedorId, paraUsuarioId, motivo),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["conversas"] });
      void queryClient.invalidateQueries({ queryKey: ["devedores"] });
      toast({ variant: "success", title: "Conversa transferida" });
    },
    onError: (e) =>
      toast({
        variant: "destructive",
        title: "Erro ao transferir",
        description: e instanceof Error ? e.message : "Operação falhou",
      }),
  });
}
