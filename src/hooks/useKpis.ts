// Hook que agrega os KPIs do dashboard em uma única query paralela.
// Todas as contagens via head:true + count:exact (sem trazer linhas).
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import {
  inicioHojeSaoPauloUTC,
  inicioMesSaoPauloUTC,
} from "@/lib/dates";

export interface KpisData {
  total: number;
  emNegociacao: number;
  acordosMes: number;
  escalados: number;
  disparosHoje: number;
}

function unwrap(res: { count: number | null; error: unknown }): number {
  if (res.error) throw res.error;
  return res.count ?? 0;
}

async function fetchKpis(): Promise<KpisData> {
  const inicioMes = inicioMesSaoPauloUTC();
  const inicioHoje = inicioHojeSaoPauloUTC();

  const [
    totalRes,
    emNegRes,
    acordosRes,
    escaladosRes,
    disparosRes,
  ] = await Promise.all([
    supabase
      .from("fran_devedores")
      .select("*", { count: "exact", head: true }),
    supabase
      .from("fran_devedores")
      .select("*", { count: "exact", head: true })
      .eq("status_negociacao", "em_negociacao"),
    supabase
      .from("fran_devedores")
      .select("*", { count: "exact", head: true })
      .eq("status_negociacao", "acordo_aceito")
      .gte("acordo_data_aceite", inicioMes),
    supabase
      .from("fran_devedores")
      .select("*", { count: "exact", head: true })
      .eq("status_negociacao", "escalado"),
    supabase
      .from("fran_disparos")
      .select("*", { count: "exact", head: true })
      .eq("status_envio", "enviado")
      .gte("data_disparo", inicioHoje),
  ]);

  return {
    total: unwrap(totalRes),
    emNegociacao: unwrap(emNegRes),
    acordosMes: unwrap(acordosRes),
    escalados: unwrap(escaladosRes),
    disparosHoje: unwrap(disparosRes),
  };
}

export function useKpis() {
  return useQuery({
    queryKey: ["kpis"],
    queryFn: fetchKpis,
    staleTime: 30_000,
  });
}
