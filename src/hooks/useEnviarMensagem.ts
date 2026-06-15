// Mutation de envio de mensagem do CRM (texto e mídia). Após enviar, invalida
// a thread e a lista de conversas para refletir a mensagem nova.
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { enviarMensagem, type TipoEnvio } from "@/lib/mensagens";
import { useToast } from "@/hooks/use-toast";

export interface EnviarMensagemArgs {
  texto?: string;
  tipo?: TipoEnvio;
  media_url?: string | null;
}

export function useEnviarMensagem(telefoneNormalizado: string | null) {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (args: EnviarMensagemArgs) => {
      if (!telefoneNormalizado) {
        throw new Error("Conversa sem telefone válido.");
      }
      return enviarMensagem({ telefone: telefoneNormalizado, ...args });
    },
    onSuccess: (resp) => {
      void qc.invalidateQueries({ queryKey: ["conversa", telefoneNormalizado] });
      void qc.invalidateQueries({ queryKey: ["conversas"] });
      if (resp.aviso) {
        toast({ title: "Mensagem enviada", description: resp.aviso });
      }
    },
    onError: (e) =>
      toast({
        variant: "destructive",
        title: "Erro ao enviar",
        description: e instanceof Error ? e.message : "Falha no envio",
      }),
  });
}
