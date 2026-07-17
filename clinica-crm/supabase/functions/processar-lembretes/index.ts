// Edge Function: processar-lembretes
//
// Chamada por um cron diário (pg_cron + pg_net). Envia os lembretes que
// venceram (agendado_para <= hoje, status 'pendente') pelo canal configurado
// e marca como 'enviado' (ou 'erro'). Cria/garante a conversa e grava a
// mensagem enviada ('out').
//
// Autorização: header x-cron-secret == env LEMBRETES_CRON_SECRET.
// Autossuficiente (deploy pelo Dashboard).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
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
  method: "GET" | "POST" | "PATCH",
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

async function getMany<T>(env: Env, path: string): Promise<T[]> {
  const resp = await rest(env, "GET", path);
  if (!resp.ok) return [];
  return (await resp.json()) as T[];
}
async function getOne<T>(env: Env, path: string): Promise<T | null> {
  const rows = await getMany<T>(env, path);
  return rows[0] ?? null;
}

const primeiroNome = (nome: string | null) =>
  (nome ?? "").trim().split(/\s+/)[0] ?? "";

interface LembreteRow {
  id: number;
  unidade_id: number;
  paciente_id: number;
  telefone: string;
  config: { mensagem: string; canal_id: number | null } | null;
  paciente: { nome: string | null } | null;
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

async function enviarTexto(
  env: Env,
  canal: Canal,
  secret: Secret | null,
  telefone: string,
  texto: string,
  conversationId: string | null,
): Promise<{ ok: boolean; erro?: string }> {
  if (canal.tipo === "zernio") {
    if (!conversationId) {
      return { ok: false, erro: "Zernio fora da janela 24h (use template)" };
    }
    const resp = await fetch(
      `https://zernio.com/api/v1/inbox/conversations/${conversationId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret?.token ?? ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ accountId: canal.zernio_account_id, message: texto }),
      },
    );
    return resp.ok ? { ok: true } : { ok: false, erro: await resp.text() };
  }
  // uazapi via n8n
  if (!secret?.n8n_url) return { ok: false, erro: "canal uazapi sem URL do n8n" };
  const resp = await fetch(secret.n8n_url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Painel-Secret": secret.webhook_secret ?? "",
    },
    body: JSON.stringify({
      acao: "enviar",
      instancia: canal.instancia,
      token: secret.token ?? "",
      telefone,
      tipo: "texto",
      texto,
    }),
  });
  return resp.ok ? { ok: true } : { ok: false, erro: await resp.text() };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const env = lerEnv();
    const segredo = Deno.env.get("LEMBRETES_CRON_SECRET") ?? "";
    if (!segredo || req.headers.get("x-cron-secret") !== segredo) {
      return json({ error: "Não autorizado" }, 401);
    }

    const hoje = new Date().toISOString().slice(0, 10);
    const pendentes = await getMany<LembreteRow>(
      env,
      `/lembretes?status=eq.pendente&agendado_para=lte.${hoje}` +
        `&select=id,unidade_id,paciente_id,telefone,config:lembretes_config(mensagem,canal_id),paciente:pacientes(nome)` +
        `&order=agendado_para.asc&limit=200`,
    );

    let enviados = 0;
    let erros = 0;

    for (const l of pendentes) {
      const canalId = l.config?.canal_id ?? null;
      const texto = (l.config?.mensagem ?? "").replaceAll(
        "{nome}",
        primeiroNome(l.paciente?.nome ?? null),
      );

      if (!canalId) {
        await marcar(env, l.id, "erro", "Regra sem canal configurado");
        erros++;
        continue;
      }

      const canal = await getOne<Canal>(
        env,
        `/canais?id=eq.${canalId}&select=id,tipo,instancia,zernio_account_id`,
      );
      if (!canal) {
        await marcar(env, l.id, "erro", "Canal não encontrado");
        erros++;
        continue;
      }
      const secret = await getOne<Secret>(
        env,
        `/canal_secrets?canal_id=eq.${canalId}&select=token,webhook_secret,n8n_url`,
      );

      // Garante a conversa (find-or-create) e pega o conversationId oficial.
      const rpc = await rest(env, "POST", "/rpc/crm_registrar_inbound", {
        p_canal_id: canalId,
        p_telefone: l.telefone,
        p_conversation_id: null,
      });
      const reg = rpc.ok
        ? ((await rpc.json()) as { conversa_id: number; unidade_id: number }[])[0]
        : null;

      let conversationId: string | null = null;
      if (canal.tipo === "zernio" && reg) {
        const conv = await getOne<{ zernio_conversation_id: string | null }>(
          env,
          `/conversas?id=eq.${reg.conversa_id}&select=zernio_conversation_id`,
        );
        conversationId = conv?.zernio_conversation_id ?? null;
      }

      const r = await enviarTexto(
        env,
        canal,
        secret,
        l.telefone,
        texto,
        conversationId,
      );

      if (r.ok) {
        if (reg) {
          await rest(env, "POST", "/mensagens", {
            conversa_id: reg.conversa_id,
            unidade_id: reg.unidade_id,
            direcao: "out",
            tipo: "texto",
            conteudo: texto,
          });
        }
        await marcar(env, l.id, "enviado");
        enviados++;
      } else {
        await marcar(env, l.id, "erro", r.erro ?? "falha no envio");
        erros++;
      }
    }

    return json({ ok: true, total: pendentes.length, enviados, erros });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message }, 500);
  }
});

async function marcar(
  env: Env,
  id: number,
  status: "enviado" | "erro",
  erro?: string,
): Promise<void> {
  await rest(env, "PATCH", `/lembretes?id=eq.${id}`, {
    status,
    enviado_em: status === "enviado" ? new Date().toISOString() : null,
    erro: erro ?? null,
  });
}
