// Edge Function: uazapi-webhook
//
// Recebe mensagens do canal NÃO-OFICIAL (uazapi). Como a uazapi bloqueia por IP,
// o inbound passa pelo n8n, que NORMALIZA o payload e faz POST aqui com:
//   { instancia, telefone, texto?, tipo?, media_url?, media_mime?, provider_msg_id? }
//   header: X-Painel-Secret: <webhook_secret do canal>
//
// Fluxo: resolve o canal pela instancia → valida o secret → cria/atualiza
// paciente+conversa (RPC) → grava a mensagem (direcao 'in').
// Autossuficiente (deploy pelo Dashboard).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-painel-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

interface Env {
  url: string;
  serviceKey: string;
}
function lerEnv(): Env {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) throw new Error("Env do Supabase ausente");
  return { url, serviceKey };
}

async function rest(
  env: Env,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<Response> {
  return fetch(`${env.url}/rest/v1${path}`, {
    method,
    headers: {
      apikey: env.serviceKey,
      Authorization: `Bearer ${env.serviceKey}`,
      "Content-Type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

const soDigitos = (s: unknown) => String(s ?? "").replace(/\D/g, "");

interface CanalRow {
  id: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const env = lerEnv();
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const instancia = String(body.instancia ?? "").trim();
    const telefone = soDigitos(body.telefone);
    const texto = body.texto != null ? String(body.texto) : "";
    const tipo = String(body.tipo ?? "texto");
    const mediaUrl = body.media_url ? String(body.media_url) : null;
    const mediaMime = body.media_mime ? String(body.media_mime) : null;
    const providerMsgId = body.provider_msg_id
      ? String(body.provider_msg_id)
      : null;

    if (!instancia) return json({ error: "instancia ausente" }, 400);
    if (!telefone) return json({ error: "telefone ausente" }, 400);
    if (!texto && !mediaUrl) return json({ ok: true, ignorado: "vazio" });

    // Resolve o canal não-oficial pela instância.
    const canalResp = await rest(
      env,
      "GET",
      `/canais?tipo=eq.uazapi&instancia=eq.${encodeURIComponent(instancia)}&select=id&limit=1`,
    );
    const canais = canalResp.ok ? ((await canalResp.json()) as CanalRow[]) : [];
    const canal = canais[0];
    if (!canal) return json({ error: "Canal (instância) não cadastrado" }, 404);

    // Valida o secret compartilhado.
    const segResp = await rest(
      env,
      "GET",
      `/canal_secrets?canal_id=eq.${canal.id}&select=webhook_secret`,
    );
    const segs = segResp.ok
      ? ((await segResp.json()) as { webhook_secret: string }[])
      : [];
    const secret = segs[0]?.webhook_secret ?? "";
    const recebido = req.headers.get("x-painel-secret") ?? "";
    if (secret && secret !== recebido) {
      return json({ error: "Secret inválido" }, 401);
    }

    // Upsert paciente + conversa (sem referral — canal não-oficial).
    const rpc = await rest(env, "POST", "/rpc/crm_registrar_inbound", {
      p_canal_id: canal.id,
      p_telefone: telefone,
      p_conversation_id: null,
    });
    if (!rpc.ok) {
      const t = await rpc.text();
      return json({ error: `Falha no registro: ${t}` }, 500);
    }
    const linhas = (await rpc.json()) as {
      conversa_id: number;
      unidade_id: number;
    }[];
    const reg = Array.isArray(linhas) ? linhas[0] : linhas;
    if (!reg?.conversa_id) return json({ error: "conversa não resolvida" }, 500);

    await rest(env, "POST", "/mensagens", {
      conversa_id: reg.conversa_id,
      unidade_id: reg.unidade_id,
      direcao: "in",
      tipo,
      conteudo: texto || null,
      media_url: mediaUrl,
      media_mime: mediaMime,
      provider_msg_id: providerMsgId,
    });

    return json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message }, 500);
  }
});
