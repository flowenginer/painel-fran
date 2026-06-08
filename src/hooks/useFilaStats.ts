// Agregados da fila de distribuição para os cards do topo da tela.
// Contagens via head:true + count:exact (não traz linhas).
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { inicioHojeSaoPauloUTC } from "@/lib/dates";
import type { FilaStats } from "@/lib/types";

function unwrap(res: { count: number | null; error: unknown }): number {
  if (res.error) throw res.error;
  return res.count ?? 0;
}

async function fetchFilaStats(): Promise<FilaStats> {
  const inicioHoje = inicioHojeSaoPauloUTC();

  const [naFilaRes, enviadosRes, errosRes, enviadosHojeRes] = await Promise.all([
    supabase
      .from("fran_fila_disparo")
      .select("*", { count: "exact", head: true })
      .eq("status", "na_fila"),
    supabase
      .from("fran_fila_disparo")
      .select("*", { count: "exact", head: true })
      .eq("status", "enviado"),
    supabase
      .from("fran_fila_disparo")
      .select("*", { count: "exact", head: true })
      .eq("status", "erro"),
    // Reaproveita fran_disparos para "enviados hoje" (mesma fonte usada
    // pelos limites diário/por hora no backend).
    supabase
      .from("fran_disparos")
      .select("*", { count: "exact", head: true })
      .eq("status_envio", "enviado")
      .gte("data_disparo", inicioHoje),
  ]);

  return {
    naFila: unwrap(naFilaRes),
    enviados: unwrap(enviadosRes),
    erros: unwrap(errosRes),
    enviadosHoje: unwrap(enviadosHojeRes),
  };
}

export function useFilaStats() {
  return useQuery({
    queryKey: ["fila-stats"],
    queryFn: fetchFilaStats,
    staleTime: 15_000,
  });
}
