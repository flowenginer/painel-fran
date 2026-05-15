// Status atual do WhatsApp via UAZAPI (passando pelo n8n proxy).
// Refetch adaptativo:
//   - "connecting": a cada 2.5s, pra detectar o scan rapidamente
//   - "connected" e "disconnected": a cada 30s
//   - se a aba estiver fora de foco: pausado
import { useQuery } from "@tanstack/react-query";

import { uazapi, type WhatsappStatus } from "@/lib/uazapi";

export function useWhatsappStatus() {
  return useQuery<WhatsappStatus>({
    queryKey: ["whatsapp", "status"],
    queryFn: () => uazapi.status(),
    refetchInterval: (query) => {
      const estado = query.state.data?.estado;
      if (estado === "connecting") return 2_500;
      return 30_000;
    },
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
}
