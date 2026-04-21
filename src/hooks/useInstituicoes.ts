// Hook para listar instituições (fran_instituicoes).
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import type { Instituicao } from "@/lib/types";

async function fetchInstituicoes(): Promise<Instituicao[]> {
  const { data, error } = await supabase
    .from("fran_instituicoes")
    .select("*")
    .order("nome", { ascending: true });

  if (error) throw error;
  return (data ?? []) as Instituicao[];
}

export function useInstituicoes() {
  return useQuery({
    queryKey: ["instituicoes"],
    queryFn: fetchInstituicoes,
    staleTime: 5 * 60_000, // 5 min — muda raramente
  });
}
