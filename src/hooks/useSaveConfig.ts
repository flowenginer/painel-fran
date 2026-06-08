// Persiste mudanças em fran_config. Atualiza por chave (upsert manual).
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";

export interface ConfigUpdate {
  chave: string;
  valor: string;
}

async function salvarConfigs(updates: ConfigUpdate[]): Promise<void> {
  // UPDATE por chave; se a linha ainda não existir (chave nova que não veio
  // de um seed/migration), faz INSERT. Mantém o UPDATE como caminho normal
  // — só insere quando necessário, para não exigir migration de cada chave.
  for (const u of updates) {
    const { data, error } = await supabase
      .from("fran_config")
      .update({ valor: u.valor, updated_at: new Date().toISOString() })
      .eq("chave", u.chave)
      .select("chave");
    if (error) throw error;
    if (!data || data.length === 0) {
      const { error: insErr } = await supabase
        .from("fran_config")
        .insert({ chave: u.chave, valor: u.valor });
      if (insErr) throw insErr;
    }
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
