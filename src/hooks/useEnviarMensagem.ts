// Mutation de envio de mensagem do CRM (texto e mídia).
//
// Renderização otimista: a bolha da mensagem aparece na thread imediatamente
// (antes do servidor responder) e o campo é limpo na hora. Se o envio falhar,
// a bolha é removida e um toast de erro é exibido. Isso elimina a sensação de
// lentidão — o ida-e-volta com a Edge Function acontece em segundo plano.
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { enviarMensagem, type TipoEnvio } from "@/lib/mensagens";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import type { MensagemParsed } from "@/lib/conversas";

export interface EnviarMensagemArgs {
  texto?: string;
  tipo?: TipoEnvio;
  media_url?: string | null;
}

export function useEnviarMensagem(
  telefoneNormalizado: string | null,
  canal?: string | null,
) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { perfil } = useAuth();

  return useMutation({
    mutationFn: (args: EnviarMensagemArgs) => {
      if (!telefoneNormalizado) {
        throw new Error("Conversa sem telefone válido.");
      }
      return enviarMensagem({ telefone: telefoneNormalizado, canal, ...args });
    },
    // Insere a mensagem otimista na thread antes de o servidor responder.
    onMutate: async (args: EnviarMensagemArgs) => {
      const prevVazio: MensagemParsed[] | undefined = undefined;
      if (!telefoneNormalizado) return { prev: prevVazio };

      const key = ["conversa", telefoneNormalizado];
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<MensagemParsed[]>(key);

      const nome = (perfil?.nome ?? "").trim();
      const caption = (args.texto ?? "").trim();
      const ehMidia = !!args.tipo && args.tipo !== "texto";
      const content = nome && caption ? `*${nome}:*\n${caption}` : caption;

      const otimista: MensagemParsed = {
        id: -(Date.now() + Math.floor(Math.random() * 1000)),
        session_id: telefoneNormalizado,
        session_id_normalizado: telefoneNormalizado,
        type: "ai",
        content,
        tem_tool_call: false,
        created_at: new Date().toISOString(),
        enviado_por: perfil?.id ?? null,
        canal: canal ?? null,
        media_url: ehMidia ? (args.media_url ?? null) : null,
        media_tipo: ehMidia ? (args.tipo ?? null) : null,
        media_mime: null,
        media_nome: null,
        transcricao: null,
      };

      qc.setQueryData<MensagemParsed[]>(key, (old) => [...(old ?? []), otimista]);
      return { prev };
    },
    onError: (e, _args, ctx) => {
      // Desfaz a bolha otimista.
      if (telefoneNormalizado && ctx?.prev) {
        qc.setQueryData(["conversa", telefoneNormalizado], ctx.prev);
      }
      toast({
        variant: "destructive",
        title: "Erro ao enviar",
        description: e instanceof Error ? e.message : "Falha no envio",
      });
    },
    onSettled: (resp) => {
      // Reconcilia com o servidor (substitui a bolha otimista pela real).
      void qc.invalidateQueries({ queryKey: ["conversa", telefoneNormalizado] });
      void qc.invalidateQueries({ queryKey: ["conversas"] });
      if (resp?.aviso) {
        toast({ title: "Mensagem enviada", description: resp.aviso });
      }
    },
  });
}
