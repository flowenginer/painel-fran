// Hooks da configuração de distribuição (lista de operadores + pesos).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  listarDistribuicao,
  setDistribuicao,
  type DistribuicaoUsuario,
} from "@/lib/distribuicao";
import { useToast } from "@/hooks/use-toast";

export function useDistribuicao(enabled = true) {
  return useQuery<DistribuicaoUsuario[]>({
    queryKey: ["distribuicao"],
    queryFn: listarDistribuicao,
    enabled,
    staleTime: 30_000,
  });
}

export function useSetDistribuicao() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({
      userId,
      recebe,
      peso,
    }: {
      userId: string;
      recebe: boolean;
      peso: number;
    }) => setDistribuicao(userId, recebe, peso),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["distribuicao"] }),
    onError: (e) =>
      toast({
        variant: "destructive",
        title: "Erro ao salvar distribuição",
        description: e instanceof Error ? e.message : "Operação falhou",
      }),
  });
}
