// Mutation de envio de mensagem do CRM. Após enviar, invalida a thread e a
// lista de conversas para refletir a mensagem nova.
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { enviarMensagem } from "@/lib/mensagens";
import { useToast } from "@/hooks/use-toast";

export function useEnviarMensagem(telefoneNormalizado: string | null) {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (texto: string) => {
      if (!telefoneNormalizado) {
        throw new Error("Conversa sem telefone válido.");
      }
      return enviarMensagem(telefoneNormalizado, texto);
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
