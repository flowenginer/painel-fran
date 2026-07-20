// Edge Function: midia-proxy
//
// Busca um arquivo de mídia (PDF, imagem, doc...) no servidor e o devolve
// inline, com o Content-Type correto e SEM X-Frame-Options — permitindo que o
// navegador renderize (ex.: PDF nativo em iframe/nova aba). Resolve o caso do
// UAZAPI, que recusa ser embutido em iframe, e a instabilidade do Google gview.
//
// Uso: GET /midia-proxy?url=<url-encodada>[&nome=arquivo.pdf]
// É público (iframes/novas abas não enviam Authorization), com proteção
// anti-SSRF: só http/https e bloqueia hosts privados/loopback/metadados.
// Autossuficiente (deploy pelo Dashboard).
//
// Zernio: a API de mídia (`zernio.com/api/v1/whatsapp/media/...`) exige
// `Authorization: Bearer <zernio_api_key>` — sem isso o upstream responde 401.
// Como o navegador não envia esse header em <img>/<audio>/<video> src, o
// proxy busca `zernio_api_key` em `fran_config` (service role) e injeta o
// Bearer sempre que o host de destino for zernio.com.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, range",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

// Bloqueia IPs privados / loopback / link-local / metadados de nuvem (anti-SSRF).
function hostPerigoso(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h === "metadata.google.internal") return true;
  // IPv4?
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 127 || a === 10 || a === 0) return true; // loopback / privado
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true; // link-local / metadados
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  }
  if (h === "::1" || h.startsWith("fd") || h.startsWith("fe80")) return true; // IPv6 privado
  return false;
}

// Busca a zernio_api_key em fran_config (com fallback pro Secret da função).
async function lerZernioApiKey(): Promise<string> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (supabaseUrl && serviceKey) {
    try {
      const resp = await fetch(
        `${supabaseUrl}/rest/v1/fran_config?chave=eq.zernio_api_key&select=valor`,
        { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
      );
      if (resp.ok) {
        const rows = (await resp.json().catch(() => [])) as Array<{ valor: string | null }>;
        if (rows[0]?.valor) return rows[0].valor;
      }
    } catch {
      // ignora — cai no fallback abaixo
    }
  }
  return Deno.env.get("ZERNIO_API_KEY") || "";
}

function ehHostZernio(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "zernio.com" || h.endsWith(".zernio.com");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") {
    return new Response("Método não permitido", { status: 405, headers: corsHeaders });
  }

  try {
    const params = new URL(req.url).searchParams;
    const alvo = params.get("url");
    const nome = params.get("nome");
    if (!alvo) return new Response("Parâmetro 'url' ausente", { status: 400, headers: corsHeaders });

    let u: URL;
    try {
      u = new URL(alvo);
    } catch {
      return new Response("URL inválida", { status: 400, headers: corsHeaders });
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return new Response("Protocolo não permitido", { status: 400, headers: corsHeaders });
    }
    if (hostPerigoso(u.hostname)) {
      return new Response("Host não permitido", { status: 403, headers: corsHeaders });
    }

    // Repassa o Range (útil para <audio>/<video> com seek).
    const range = req.headers.get("range");
    const upstreamHeaders: Record<string, string> = {};
    if (range) upstreamHeaders.Range = range;
    if (ehHostZernio(u.hostname)) {
      const zernioApiKey = await lerZernioApiKey();
      if (zernioApiKey) upstreamHeaders.Authorization = `Bearer ${zernioApiKey}`;
    }
    const upstream = await fetch(u.toString(), {
      headers: upstreamHeaders,
      redirect: "follow",
    });

    if (!upstream.ok && upstream.status !== 206) {
      return new Response(`Falha ao buscar o arquivo (HTTP ${upstream.status})`, {
        status: 502,
        headers: corsHeaders,
      });
    }

    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    const headers = new Headers(corsHeaders);
    headers.set("Content-Type", contentType);
    headers.set(
      "Content-Disposition",
      `inline${nome ? `; filename="${nome.replace(/["\r\n]/g, "")}"` : ""}`,
    );
    headers.set("Cache-Control", "private, max-age=3600");
    const len = upstream.headers.get("content-length");
    if (len) headers.set("Content-Length", len);
    const acceptRanges = upstream.headers.get("accept-ranges");
    if (acceptRanges) headers.set("Accept-Ranges", acceptRanges);
    const contentRange = upstream.headers.get("content-range");
    if (contentRange) headers.set("Content-Range", contentRange);
    // NÃO propaga X-Frame-Options / CSP do upstream → permite embutir em iframe.

    return new Response(upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(`Erro no proxy: ${msg}`, { status: 500, headers: corsHeaders });
  }
});
