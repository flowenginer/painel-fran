// Utilitário pra contornar o limite padrão de 1000 linhas do PostgREST do
// Supabase. Faz queries paginadas em range até esgotar.
//
// Uso:
//   const todos = await fetchAllPages(() =>
//     supabase.from("fran_memory").select("id, session_id, message")
//   );
//
// O builder fornecido pelo callback é clonado por chamada (chama o callback
// de novo a cada página) — daí o supabase-js pode encadear .order, .gte,
// .ilike sem efeito colateral.

// PostgREST geralmente está com max_rows=1000 no Supabase hospedado.
// Pegamos 1000 por página, que é o teto efetivo.
const TAMANHO_PAGINA = 1000;
const LIMITE_DE_SEGURANCA = 50; // máximo de páginas (50k linhas) — evita loop infinito

// Aceita qualquer builder do supabase-js com método range — não amarramos
// na tipagem específica de cada tabela.
type RangeableLike = {
  range(
    from: number,
    to: number
  ): PromiseLike<{ data: unknown; error: unknown }>;
};

/**
 * Busca todas as páginas chamando o builder N vezes com range incremental.
 * Para quando uma página vier com menos linhas que o tamanho máximo.
 *
 * O caller é responsável por garantir que os items retornados são T —
 * tipicamente passamos o select() já tipado e fazemos o assert no return.
 */
export async function fetchAllPages<T>(
  builderFactory: () => RangeableLike
): Promise<T[]> {
  const tudo: T[] = [];

  for (let pagina = 0; pagina < LIMITE_DE_SEGURANCA; pagina++) {
    const inicio = pagina * TAMANHO_PAGINA;
    const fim = inicio + TAMANHO_PAGINA - 1;

    const { data, error } = await builderFactory().range(inicio, fim);
    if (error) throw error as Error;
    const linhas = (data ?? []) as T[];
    tudo.push(...linhas);

    if (linhas.length < TAMANHO_PAGINA) break;
  }

  return tudo;
}
