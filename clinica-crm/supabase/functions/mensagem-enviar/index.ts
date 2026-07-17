// Edge Function: mensagem-enviar
//
// Envia uma mensagem de texto pela conversa, roteando pelo canal:
//   - canal.tipo = 'uazapi'  → POST no webhook do n8n (não-oficial)
//   - canal.tipo = 'zernio'  → POST direto na API do Zernio (oficial, janela 24h)
// Depois grava a mensagem enviada em `mensagens` (direcao 'out').
//
// Autorização: admin OU atendente ativa da MESMA unidade da conversa.
// Corpo JSON: { conversa_id, texto, tipo?, media_url? }
//
// Autossuficiente (sem imports de ../_shared) para deploy pelo Dashboard.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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
  anonKey: string;
  serviceKey: string;
}
function lerEnv(): Env {
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) throw new Error("Env do Supabase ausente");
  return { url, anonKey, serviceKey };
}

async function validarJwt(env: Env, authHeader: string): Promise<string> {
  const resp = await fetch(`${env.url}/auth/v1/user`, {
    headers: { Authorization: authHeader, apikey: env.anonKey },
  });
  if (!resp.ok) throw new Error("JWT inválido");
  const user = (await resp.json()) as { id?: string };
  if (!user?.id) throw new Error("Usuário sem id");
  return user.id;
}

async function rest(
  env: Env,
  method: "GET" | "POST" | "PATCH",
  path: string,
  body?: unknown,
  extra: Record<string, string> = {},
): Promise<Response> {
  return fetch(`${env.url}/rest/v1${path}`, {
    method,
    headers: {
      apikey: env.serviceKey,
      Authorization: `Bearer ${env.serviceKey}`,
      "Content-Type": "application/json",
      ...extra,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function getOne<T>(env: Env, path: string): Promise<T | null> {
  const resp = await rest(env, "GET", path);
  if (!resp.ok) return null;
  const rows = (await resp.json()) as T[];
  return rows[0] ?? null;
}

interface Perfil {
  id: string;
  role: string;
  ativo: boolean;
  unidade_id: number | null;
  nome: string | null;
}
interface Conversa {
  id: number;
  unidade_id: number;
  telefone: string;
  canal_id: number | null;
  zernio_conversation_id: string | null;
}
interface Canal {
  id: number;
  tipo: string;
  instancia: string;
  zernio_account_id: string | null;
}
interface Secret {
  token: string;
  webhook_secret: string;
  n8n_url: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const env = lerEnv();
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autorizado" }, 401);

    let callerId: string;
    try {
      callerId = await validarJwt(env, authHeader);
    } catch {
      return json({ error: "Sessão inválida" }, 401);
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const conversaId = Number(body.conversa_id);
    const texto = String(body.texto ?? "").trim();
    const tipo = String(body.tipo ?? "texto");
    const mediaUrl = body.media_url ? String(body.media_url) : null;
    if (!Number.isFinite(conversaId) || conversaId <= 0) {
      return json({ error: "conversa_id inválido" }, 400);
    }
    if (!texto && !mediaUrl) return json({ error: "Mensagem vazia" }, 400);

    const perfil = await getOne<Perfil>(
      env,
      `/usuarios?id=eq.${callerId}&select=id,role,ativo,unidade_id,nome`,
    );
    if (!perfil || !perfil.ativo) return json({ error: "Acesso negado" }, 403);
    const isAdmin = perfil.role === "admin";

    const conversa = await getOne<Conversa>(
      env,
      `/conversas?id=eq.${conversaId}&select=id,unidade_id,telefone,canal_id,zernio_conversation_id`,
    );
    if (!conversa) return json({ error: "Conversa não encontrada" }, 404);
    if (!isAdmin && perfil.unidade_id !== conversa.unidade_id) {
      return json({ error: "Conversa de outra unidade" }, 403);
    }

    if (!conversa.canal_id) {
      return json({ error: "Conversa sem canal definido" }, 409);
    }
    const canal = await getOne<Canal>(
      env,
      `/canais?id=eq.${conversa.canal_id}&select=id,tipo,instancia,zernio_account_id`,
    );
    if (!canal) return json({ error: "Canal não encontrado" }, 404);
    const secret = await getOne<Secret>(
      env,
      `/canal_secrets?canal_id=eq.${canal.id}&select=token,webhook_secret,n8n_url`,
    );

    let providerMsgId: string | null = null;

    if (canal.tipo === "zernio") {
      // Oficial — precisa de conversa aberta (conversationId).
      if (!conversa.zernio_conversation_id) {
        return json(
          {
            error:
              "Sem conversa oficial aberta. Fora da janela de 24h use um template.",
          },
          409,
        );
      }
      const apiKey = secret?.token ?? "";
      const payload: Record<string, unknown> = {
        accountId: canal.zernio_account_id,
      };
      if (mediaUrl) {
        payload.attachmentUrl = mediaUrl;
        if (texto) payload.message = texto;
      } else {
        payload.message = texto;
      }
      const resp = await fetch(
        `https://zernio.com/api/v1/inbox/conversations/${conversa.zernio_conversation_id}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );
      if (!resp.ok) {
        const t = await resp.text();
        return json({ error: `Falha no envio oficial: ${t}` }, 502);
      }
      const data = (await resp.json().catch(() => ({}))) as { id?: string };
      providerMsgId = data?.id ?? null;
    } else {
      // Não-oficial (uazapi) — via n8n.
      const n8nUrl = secret?.n8n_url ?? "";
      if (!n8nUrl) {
        return json({ error: "Canal uazapi sem URL do n8n configurada" }, 409);
      }
      const resp = await fetch(n8nUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Painel-Secret": secret?.webhook_secret ?? "",
        },
        body: JSON.stringify({
          acao: "enviar",
          instancia: canal.instancia,
          token: secret?.token ?? "",
          telefone: conversa.telefone,
          tipo,
          texto,
          media_url: mediaUrl,
        }),
      });
      if (!resp.ok) {
        const t = await resp.text();
        return json({ error: `Falha no envio (n8n): ${t}` }, 502);
      }
    }

    // Grava a mensagem enviada.
    const insert = await rest(
      env,
      "POST",
      "/mensagens",
      {
        conversa_id: conversa.id,
        unidade_id: conversa.unidade_id,
        direcao: "out",
        tipo,
        conteudo: texto || null,
        media_url: mediaUrl,
        enviado_por: callerId,
        provider_msg_id: providerMsgId,
      },
      { Prefer: "return=representation" },
    );
    if (!insert.ok) {
      const t = await insert.text();
      return json({ ok: true, aviso: `Enviado, mas falhou ao gravar: ${t}` });
    }
    const linha = (await insert.json()) as unknown[];
    return json({ ok: true, mensagem: linha[0] ?? null });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message }, 500);
  }
});
