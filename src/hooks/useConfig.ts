// Hook para ler configurações do painel (fran_config).
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import type { Config } from "@/lib/types";

async function fetchConfig(): Promise<Record<string, string>> {
  const { data, error } = await supabase.from("fran_config").select("*");
  if (error) throw error;
  const mapa: Record<string, string> = {};
  for (const row of (data ?? []) as Config[]) {
    mapa[row.chave] = row.valor ?? "";
  }
  return mapa;
}

export function useConfig() {
  return useQuery({
    queryKey: ["config"],
    queryFn: fetchConfig,
    staleTime: 5 * 60_000,
  });
}
