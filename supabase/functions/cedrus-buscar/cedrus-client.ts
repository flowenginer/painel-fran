// Cliente da API Cedrus com Basic Auth (APIKEY como username, senha vazia).
//
// Ponto importante: o endpoint /devedor só filtra corretamente quando recebe
// os critérios via GET + body JSON (igual ao cURL/Postman/PHP). Via query
// string a API ignora os filtros e devolve um registro arbitrário. O `fetch`
// padrão do Deno recusa body em GET (respeita o spec HTTP), então usamos
// o módulo node:https do shim de Node compatível no Supabase Edge Runtime,
// que apenas escreve bytes no socket sem validar essa regra.

import https from "node:https";
import { URL } from "node:url";

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
 * Executa GET com body JSON usando node:https (análogo ao cURL).
 * O fetch do Deno rejeita body em GET; node:https não tem essa restrição.
 */
function getComBody(
  endpoint: string,
  headers: Record<string, string>,
  body: string,
  timeoutMs: number
): Promise<{ status: number; texto: string }> {
  const url = new URL(endpoint);
  const bodyLen = new TextEncoder().encode(body).byteLength;

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port ? Number(url.port) : 443,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        headers: {
          ...headers,
          "Content-Type": "application/json",
          "Content-Length": String(bodyLen),
        },
        timeout: timeoutMs,
      },
      (res) => {
        let chunks = "";
        res.setEncoding("utf8");
        res.on("data", (c: string) => {
          chunks += c;
        });
        res.on("end", () => {
          resolve({ status: res.statusCode ?? 0, texto: chunks });
        });
        res.on("error", reject);
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy(new Error("AbortError"));
    });
    req.write(body);
    req.end();
  });
}

/**
 * Busca devedores na API Cedrus via GET com body JSON.
 */
export async function buscarDevedoresCedrus(
  urlBase: string,
  apikey: string,
  filters: CedrusFilters
): Promise<CedrusResponse> {
  const endpoint = `${urlBase.replace(/\/+$/, "")}/devedor`;
  const limpos = limparFiltros(filters);
  const body = JSON.stringify(limpos);

  console.log("[cedrus-client] GET+body", endpoint, body);

  let resultado: { status: number; texto: string };
  try {
    resultado = await getComBody(
      endpoint,
      {
        Authorization: basicAuth(apikey),
        Accept: "application/json",
      },
      body,
      TIMEOUT_MS
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/AbortError|timeout/i.test(msg)) {
      throw new CedrusError("Timeout ao consultar Cedrus (60s).", 504);
    }
    throw new CedrusError(
      `Falha de rede ao consultar Cedrus: ${msg}`,
      502
    );
  }

  const { status, texto } = resultado;

  let json: unknown;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    json = null;
  }

  if (status < 200 || status >= 300) {
    throw new CedrusError(
      `Cedrus retornou HTTP ${status}`,
      status,
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
