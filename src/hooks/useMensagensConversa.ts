// Thread completa de uma conversa.
// Como o session_id da fran_memory vem em vários formatos (com/sem máscara),
// buscamos um conjunto generoso e filtramos no client pelo telefone normalizado.
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import {
  ehMensagemVisivel,
  parsearMensagem,
  type FranMemoryRow,
  type MensagemParsed,
} from "@/lib/conversas";

const LIMITE_THREAD = 1000;

async function fetchMensagens(
  telefoneNormalizado: string
): Promise<MensagemParsed[]> {
  if (!telefoneNormalizado) return [];

  // Estratégia: como o supabase-js não permite regex/normalização no WHERE,
  // buscamos por ilike contendo o telefone "sem 55" (pra cobrir variações com
  // ou sem código de país) e filtramos no client.
  const numeroSem55 = telefoneNormalizado.startsWith("55")
    ? telefoneNormalizado.slice(2)
    : telefoneNormalizado;

  const { data, error } = await supabase
    .from("fran_memory")
    .select("id, session_id, message")
    .ilike("session_id", `%${numeroSem55}%`)
    .order("id", { ascending: true })
    .limit(LIMITE_THREAD);

  if (error) throw error;

  const parsed = ((data ?? []) as FranMemoryRow[])
    .map(parsearMensagem)
    .filter(
      (m) => m.session_id_normalizado === telefoneNormalizado
    );

  return parsed;
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
