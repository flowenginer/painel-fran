// Persiste mudanças em fran_config. Atualiza por chave (upsert manual).
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";

export interface ConfigUpdate {
  chave: string;
  valor: string;
}

async function salvarConfigs(updates: ConfigUpdate[]): Promise<void> {
  // Faz UPDATE por chave em paralelo (as linhas já existem via seed).
  const promessas = updates.map((u) =>
    supabase
      .from("fran_config")
      .update({ valor: u.valor, updated_at: new Date().toISOString() })
      .eq("chave", u.chave)
  );
  const resultados = await Promise.all(promessas);
  for (const r of resultados) {
    if (r.error) throw r.error;
  }
}

export function useSaveConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: salvarConfigs,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["config"] });
      qc.invalidateQueries({ queryKey: ["kpis"] });
    },
  });
}
