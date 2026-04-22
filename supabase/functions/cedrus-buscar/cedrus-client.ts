// Cliente da API Cedrus. Faz GET com body JSON (peculiaridade da API)
// e Basic Auth usando APIKEY como username e senha vazia.

const TIMEOUT_MS = 60_000;

export interface CedrusFilters {
  id_devedor?: string;
  cod_credor?: string;
  cod_devedor?: string;
  cnpj_cpf?: string;
  status?: "A" | "P" | "C" | "S";
  dt_vencimento_de?: string;
  dt_vencimento_ate?: string;
  num_pagina?: number;
}

export interface CedrusResponse {
  // A API Cedrus retorna variações — normalizamos para um array de devedores.
  devedores: Record<string, unknown>[];
  rawMessage?: string;
}

export class CedrusError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly detail?: unknown
  ) {
    super(message);
    this.name = "CedrusError";
  }
}

function basicAuth(apikey: string): string {
  // Username = apikey, password = ""
  const b64 = btoa(`${apikey}:`);
  return `Basic ${b64}`;
}

// Remove campos vazios para não confundir a API.
function limparFiltros(
  filters: CedrusFilters
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(filters)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    out[k] = v;
  }
  return out;
}

/**
 * Busca devedores na API Cedrus.
 * Filtros via query string no GET (o Deno fetch bloqueia body em GET).
 * Se a API do Cedrus rejeitar query string, fazemos fallback para POST
 * com body JSON.
 */
export async function buscarDevedoresCedrus(
  urlBase: string,
  apikey: string,
  filters: CedrusFilters
): Promise<CedrusResponse> {
  const endpoint = `${urlBase.replace(/\/+$/, "")}/devedor`;
  const limpos = limparFiltros(filters);

  // Monta query string
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(limpos)) qs.set(k, String(v));
  const urlComQS = qs.size > 0 ? `${endpoint}?${qs.toString()}` : endpoint;

  console.log("[cedrus-client] GET", urlComQS.replace(apikey, "***"));

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  let resp: Response;
  try {
    // Tentativa 1: GET com query string
    resp = await fetch(urlComQS, {
      method: "GET",
      headers: {
        Authorization: basicAuth(apikey),
        Accept: "application/json",
      },
      signal: ctrl.signal,
    });

    // Se a API explicitamente rejeitar (ex: 405), tenta POST com body
    if (resp.status === 405 || resp.status === 400) {
      const textoErro = await resp.clone().text();
      // Só faz fallback se a mensagem sugerir que os filtros não foram
      // recebidos (evita fallback em 400 legítimo de validação)
      if (/method|filtros?\s+obrig|sem\s+filtro/i.test(textoErro)) {
        console.log("[cedrus-client] fallback para POST com body");
        resp = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: basicAuth(apikey),
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(limpos),
          signal: ctrl.signal,
        });
      }
    }
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") {
      throw new CedrusError("Timeout ao consultar Cedrus (60s).", 504);
    }
    throw new CedrusError(
      `Falha de rede ao consultar Cedrus: ${
        err instanceof Error ? err.message : String(err)
      }`,
      502
    );
  }
  clearTimeout(timer);

  const texto = await resp.text();
  let json: unknown;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    json = null;
  }

  if (!resp.ok) {
    throw new CedrusError(
      `Cedrus retornou HTTP ${resp.status}`,
      resp.status,
      json ?? texto
    );
  }

  // A API pode retornar:
  // - array direto de devedores
  // - objeto com { message: "..." } quando não há resultados
  // - objeto envelopado
  if (Array.isArray(json)) {
    return { devedores: json as Record<string, unknown>[] };
  }

  if (json && typeof json === "object") {
    const obj = json as Record<string, unknown>;

    // Caso "Nenhum devedor encontrado" venha como { message: ... }
    const msg = typeof obj.message === "string" ? obj.message : undefined;
    if (msg && /nenhum|sem\s+result/i.test(msg)) {
      return { devedores: [], rawMessage: msg };
    }

    // Se tiver propriedade devedores ou data array
    if (Array.isArray(obj.devedores)) {
      return { devedores: obj.devedores as Record<string, unknown>[] };
    }
    if (Array.isArray(obj.data)) {
      return { devedores: obj.data as Record<string, unknown>[] };
    }

    // Objeto único (busca por id)
    if (obj.cnpj_cpf || obj.id_devedor || obj.cod_devedor) {
      return { devedores: [obj] };
    }

    return { devedores: [], rawMessage: msg };
  }

  return { devedores: [] };
}
