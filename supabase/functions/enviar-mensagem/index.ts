// Edge Function: enviar-mensagem
//
// Envia uma mensagem do painel (operadora) para o lead via n8n → UAZAPI e
// grava a mensagem enviada na fran_memory (para aparecer na thread).
//
// Por que pelo n8n: a UAZAPI bloqueia por IP (allowlist). O Edge não tem IP
// fixo; o n8n da Chelsan está autorizado. Mesmo caminho do uazapi-proxy.
//
// Autorização: só a operadora dona da conversa (ou um admin) pode enviar.
//
// Autossuficiente (sem imports de ../_shared) para deploy pelo editor do
// Supabase Dashboard, sem CLI.

// ── helpers inlinados ──────────────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

interface SupabaseEnv {
  url: string;
  anonKey: string;
  serviceKey: string;
}

function lerEnv(): SupabaseEnv {
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) {
    throw new Error("Variáveis de ambiente do Supabase ausentes");
  }
  return { url, anonKey, serviceKey };
}

async function validarJwt(
  env: SupabaseEnv,
  authHeader: string
): Promise<{ id: string }> {
  const resp = await fetch(`${env.url}/auth/v1/user`, {
    headers: { Authorization: authHeader, apikey: env.anonKey },
  });
  if (!resp.ok) throw new Error(`Sessão inválida (HTTP ${resp.status})`);
  const user = (await resp.json()) as { id?: string };
  if (!user?.id) throw new Error("Usuário sem id");
  return { id: user.id };
}

