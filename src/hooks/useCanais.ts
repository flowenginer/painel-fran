// Hooks dos canais de conexão (lista + CRUD). Escrita é admin-only (RLS).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  atualizarCanal,
  criarCanal,
  listarCanais,
  listarCanalTokens,
  removerCanal,
  salvarCanalToken,
  type Canal,
  type CanalInput,
} from "@/lib/canais";
import { useToast } from "@/hooks/use-toast";

export function useCanais(enabled = true) {
  return useQuery<Canal[]>({
    queryKey: ["canais"],
    queryFn: listarCanais,
    enabled,
    staleTime: 30_000,
  });
}

export function useCanalTokens(enabled = true) {
  return useQuery<Record<number, string>>({
    queryKey: ["canal-tokens"],
    queryFn: listarCanalTokens,
    enabled,
    staleTime: 30_000,
  });
}

export function useSalvarCanalToken() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ canalId, token }: { canalId: number; token: string }) =>
      salvarCanalToken(canalId, token),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["canal-tokens"] }),
    onError: (e) =>
      toast({
        variant: "destructive",
        title: "Erro ao salvar token",
        description: e instanceof Error ? e.message : "Operação falhou",
      }),
  });
}

export function useCriarCanal() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (input: CanalInput) => criarCanal(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["canais"] }),
    onError: (e) =>
      toast({
        variant: "destructive",
        title: "Erro ao criar canal",
        description: e instanceof Error ? e.message : "Operação falhou",
      }),
  });
}

export function useAtualizarCanal() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Partial<CanalInput> }) =>
      atualizarCanal(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["canais"] }),
    onError: (e) =>
      toast({
        variant: "destructive",
        title: "Erro ao salvar canal",
        description: e instanceof Error ? e.message : "Operação falhou",
      }),
  });
}

export function useRemoverCanal() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (id: number) => removerCanal(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["canais"] }),
    onError: (e) =>
      toast({
        variant: "destructive",
        title: "Erro ao remover canal",
        description: e instanceof Error ? e.message : "Operação falhou",
      }),
  });
}
