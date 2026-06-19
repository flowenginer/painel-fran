// Edge Function: uazapi-proxy
//
// Proxy autenticado que repassa chamadas do painel para um webhook do n8n
// (rodando na mesma VPS que já tem IP autorizado na allowlist da UAZAPI).
// O n8n por sua vez fala com chelsan.uazapi.com.
//
// Fluxo:
//   Painel → uazapi-proxy → webhook do n8n → UAZAPI
//
// Multi-canal: o painel envia `instancia` (nome da instância UAZAPI, ex.:
// "qi06bK"). O n8n resolve o token dessa instância e roteia status/connect/
// disconnect para o número certo. Sem `instancia`, o n8n usa o canal padrão.
//
// Configuração necessária em fran_config:
//   - uazapi_webhook_url     URL completa do webhook no n8n
//   - uazapi_webhook_secret  segredo enviado via header X-Painel-Secret
//
// Autossuficiente (sem imports de ../_shared) para deploy pelo editor do
// Supabase Dashboard, sem CLI.

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

async function validarJwt(env: SupabaseEnv, authHeader: string): Promise<void> {
  const resp = await fetch(`${env.url}/auth/v1/user`, {
    headers: { Authorization: authHeader, apikey: env.anonKey },
  });
  if (!resp.ok) throw new Error(`Sessão inválida (HTTP ${resp.status})`);
  const user = (await resp.json()) as { id?: string };
  if (!user?.id) throw new Error("Usuário sem id");
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
  const rows = (await resp.json()) as Array<{
    chave: string;
    valor: string | null;
  }>;
  const mapa: Record<string, string> = {};
  for (const r of rows) mapa[r.chave] = r.valor ?? "";
  return mapa;
}

const TIMEOUT_MS = 30_000;

type Acao = "status" | "connect" | "disconnect";
const ACOES_VALIDAS: Acao[] = ["status", "connect", "disconnect"];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Método não permitido" }, 405);
  }

  try {
    const env = lerEnv();

    // 1. Valida JWT do operador
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Header Authorization ausente" }, 401);
    }
    try {
      await validarJwt(env, authHeader);
    } catch (err) {
      return jsonResponse(
        {
          error: "Sessão inválida ou expirada. Faça login novamente.",
          detail: err instanceof Error ? err.message : String(err),
        },
        401
      );
    }

    // 2. Valida body
    const raw = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const acao = String(raw.acao ?? "").trim() as Acao;
    if (!ACOES_VALIDAS.includes(acao)) {
      return jsonResponse(
        { error: `Ação inválida. Use uma das: ${ACOES_VALIDAS.join(", ")}` },
        400
      );
    }
    const instancia =
      typeof raw.instancia === "string" && raw.instancia.trim()
        ? raw.instancia.trim()
        : null;

    // 3. Lê configs
    const cfg = await lerConfig(env, [
      "uazapi_webhook_url",
      "uazapi_webhook_secret",
    ]);
    const webhookUrl = cfg.uazapi_webhook_url?.trim();
    const secret = cfg.uazapi_webhook_secret?.trim();
    if (!webhookUrl) {
      return jsonResponse(
        {
          error:
            "URL do webhook UAZAPI não configurada. Defina uazapi_webhook_url em Configurações.",
        },
        400
      );
    }
    if (!secret) {
      return jsonResponse(
        {
          error:
            "Secret do webhook UAZAPI não configurado. Defina uazapi_webhook_secret em Configurações.",
        },
        400
      );
    }

    // 4. Chama o n8n (repassa a instância para roteamento por número)
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
        body: JSON.stringify({ acao, instancia }),
        signal: ctrl.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      const msg = err instanceof Error ? err.message : String(err);
      if (err instanceof Error && err.name === "AbortError") {
        return jsonResponse({ error: "Timeout ao chamar webhook n8n" }, 504);
      }
      return jsonResponse(
        { error: `Falha de rede ao chamar webhook: ${msg}` },
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
      return jsonResponse(
        {
          error: `Webhook n8n retornou HTTP ${resp.status}`,
          detail: json ?? texto.slice(0, 500),
        },
        resp.status === 401 ? 502 : resp.status
      );
    }

    // O n8n retorna um array com 1 item — desencapsula.
    let data: unknown = json;
    if (Array.isArray(json) && json.length > 0) {
      data = json[0];
    }

    return jsonResponse(data);
  } catch (err) {
    console.error("[uazapi-proxy] exceção não tratada:", err);
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 500);
  }
});
