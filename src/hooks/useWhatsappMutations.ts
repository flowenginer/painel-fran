// Mutations para conectar/desconectar o WhatsApp pelo painel.
// Atualiza imediatamente o cache de status (optimistic update) e em seguida
// força um refetch pra refletir o estado novo vindo do UAZAPI.
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { uazapi, type WhatsappStatus } from "@/lib/uazapi";

export function useConectarWhatsapp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => uazapi.connect(),
    onSuccess: (data) => {
      qc.setQueryData<WhatsappStatus>(["whatsapp", "status"], data);
      qc.invalidateQueries({ queryKey: ["whatsapp", "status"] });
    },
  });
}

export function useDesconectarWhatsapp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => uazapi.disconnect(),
    onSuccess: (data) => {
      qc.setQueryData<WhatsappStatus>(["whatsapp", "status"], data);
      qc.invalidateQueries({ queryKey: ["whatsapp", "status"] });
    },
  });
}
