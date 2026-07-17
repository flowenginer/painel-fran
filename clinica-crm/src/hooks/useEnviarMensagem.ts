import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { enviarMensagem } from "@/lib/mensagens";
import type { Mensagem, TipoMensagem } from "@/lib/types";

// Mutation de envio com bolha otimista: injeta a mensagem no cache na hora e
// reconcilia com o real (ou reverte em caso de erro).
export function useEnviarMensagem(conversaId: number | null) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();
  const key = ["mensagens", conversaId];

  return useMutation({
    mutationFn: (args: { texto: string; tipo?: TipoMensagem; media_url?: string | null }) => {
      if (!conversaId) throw new Error("Conversa não selecionada");
      return enviarMensagem({ conversa_id: conversaId, ...args });
    },

    onMutate: async (args) => {
      if (!conversaId) return { prev: undefined };
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<Mensagem[]>(key);

      const otimista: Mensagem = {
        id: -Date.now(),
        conversa_id: conversaId,
        unidade_id: 0,
        direcao: "out",
        tipo: args.tipo ?? "texto",
        conteudo: args.texto || null,
        media_url: args.media_url ?? null,
        media_mime: null,
        enviado_por: user?.id ?? null,
        provider_msg_id: null,
        created_at: new Date().toISOString(),
      };
      queryClient.setQueryData<Mensagem[]>(key, [...(prev ?? []), otimista]);
      return { prev };
    },

    onError: (err, _args, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(key, ctx.prev);
      toast({
        variant: "destructive",
        title: "Não foi possível enviar",
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
    },

    onSettled: (resp) => {
      queryClient.invalidateQueries({ queryKey: key });
      queryClient.invalidateQueries({ queryKey: ["conversas"] });
      if (resp?.aviso) {
        toast({ title: "Enviado", description: resp.aviso });
      }
    },
  });
}