async function rest(
  env: SupabaseEnv,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {}
): Promise<Response> {
  return fetch(`${env.url}/rest/v1${path}`, {
    method,
    headers: {
      apikey: env.serviceKey,
      Authorization: `Bearer ${env.serviceKey}`,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function lerConfig(
  env: SupabaseEnv,
  chaves: string[]
): Promise<Record<string, string>> {
  const filtro = `chave=in.(${chaves.join(",")})`;
  const resp = await fetch(
    `${env.url}/rest/v1/fran_config?${filtro}&select=chave,valor`,
    {
      headers: {
        apikey: env.serviceKey,
        Authorization: `Bearer ${env.serviceKey}`,
      },
    }
  );
  if (!resp.ok) throw new Error(`Falha ao ler fran_config: ${resp.status}`);
  const rows = (await resp.json()) as Array<{ chave: string; valor: string | null }>;
  const mapa: Record<string, string> = {};
  for (const r of rows) mapa[r.chave] = r.valor ?? "";
  return mapa;
}

function soDigitos(s: string): string {
  return (s ?? "").replace(/\D/g, "");
}

const TIMEOUT_MS = 30_000;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Método não permitido" }, 405);
  }

  try {
    const env = lerEnv();

    // 1. Autentica.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Não autorizado" }, 401);
    let callerId: string;
    try {
      callerId = (await validarJwt(env, authHeader)).id;
    } catch {
      return jsonResponse({ error: "Sessão inválida" }, 401);
    }

    // 2. Body.
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const telefone = soDigitos(String(body.telefone ?? ""));
    const texto = String(body.texto ?? "").trim();
    if (!telefone) return jsonResponse({ error: "telefone é obrigatório" }, 400);
    if (!texto) return jsonResponse({ error: "Mensagem vazia" }, 400);

    // 3. Permissão: admin OU dona da conversa.
    const perfilResp = await rest(
      env,
      "GET",
      `/fran_usuarios?id=eq.${callerId}&select=role,ativo,nome`
    );
    const perfil = (await perfilResp.json()) as Array<{
      role: string;
      ativo: boolean;
      nome: string | null;
    }>;
    const p = perfil[0];
    if (!p || !p.ativo) {
      return jsonResponse({ error: "Usuário inválido ou inativo" }, 403);
    }
    if (p.role !== "admin") {
      const convResp = await rest(
        env,
        "GET",
        `/fran_conversas?telefone_normalizado=eq.${telefone}&select=responsavel_id`
      );
      const conv = (await convResp.json()) as Array<{
        responsavel_id: string | null;
      }>;
      const dono = conv[0]?.responsavel_id ?? null;
      if (dono !== callerId) {
        return jsonResponse(
          { error: "Você não é responsável por esta conversa" },
          403
        );
      }
    }

    // 4. Configuração do webhook n8n (mesmo do uazapi-proxy).
    const cfg = await lerConfig(env, [
      "uazapi_webhook_url",
      "uazapi_webhook_secret",
    ]);
    const webhookUrl = cfg.uazapi_webhook_url?.trim();
    const secret = cfg.uazapi_webhook_secret?.trim();
    if (!webhookUrl || !secret) {
      return jsonResponse(
        { error: "Webhook UAZAPI não configurado (URL/secret)." },
        400
      );
    }

    // Assinatura do operador: prefixa "*Nome:*" (negrito no WhatsApp).
    const nome = (p.nome ?? "").trim();
    const textoFinal = nome ? `*${nome}:*\n${texto}` : texto;

    // 5. Envia via n8n.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let resp: Response;
    try {
      resp = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Painel-Secret": secret,
        },
        body: JSON.stringify({
          acao: "enviar",
          telefone,
          tipo: "texto",
          texto: textoFinal,
          media_url: null,
        }),
        signal: ctrl.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      const msg = err instanceof Error ? err.message : String(err);
      const isAbort = err instanceof Error && err.name === "AbortError";
      return jsonResponse(
        { error: isAbort ? "Timeout ao enviar pelo n8n" : `Falha de rede: ${msg}` },
        isAbort ? 504 : 502
      );
    }
    clearTimeout(timer);

    // Lê o corpo da resposta do n8n para saber o resultado REAL da UAZAPI.
    const rawTexto = await resp.text().catch(() => "");
    let rawJson: unknown = null;
    try {
      rawJson = rawTexto ? JSON.parse(rawTexto) : null;
    } catch {
      rawJson = null;
    }
    // n8n às vezes devolve um array com 1 item — desencapsula.
    const corpo = (Array.isArray(rawJson) ? rawJson[0] : rawJson) as
      | Record<string, unknown>
      | null;

    // Falha se: HTTP não-ok, OU o corpo indica erro (ok=false / erro / error).
    // A branch n8n DEVE propagar a falha da UAZAPI (não responder ok cego).
    const indicaErro =
      !!corpo &&
      (corpo.ok === false ||
        corpo.success === false ||
        Boolean(corpo.erro) ||
        Boolean(corpo.error));
    if (!resp.ok || indicaErro) {
      const motivo =
        (corpo &&
          (corpo.erro || corpo.error) &&
          String(corpo.erro ?? corpo.error)) ||
        `Falha no envio (HTTP ${resp.status})`;
      // NÃO grava na thread — a mensagem não chegou ao lead.
      return jsonResponse(
        { ok: false, error: `Não enviado: ${motivo}` },
        200
      );
    }

    // 6. Grava na fran_memory (formato LangChain) para aparecer na thread.
    const insResp = await rest(
      env,
      "POST",
      "/fran_memory",
      {
        session_id: telefone,
        message: { type: "ai", content: textoFinal, additional_kwargs: {} },
        enviado_por: callerId,
      },
      { Prefer: "return=minimal" }
    );
    if (!insResp.ok) {
      const t = await insResp.text().catch(() => "");
      // A mensagem foi enviada ao lead, mas não conseguimos gravar — reporta
      // para o painel poder avisar/forçar refresh.
      console.error("[enviar-mensagem] falha ao gravar fran_memory:", t);
      return jsonResponse(
        { ok: true, gravado: false, aviso: "Enviada, mas não registrada na thread." },
        200
      );
    }

    return jsonResponse({ ok: true, gravado: true });
  } catch (err) {
    console.error("[enviar-mensagem] exceção:", err);
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 500);
  }
});
