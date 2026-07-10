// Edge Function: zernio-templates
// Proxy autenticado para templates, criação/remoção e status da conta Zernio.
// Lê as credenciais da fran_config (banco) com fallback para os Secrets.

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

interface Env { supabaseUrl: string; anonKey: string; serviceKey: string; }

function lerEnvSupabase(): Env {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) throw new Error("Variaveis Supabase ausentes");
  return { supabaseUrl, anonKey, serviceKey };
}

async function lerZernioConfig(env: Env): Promise<{ zernioApiKey: string; zernioAccountId: string; zernioProfileId: string }> {
  const resp = await fetch(
    `${env.supabaseUrl}/rest/v1/fran_config?chave=in.(zernio_api_key,zernio_account_id,zernio_profile_id)&select=chave,valor`,
    { headers: { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}` } },
  );
  const mapa: Record<string, string> = {};
  if (resp.ok) {
    const rows = (await resp.json().catch(() => [])) as Array<{ chave: string; valor: string | null }>;
    for (const r of rows) mapa[r.chave] = r.valor ?? "";
  }
  const zernioApiKey = mapa["zernio_api_key"] || Deno.env.get("ZERNIO_API_KEY") || "";
  const zernioAccountId = mapa["zernio_account_id"] || Deno.env.get("ZERNIO_ACCOUNT_ID") || "";
  const zernioProfileId = mapa["zernio_profile_id"] || Deno.env.get("ZERNIO_PROFILE_ID") || "";
  if (!zernioApiKey) throw new Error("zernio_api_key nao configurada");
  if (!zernioAccountId) throw new Error("zernio_account_id nao configurado");
  if (!zernioProfileId) throw new Error("zernio_profile_id nao configurado");
  return { zernioApiKey, zernioAccountId, zernioProfileId };
}

async function validarJwt(env: Env, authHeader: string): Promise<{ id: string }> {
  const resp = await fetch(`${env.supabaseUrl}/auth/v1/user`, { headers: { Authorization: authHeader, apikey: env.anonKey } });
  if (!resp.ok) throw new Error(`Sessao invalida (HTTP ${resp.status})`);
  const user = (await resp.json()) as { id?: string };
  if (!user?.id) throw new Error("Usuario sem id");
  return { id: user.id };
}

async function verificarAdmin(env: Env, userId: string): Promise<boolean> {
  const resp = await fetch(`${env.supabaseUrl}/rest/v1/fran_usuarios?id=eq.${userId}&select=role,ativo`, { headers: { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}` } });
  if (!resp.ok) return false;
  const rows = (await resp.json()) as Array<{ role: string; ativo: boolean }>;
  return rows[0]?.role === "admin" && rows[0]?.ativo === true;
}

async function zernioFetch(apiKey: string, method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(`https://zernio.com/api${path}`, {
    method,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonErr({ error: "Metodo nao permitido" }, 405);

  try {
    const env = lerEnvSupabase();
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonErr({ error: "Nao autorizado" }, 401);
    let userId: string;
    try { userId = (await validarJwt(env, authHeader)).id; } catch { return jsonErr({ error: "Sessao invalida" }, 401); }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const acao = String(body.acao ?? "");

    const cfg = await lerZernioConfig(env);

    // LISTAR
    if (acao === "listar") {
      const resp = await zernioFetch(cfg.zernioApiKey, "GET", `/v1/whatsapp/templates?accountId=${encodeURIComponent(cfg.zernioAccountId)}`);
      if (!resp.ok) { const t = await resp.text().catch(() => ""); return jsonErr({ error: `Zernio erro ${resp.status}: ${t}` }, 502); }
      const data = (await resp.json()) as { templates?: unknown[] };
      return jsonOk({ templates: data.templates ?? [] });
    }

    // CRIAR (admin only)
    if (acao === "criar") {
      if (!(await verificarAdmin(env, userId))) return jsonErr({ error: "Apenas admins podem criar templates" }, 403);
      const { name, category, language, components } = body;
      if (!name || !category || !language || !components) return jsonErr({ error: "name, category, language e components sao obrigatorios" }, 400);
      const zernioPayload = { profileId: cfg.zernioProfileId, accountId: cfg.zernioAccountId, name, category, language, components };
      const resp = await zernioFetch(cfg.zernioApiKey, "POST", "/v1/whatsapp/templates", zernioPayload);
      const respText = await resp.text().catch(() => "");
      if (!resp.ok) return jsonErr({ error: `Zernio erro ${resp.status}: ${respText}` }, 502);
      let data: Record<string, unknown> = {};
      try { data = JSON.parse(respText); } catch { /* ignore */ }
      console.log(`[zernio-templates] Template "${name}" criado por ${userId}`);
      return jsonOk({ template: data.template ?? data });
    }

    // DELETAR (admin only)
    if (acao === "deletar") {
      if (!(await verificarAdmin(env, userId))) return jsonErr({ error: "Apenas admins podem deletar templates" }, 403);
      const name = String(body.name ?? "");
      if (!name) return jsonErr({ error: "name e obrigatorio" }, 400);
      const resp = await zernioFetch(cfg.zernioApiKey, "DELETE", `/v1/whatsapp/templates/${encodeURIComponent(name)}?accountId=${encodeURIComponent(cfg.zernioAccountId)}`);
      if (!resp.ok) { const t = await resp.text().catch(() => ""); return jsonErr({ error: `Zernio erro ${resp.status}: ${t}` }, 502); }
      console.log(`[zernio-templates] Template "${name}" deletado por ${userId}`);
      return jsonOk({ ok: true });
    }

    // STATUS DA CONTA
    if (acao === "status_conta") {
      const resp = await zernioFetch(cfg.zernioApiKey, "GET", `/v1/whatsapp/phone-numbers?accountId=${encodeURIComponent(cfg.zernioAccountId)}`);
      if (!resp.ok) { const t = await resp.text().catch(() => ""); return jsonErr({ error: `Zernio erro ${resp.status}: ${t}` }, 502); }
      const data = (await resp.json()) as { connected?: Array<{ accountId: string; phoneNumber: string; displayName: string; profileId: string; connectedAt: string }>; numbers?: unknown[]; sandbox?: unknown };
      const connected = data.connected ?? [];
      const numero = connected[0];
      if (!numero) return jsonOk({ numero: "", nome: "", status: "disconnected", healthy: false, sending_limited: false, quality_rating: null, throughput: null, verified_name: null, official_business_account: false, messaging_limit: null, connected_at: null });
      return jsonOk({ numero: numero.phoneNumber, nome: numero.displayName, status: "connected", healthy: true, sending_limited: false, quality_rating: null, throughput: null, verified_name: numero.displayName, official_business_account: false, messaging_limit: null, connected_at: numero.connectedAt });
    }

    return jsonErr({ error: `Acao desconhecida: ${acao}` }, 400);

  } catch (err) {
    console.error("[zernio-templates] Excecao:", err);
    return jsonErr({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
