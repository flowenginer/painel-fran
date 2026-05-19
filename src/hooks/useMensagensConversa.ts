// Thread completa de uma conversa.
// O session_id da fran_memory vem em formatos variados (com/sem máscara),
// então usamos ilike no "número sem 55" e filtramos no client pelo
// telefone normalizado. Pagina automaticamente sob o limite de 1000 do
// PostgREST.
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { fetchAllPages } from "@/lib/supabase-pagination";
import {
  ehMensagemVisivel,
  parsearMensagem,
  type FranMemoryRow,
  type MensagemParsed,
} from "@/lib/conversas";

async function fetchMensagens(
  telefoneNormalizado: string
): Promise<MensagemParsed[]> {
  if (!telefoneNormalizado) return [];

  const numeroSem55 = telefoneNormalizado.startsWith("55")
    ? telefoneNormalizado.slice(2)
    : telefoneNormalizado;

  const todos = await fetchAllPages<FranMemoryRow>(() =>
    supabase
      .from("fran_memory")
      .select("id, session_id, message")
      .ilike("session_id", `%${numeroSem55}%`)
      .order("id", { ascending: true })
  );

  return todos
    .map(parsearMensagem)
    .filter((m) => m.session_id_normalizado === telefoneNormalizado);
}

export function useMensagensConversa(telefoneNormalizado: string | null) {
  return useQuery<MensagemParsed[]>({
    queryKey: ["conversa", telefoneNormalizado],
    queryFn: () => fetchMensagens(telefoneNormalizado ?? ""),
    enabled: Boolean(telefoneNormalizado),
    staleTime: 5_000,
  });
}

/** Filtra só mensagens visíveis (ai sem tool_calls + human). */
export function filtrarVisiveis(
  mensagens: MensagemParsed[]
): MensagemParsed[] {
  return mensagens.filter(ehMensagemVisivel);
}
