// Lista itens da fila de distribuição (fran_fila_disparo) com o devedor
// embutido. Por padrão traz os que estão aguardando (na_fila).
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import type { FilaItemComDevedor, StatusFila } from "@/lib/types";

const SELECT =
  "id,devedor_id,status,prioridade,campanha,tentativas,erro_detalhes,enfileirado_por,data_processado,created_at,updated_at," +
  "devedor:fran_devedores(id,nome_devedor,primeiro_nome,telefone,instituicao,valor_atualizado,status_negociacao)";

async function fetchFila(status: StatusFila): Promise<FilaItemComDevedor[]> {
  const { data, error } = await supabase
    .from("fran_fila_disparo")
    .select(SELECT)
    .eq("status", status)
    .order("prioridade", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(1000);
  if (error) throw error;
  return (data ?? []) as unknown as FilaItemComDevedor[];
}

export function useFila(status: StatusFila = "na_fila") {
  return useQuery({
    queryKey: ["fila", status],
    queryFn: () => fetchFila(status),
    staleTime: 15_000,
  });
}
