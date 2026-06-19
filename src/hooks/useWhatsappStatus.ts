// Status atual de UM canal WhatsApp (instância) via UAZAPI → n8n proxy.
// Refetch adaptativo:
//   - "connecting": a cada 2.5s, pra detectar o scan rapidamente
//   - "connected" e "disconnected": a cada 30s
//   - se a aba estiver fora de foco: pausado
import { useQuery } from "@tanstack/react-query";

import { uazapi, type WhatsappStatus } from "@/lib/uazapi";

export function useWhatsappStatus(instancia: string | null) {
  return useQuery<WhatsappStatus>({
    queryKey: ["whatsapp", "status", instancia],
    queryFn: () => uazapi.status(instancia),
    enabled: !!instancia,
    refetchInterval: (query) => {
      const estado = query.state.data?.estado;
      if (estado === "connecting") return 2_500;
      return 30_000;
    },
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
}
