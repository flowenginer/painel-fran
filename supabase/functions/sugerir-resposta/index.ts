// Edge Function: sugerir-resposta
//
// Gera uma SUGESTÃO de resposta (via OpenAI) para a operadora responder o
// devedor no chat. Usa o histórico da conversa (fran_memory) + dados do lead
// (fran_devedores) como contexto. É 100% assistivo: NÃO envia mensagem e NÃO
// grava nada. A operadora copia, ajusta e envia manualmente.
//
// Autossuficiente (sem imports de ../_shared) para deploy pelo editor do
// Supabase Dashboard, sem CLI.
//
// Requer o segredo OPENAI_API_KEY nas variáveis das Edge Functions.

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
  method: "GET" | "POST",
  path: string
): Promise<Response> {
  return fetch(`${env.url}/rest/v1${path}`, {
    method,
    headers: {
      apikey: env.serviceKey,
      Authorization: `Bearer ${env.serviceKey}`,
      "Content-Type": "application/json",
    },
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
  if (!resp.ok) return {};
  const rows = (await resp.json()) as Array<{
    chave: string;
    valor: string | null;
  }>;
  const mapa: Record<string, string> = {};
  for (const r of rows) mapa[r.chave] = r.valor ?? "";
  return mapa;
}

function soDigitos(s: string): string {
  return (s ?? "").replace(/\D/g, "");
}

// Variantes com/sem o 9º dígito do celular BR (para casar o telefone com o
// session_id da fran_memory).
function variantes(d: string): string[] {
  const set = new Set<string>([d]);
  if (d.startsWith("55")) {
    const ddd = d.slice(2, 4);
    const resto = d.slice(4);
    if (d.length === 13 && resto.startsWith("9")) {
      set.add("55" + ddd + resto.slice(1));
    } else if (d.length === 12) {
      set.add("55" + ddd + "9" + resto);
    }
  }
  return Array.from(set);
}

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const TIMEOUT_MS = 30_000;

interface Turno {
  role: "user" | "assistant";
  content: string;
}

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
    if (!telefone) {
      return jsonResponse({ error: "telefone é obrigatório" }, 400);
    }
    const rawMsgs = Array.isArray(body.mensagens) ? body.mensagens : [];
    const mensagens: Turno[] = rawMsgs
      .filter(
        (m): m is Turno =>
          !!m &&
          typeof m === "object" &&
          ((m as Turno).role === "user" ||
            (m as Turno).role === "assistant") &&
          typeof (m as Turno).content === "string"
      )
      .slice(-12)
      .map((m) => ({ role: m.role, content: String(m.content).slice(0, 2000) }));

    // 3. Permissão: admin OU dona da conversa. De passagem, pega o devedor.
    const perfilResp = await rest(
      env,
      "GET",
      `/fran_usuarios?id=eq.${callerId}&select=role,ativo`
    );
    const perfil = (await perfilResp.json()) as Array<{
      role: string;
      ativo: boolean;
    }>;
    const p = perfil[0];
    if (!p || !p.ativo) {
      return jsonResponse({ error: "Usuário inválido ou inativo" }, 403);
    }
    const convResp = await rest(
      env,
      "GET",
      `/fran_conversas?telefone_normalizado=eq.${telefone}&select=devedor_id,responsavel_id`
    );
    const conv = (await convResp.json()) as Array<{
      devedor_id: number | null;
      responsavel_id: string | null;
    }>;
    const devedorId = conv[0]?.devedor_id ?? null;
    if (p.role !== "admin") {
      if ((conv[0]?.responsavel_id ?? null) !== callerId) {
        return jsonResponse(
          { error: "Você não é responsável por esta conversa" },
          403
        );
      }
    }

    // 4. Chave da OpenAI (segredo do ambiente da Edge).
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return jsonResponse(
        {
          ok: false,
          error:
            "IA não configurada: defina o segredo OPENAI_API_KEY nas Edge Functions.",
        },
        200
      );
    }
    const cfg = await lerConfig(env, ["openai_model"]);
    const model = cfg.openai_model?.trim() || "gpt-4o-mini";

    // 5. Contexto: dados do lead.
    let devedorInfo = "(sem dados do lead)";
    if (devedorId != null) {
      const dResp = await rest(
        env,
        "GET",
        `/fran_devedores?id=eq.${devedorId}&select=nome_devedor,instituicao,valor_atualizado,status_negociacao`
      );
      const d = (
        (await dResp.json()) as Array<Record<string, unknown>>
      )[0];
      if (d) {
        devedorInfo = `Nome: ${d.nome_devedor ?? "-"}; Instituição: ${
          d.instituicao ?? "-"
        }; Valor atualizado: ${d.valor_atualizado ?? "-"}; Status: ${
          d.status_negociacao ?? "-"
        }`;
      }
    }

    // 6. Contexto: histórico recente da conversa.
    const vars = variantes(telefone).join(",");
    const memResp = await rest(
      env,
      "GET",
      `/fran_memory?session_id=in.(${vars})&select=message&order=id.desc&limit=20`
    );
    const rows = memResp.ok
      ? ((await memResp.json()) as Array<{
          message: string | Record<string, unknown>;
        }>)
      : [];
    const linhas: string[] = [];
    for (const r of rows.reverse()) {
      let payload: Record<string, unknown> | null = null;
      if (typeof r.message === "string") {
        try {
          payload = JSON.parse(r.message) as Record<string, unknown>;
        } catch {
          payload = null;
        }
      } else if (r.message && typeof r.message === "object") {
        payload = r.message as Record<string, unknown>;
      }
      const type = payload?.type;
      const content =
        typeof payload?.content === "string" ? (payload.content as string) : "";
      if (type !== "human" && type !== "ai") continue;
      if (!content) continue;
      if (/^\s*execute\s+(o\s+)?(follow[\s-]?up|workflow)\b/i.test(content)) {
        continue;
      }
      linhas.push(`${type === "human" ? "Devedor" : "Fran"}: ${content}`);
    }
    const transcript = linhas.slice(-15).join("\n") || "(sem mensagens ainda)";

    // 7. Monta o prompt e chama a OpenAI.
    const system = [
      "Você é a Fran, assistente de uma empresa de cobrança e negociação de dívidas (Stival Advogados).",
      "Sua tarefa é AJUDAR a operadora a responder o devedor no WhatsApp, em português do Brasil,",
      "com tom educado, empático e negociador — mantendo o diálogo e conduzindo a um acordo.",
      "",
      "Dados do lead:",
      devedorInfo,
      "",
      "Histórico recente (Devedor = cliente; Fran = empresa):",
      transcript,
      "",
      "Regras:",
      "- Sugira UMA única resposta pronta para a operadora enviar (sem rótulos, sem aspas).",
      "- Não invente valores, descontos ou prazos que não estejam no histórico; se necessário,",
      "  proponha de forma condicional (ex.: 'posso verificar', 'podemos avaliar').",
      "- Seja objetiva e humana. Não use asteriscos de negrito nem assinaturas.",
      "- Responda somente com o texto da mensagem sugerida.",
    ].join("\n");

    const oaMessages = [
      { role: "system", content: system },
      {
        role: "user",
        content: "Sugira uma resposta para a última mensagem do devedor.",
      },
      ...mensagens,
    ];

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let resp: Response;
    try {
      resp = await fetch(OPENAI_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: oaMessages,
          temperature: 0.7,
          max_tokens: 500,
        }),
        signal: ctrl.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      const isAbort = err instanceof Error && err.name === "AbortError";
      return jsonResponse(
        {
          ok: false,
          error: isAbort ? "Timeout ao consultar a IA" : "Falha de rede na IA",
        },
        200
      );
    }
    clearTimeout(timer);

    const rawTexto = await resp.text().catch(() => "");
    let data: Record<string, unknown> | null = null;
    try {
      data = rawTexto ? (JSON.parse(rawTexto) as Record<string, unknown>) : null;
    } catch {
      data = null;
    }
    if (!resp.ok) {
      const errObj = data?.error as { message?: string } | undefined;
      const msg = errObj?.message ?? `HTTP ${resp.status}`;
      return jsonResponse({ ok: false, error: `IA: ${msg}` }, 200);
    }
    const choices = data?.choices as
      | Array<{ message?: { content?: string } }>
      | undefined;
    const sugestao = choices?.[0]?.message?.content?.trim() ?? "";
    if (!sugestao) {
      return jsonResponse({ ok: false, error: "IA não retornou sugestão." }, 200);
    }

    return jsonResponse({ ok: true, sugestao });
  } catch (err) {
    console.error("[sugerir-resposta] exceção:", err);
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 500);
  }
});
