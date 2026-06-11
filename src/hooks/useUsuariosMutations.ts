// Mutations de gerência de usuários. Invalidam a lista ["usuarios"] após
// cada operação e expõem toasts de sucesso/erro.
import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  atualizarUsuario,
  criarUsuario,
  removerUsuario,
  resetarSenhaUsuario,
  type AtualizarUsuarioInput,
  type CriarUsuarioInput,
} from "@/lib/usuarios";
import { useToast } from "@/hooks/use-toast";

export function useUsuariosMutations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const invalidar = () =>
    queryClient.invalidateQueries({ queryKey: ["usuarios"] });

  const erro = (e: unknown) =>
    toast({
      variant: "destructive",
      title: "Erro",
      description: e instanceof Error ? e.message : "Operação falhou",
    });

  const criar = useMutation({
    mutationFn: (input: CriarUsuarioInput) => criarUsuario(input),
    onSuccess: () => {
      void invalidar();
      toast({ title: "Usuário criado", description: "Acesso liberado com sucesso." });
    },
    onError: erro,
  });

  const atualizar = useMutation({
    mutationFn: (input: AtualizarUsuarioInput) => atualizarUsuario(input),
    onSuccess: () => {
      void invalidar();
      toast({ title: "Usuário atualizado" });
    },
    onError: erro,
  });

  const resetarSenha = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      resetarSenhaUsuario(id, password),
    onSuccess: () => toast({ title: "Senha redefinida" }),
    onError: erro,
  });

  const remover = useMutation({
    mutationFn: (id: string) => removerUsuario(id),
    onSuccess: () => {
      void invalidar();
      toast({ title: "Usuário removido" });
    },
    onError: erro,
  });

  return { criar, atualizar, resetarSenha, remover };
}
