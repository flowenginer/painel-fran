// Exclui o histórico de mensagens (fran_memory) de uma ou mais conversas.
// Admin-only (enforçado na função fran_excluir_conversas). Mantém o cadastro
// do devedor — para removê-lo há a remoção de devedor.
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";

async function excluirConversas(telefones: string[]): Promise<number> {
  const { data, error } = await supabase.rpc("fran_excluir_conversas", {
    p_tels: telefones,
  });
  if (error) throw new Error(error.message);
  return typeof data === "number" ? data : 0;
}

export function useExcluirConversas() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: excluirConversas,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversas"] });
      qc.invalidateQueries({ queryKey: ["kpis"] });
    },
  });
}
