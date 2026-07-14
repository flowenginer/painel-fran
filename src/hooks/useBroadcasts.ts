// Lista as campanhas de broadcast (fran_zernio_broadcasts) para o histórico.
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";

export interface BroadcastResumo {
  id: number;
  nome: string;
  template_name: string;
  status: string;
  total_alvos: number;
  total_enviados: number;
  total_erros: number;
  created_at: string;
}

async function listarBroadcasts(): Promise<BroadcastResumo[]> {
  const { data, error } = await supabase
    .from("fran_zernio_broadcasts")
    .select(
      "id, nome, template_name, status, total_alvos, total_enviados, total_erros, created_at",
    )
    .order("id", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []) as BroadcastResumo[];
}

export function useBroadcasts() {
  return useQuery({
    queryKey: ["broadcasts"],
    queryFn: listarBroadcasts,
    staleTime: 15_000,
  });
}
