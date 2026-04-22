// Cliente da API Cedrus com Basic Auth (APIKEY como username, senha vazia).
//
// A API só filtra corretamente quando recebe critérios via GET + body JSON
// (igual ao cURL/Postman/PHP do cliente). Via query string ela ignora os
// filtros e devolve registro arbitrário do catálogo.
//
// Restrições enfrentadas:
//   - fetch do Deno bloqueia body em GET (respeita o spec HTTP)
//   - node:https no Supabase Edge Runtime retorna null em request()
//
// Solução: HTTP manual via Deno.connectTls — abrimos um socket TLS,
// escrevemos os bytes da requisição (request line + headers + body) e
// lemos a resposta. É como o cURL faz por baixo.

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
  return `Basic ${btoa(`${apikey}:`)}`;
}

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
 * Faz GET com body JSON usando TLS direto (Deno.connectTls).
 * Necessário porque fetch+GET bloqueia body e node:https não funciona
 * confiavelmente no Supabase Edge Runtime.
 */
async function getComBody(
  endpoint: string,
  authHeader: string,
  body: string,
  timeoutMs: number
): Promise<{ status: number; texto: string }> {
  const url = new URL(endpoint);
  if (url.protocol !== "https:") {
    throw new Error("Apenas HTTPS suportado");
  }
  const port = url.port ? Number(url.port) : 443;
  const path = `${url.pathname}${url.search || ""}`;
  const bodyBytes = new TextEncoder().encode(body);

  const conn = await Deno.connectTls({ hostname: url.hostname, port });

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);

  try {
    // Monta request line + headers
    const headerBlock =
      [
        `GET ${path} HTTP/1.1`,
        `Host: ${url.hostname}${
          (url.protocol === "https:" && port !== 443) ||
          (url.protocol === "http:" && port !== 80)
            ? `:${port}`
            : ""
        }`,
        `Authorization: ${authHeader}`,
        `Accept: application/json`,
        `Content-Type: application/json`,
        `Content-Length: ${bodyBytes.length}`,
        `Connection: close`,
        ``,
        ``,
      ].join("\r\n");

    await conn.write(new TextEncoder().encode(headerBlock));
    await conn.write(bodyBytes);

    // Lê toda a resposta até o servidor fechar (Connection: close).
    const chunks: Uint8Array[] = [];
    const buf = new Uint8Array(64 * 1024);
    while (true) {
      if (ac.signal.aborted) {
        throw new Error("Timeout");
      }
      const n = await Promise.race([
        conn.read(buf),
        new Promise<null>((_, rej) => {
          ac.signal.addEventListener(
            "abort",
            () => rej(new Error("Timeout")),
            { once: true }
          );
        }),
      ]);
      if (n === null || n === 0) break;
      chunks.push(buf.slice(0, n));
    }

    // Concatena todos os chunks
    const total = chunks.reduce((a, c) => a + c.length, 0);
    const all = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      all.set(c, off);
      off += c.length;
    }

    return parseHttpResponse(all);
  } finally {
    clearTimeout(timer);
    try {
      conn.close();
    } catch {
      /* ignora */
    }
  }
}

// Parser mínimo de resposta HTTP/1.1 (status + headers + body).
// Suporta Transfer-Encoding: chunked.
function parseHttpResponse(bytes: Uint8Array): {
  status: number;
  texto: string;
} {
  // Acha "\r\n\r\n" para separar headers de body
  let sep = -1;
  for (let i = 0; i < bytes.length - 3; i++) {
    if (
      bytes[i] === 0x0d &&
      bytes[i + 1] === 0x0a &&
      bytes[i + 2] === 0x0d &&
      bytes[i + 3] === 0x0a
    ) {
      sep = i;
      break;
    }
  }
  if (sep < 0) {
    return { status: 0, texto: new TextDecoder().decode(bytes) };
  }

  const headersText = new TextDecoder().decode(bytes.slice(0, sep));
  const bodyBytes = bytes.slice(sep + 4);

  const lines = headersText.split("\r\n");
  const statusMatch = lines[0]?.match(/^HTTP\/\d\.\d\s+(\d+)/);
  const status = statusMatch ? Number(statusMatch[1]) : 0;

  const headers: Record<string, string> = {};
  for (let i = 1; i < lines.length; i++) {
    const colon = lines[i].indexOf(":");
    if (colon > 0) {
      headers[lines[i].slice(0, colon).trim().toLowerCase()] = lines[i]
        .slice(colon + 1)
        .trim();
    }
  }

  let bodyText: string;
  if (headers["transfer-encoding"]?.toLowerCase().includes("chunked")) {
    bodyText = decodeChunked(bodyBytes);
  } else {
    bodyText = new TextDecoder().decode(bodyBytes);
  }
  return { status, texto: bodyText };
}

function decodeChunked(bytes: Uint8Array): string {
  const text = new TextDecoder().decode(bytes);
  let out = "";
  let i = 0;
  while (i < text.length) {
    const lineEnd = text.indexOf("\r\n", i);
    if (lineEnd < 0) break;
    const sizeHex = text.slice(i, lineEnd).split(";")[0].trim();
    const size = parseInt(sizeHex, 16);
    if (Number.isNaN(size)) break;
    if (size === 0) break;
    i = lineEnd + 2;
    if (i + size > text.length) break;
    out += text.slice(i, i + size);
    i += size + 2; // CRLF após chunk
  }
  return out;
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
      basicAuth(apikey),
      body,
      TIMEOUT_MS
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/timeout/i.test(msg)) {
      throw new CedrusError("Timeout ao consultar Cedrus (60s).", 504);
    }
    throw new CedrusError(`Falha de rede ao consultar Cedrus: ${msg}`, 502);
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

  if (Array.isArray(json)) {
    return { devedores: json as Record<string, unknown>[] };
  }

  if (json && typeof json === "object") {
    const obj = json as Record<string, unknown>;

    const msg = typeof obj.message === "string" ? obj.message : undefined;
    if (msg && /nenhum|sem\s+result/i.test(msg)) {
      return { devedores: [], rawMessage: msg };
    }

    if (Array.isArray(obj.devedores)) {
      return { devedores: obj.devedores as Record<string, unknown>[] };
    }
    if (Array.isArray(obj.data)) {
      return { devedores: obj.data as Record<string, unknown>[] };
    }

    if (obj.cnpj_cpf || obj.id_devedor || obj.cod_devedor) {
      return { devedores: [obj] };
    }

    return { devedores: [], rawMessage: msg };
  }

  return { devedores: [] };
}
