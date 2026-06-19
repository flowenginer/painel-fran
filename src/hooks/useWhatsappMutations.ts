// Mutations para conectar/desconectar UM canal WhatsApp (instância) pelo painel.
// Atualiza imediatamente o cache de status daquela instância e força refetch.
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { uazapi, type WhatsappStatus } from "@/lib/uazapi";

export function useConectarWhatsapp(instancia: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => uazapi.connect(instancia),
    onSuccess: (data) => {
      qc.setQueryData<WhatsappStatus>(["whatsapp", "status", instancia], data);
      qc.invalidateQueries({ queryKey: ["whatsapp", "status", instancia] });
    },
  });
}

export function useDesconectarWhatsapp(instancia: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => uazapi.disconnect(instancia),
    onSuccess: (data) => {
      qc.setQueryData<WhatsappStatus>(["whatsapp", "status", instancia], data);
      qc.invalidateQueries({ queryKey: ["whatsapp", "status", instancia] });
    },
  });
}
