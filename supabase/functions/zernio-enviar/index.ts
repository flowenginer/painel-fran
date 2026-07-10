// Edge Function: zernio-enviar
// Envia mensagem via Zernio (API Oficial WhatsApp Business) para uma conversa
// já existente no inbox. Lê as credenciais da fran_config (banco) com fallback
// para os Secrets das Edge Functions.
//
// Formato do corpo aceito pela API do Zernio (inbox send message):
//   POST /api/v1/inbox/conversations/{conversationId}/messages
//   body: { accountId, message }                 (texto)
//   body: { accountId, attachmentUrl, message? } (midia; message = legenda)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonOk(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
}
function jsonErr(body: unknown, status = 400): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });
}
function soDigitos(s: string): string { return (s ?? "").replace(/\D/g, ""); }

interface Env { supabaseUrl: string; anonKey: string; serviceKey: string; }

function lerEnvSupabase(): Env {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) throw new Error("Variaveis Supabase ausentes");
  return { supabaseUrl, anonKey, serviceKey };
}

async function lerZernioConfig(env: Env): Promise<{ zernioApiKey: string; zernioAccountId: string }> {
  const resp = await fetch(
    `${env.supabaseUrl}/rest/v1/fran_config?chave=in.(zernio_api_key,zernio_account_id)&select=chave,valor`,
    { headers: { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}` } },
  );
  const mapa: Record<string, string> = {};
  if (resp.ok) {
    const rows = (await resp.json().catch(() => [])) as Array<{ chave: string; valor: string | null }>;
    for (const r of rows) mapa[r.chave] = r.valor ?? "";
  }
  const zernioApiKey = mapa["zernio_api_key"] || Deno.env.get("ZERNIO_API_KEY") || "";
  const zernioAccountId = mapa["zernio_account_id"] || Deno.env.get("ZERNIO_ACCOUNT_ID") || "";
  if (!zernioApiKey) throw new Error("zernio_api_key nao configurada");
  if (!zernioAccountId) throw new Error("zernio_account_id nao configurado");
  return { zernioApiKey, zernioAccountId };
}

async function validarJwt(env: Env, authHeader: string): Promise<{ id: string }> {
  const resp = await fetch(`${env.supabaseUrl}/auth/v1/user`, { headers: { Authorization: authHeader, apikey: env.anonKey } });
  if (!resp.ok) throw new Error(`Sessao invalida (HTTP ${resp.status})`);
  const user = (await resp.json()) as { id?: string };
  if (!user?.id) throw new Error("Usuario sem id");
  return { id: user.id };
}

async function rest(env: Env, method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}): Promise<Response> {
  return fetch(`${env.supabaseUrl}/rest/v1${path}`, {
    method,
    headers: { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}`, "Content-Type": "application/json", ...extraHeaders },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function rpc(env: Env, fn: string, params: Record<string, unknown>): Promise<Response> {
  return fetch(`${env.supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonErr({ error: "Metodo nao permitido" }, 405);

  try {
    const env = lerEnvSupabase();
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonErr({ error: "Nao autorizado" }, 401);
    let callerId: string;
    try { callerId = (await validarJwt(env, authHeader)).id; } catch { return jsonErr({ error: "Sessao invalida" }, 401); }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const telefone = soDigitos(String(body.telefone ?? ""));
    const texto = String(body.texto ?? "").trim();
    const tipo = String(body.tipo ?? "texto");
    const mediaUrl = typeof body.media_url === "string" && body.media_url.trim() ? body.media_url.trim() : null;
    const ehMidia = tipo !== "texto";

    if (!telefone) return jsonErr({ error: "telefone e obrigatorio" }, 400);
    if (ehMidia && !mediaUrl) return jsonErr({ error: "media_url e obrigatorio para midia" }, 400);
    if (!ehMidia && !texto) return jsonErr({ error: "Mensagem vazia" }, 400);

    // Verificar permissão
    const perfilResp = await rest(env, "GET", `/fran_usuarios?id=eq.${callerId}&select=role,ativo,nome`);
    const perfil = (await perfilResp.json()) as Array<{ role: string; ativo: boolean; nome: string | null }>;
    const p = perfil[0];
    if (!p || !p.ativo) return jsonErr({ error: "Usuario invalido ou inativo" }, 403);

    if (p.role !== "admin") {
      const convResp = await rest(env, "GET", `/fran_conversas?telefone_normalizado=eq.${telefone}&select=responsavel_id`);
      const conv = (await convResp.json()) as Array<{ responsavel_id: string | null }>;
      if (conv[0]?.responsavel_id !== callerId) return jsonErr({ error: "Voce nao e responsavel por esta conversa" }, 403);
    }

    // Config Zernio (uma leitura só, reaproveitada abaixo)
    const { zernioApiKey, zernioAccountId } = await lerZernioConfig(env);

    // Buscar conversationId do Zernio para este telefone
    const convIdResp = await rpc(env, "fran_zernio_conversa_id", { p_telefone: telefone, p_account_id: zernioAccountId });
    const conversationId = convIdResp.ok ? ((await convIdResp.json().catch(() => null)) as string | null) : null;
    if (!conversationId) return jsonErr({ error: "Nenhuma conversa Zernio encontrada para este numero. Use broadcast com template para iniciar." }, 400);

    const nome = (p.nome ?? "").trim();
    const textoFinal = nome && texto ? `*${nome}:*\n${texto}` : texto;

    // Corpo aceito pela API do Zernio: { accountId, message } (texto) / { accountId, attachmentUrl, message? } (midia)
    let zernioBody: Record<string, unknown>;
    if (ehMidia) {
      zernioBody = { accountId: zernioAccountId, attachmentUrl: mediaUrl, ...(textoFinal ? { message: textoFinal } : {}) };
    } else {
      zernioBody = { accountId: zernioAccountId, message: textoFinal };
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30_000);
    let zernioResp: Response;
    try {
      zernioResp = await fetch(`https://zernio.com/api/v1/inbox/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${zernioApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(zernioBody),
        signal: ctrl.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      const isAbort = err instanceof Error && err.name === "AbortError";
      return jsonErr({ error: isAbort ? "Timeout ao enviar pelo Zernio" : `Falha de rede: ${String(err)}` }, isAbort ? 504 : 502);
    }
    clearTimeout(timer);

    if (!zernioResp.ok) {
      const t = await zernioResp.text().catch(() => "");
      console.error("[zernio-enviar] Falha Zernio:", zernioResp.status, t);
      return jsonOk({ ok: false, error: `Zernio retornou erro ${zernioResp.status}: ${t}` });
    }

    const placeholders: Record<string, string> = { imagem: "[imagem]", audio: "[audio]", documento: "[documento]", video: "[video]" };
    const content = ehMidia ? (textoFinal || placeholders[tipo] || "[midia]") : textoFinal;
    const additional_kwargs = ehMidia ? { media_tipo: tipo, media_url: mediaUrl } : {};

    const insResp = await rest(env, "POST", "/fran_memory", {
      session_id: telefone,
      message: { type: "ai", content, additional_kwargs },
      enviado_por: callerId,
      canal: `zernio:${zernioAccountId}`,
    }, { Prefer: "return=minimal" });

    if (!insResp.ok) {
      const t = await insResp.text().catch(() => "");
      console.error("[zernio-enviar] Falha ao gravar fran_memory:", t);
      return jsonOk({ ok: true, gravado: false, aviso: "Mensagem enviada, mas nao registrada na thread." });
    }

    console.log(`[zernio-enviar] OK | telefone=${telefone} | conv=${conversationId}`);
    return jsonOk({ ok: true, gravado: true });

  } catch (err) {
    console.error("[zernio-enviar] Excecao:", err);
    return jsonErr({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
