// Edge Function: agenda-sync
//
// Empurra um agendamento local para o Google Calendar (via n8n, que detém o
// OAuth do Google). Chamada pelo frontend após criar/editar/remover.
// Corpo: { agendamento_id, acao: "upsert" | "delete" }
//
// Config (Secrets da função):
//   N8N_AGENDA_URL     — webhook do n8n que fala com o Google (obrigatório p/ sync)
//   N8N_AGENDA_SECRET  — segredo compartilhado (header X-Painel-Secret)
// Se N8N_AGENDA_URL não estiver setado, responde { ok:true, skipped:true } —
// assim a agenda local funciona sem o Google.
//
// Autossuficiente (deploy pelo Dashboard).

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
  method: "GET" | "PATCH",
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

async function getOne<T>(env: Env, path: string): Promise<T | null> {
  const resp = await rest(env, "GET", path);
  if (!resp.ok) return null;
  const rows = (await resp.json()) as T[];
  return rows[0] ?? null;
}

interface AgRow {
  id: number;
  unidade_id: number;
  titulo: string;
  descricao: string | null;
  inicio: string;
  fim: string;
  status: string;
  google_event_id: string | null;
  categoria: { google_color_id: number } | null;
  paciente: { nome: string | null; telefone: string } | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const env = lerEnv();
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autorizado" }, 401);
    try {
      await validarJwt(env, authHeader);
    } catch {
      return json({ error: "Sessão inválida" }, 401);
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const agendamentoId = Number(body.agendamento_id);
    const acao = String(body.acao ?? "upsert");
    if (!Number.isFinite(agendamentoId)) {
      return json({ error: "agendamento_id inválido" }, 400);
    }

    const n8nUrl = Deno.env.get("N8N_AGENDA_URL");
    if (!n8nUrl) return json({ ok: true, skipped: "N8N_AGENDA_URL não configurado" });

    const ag = await getOne<AgRow>(
      env,
      `/agendamentos?id=eq.${agendamentoId}&select=id,unidade_id,titulo,descricao,inicio,fim,status,google_event_id,categoria:agenda_categorias(google_color_id),paciente:pacientes(nome,telefone)`,
    );
    if (!ag && acao !== "delete") {
      return json({ error: "Agendamento não encontrado" }, 404);
    }

    const resp = await fetch(n8nUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Painel-Secret": Deno.env.get("N8N_AGENDA_SECRET") ?? "",
      },
      body: JSON.stringify({
        acao,
        agendamento_id: agendamentoId,
        google_event_id: ag?.google_event_id ?? null,
        google_color_id: ag?.categoria?.google_color_id ?? null,
        titulo: ag?.titulo,
        descricao: ag?.descricao,
        inicio: ag?.inicio,
        fim: ag?.fim,
        status: ag?.status,
        paciente_nome: ag?.paciente?.nome,
        paciente_telefone: ag?.paciente?.telefone,
      }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      return json({ ok: false, error: `n8n: ${t}` }, 502);
    }

    // Se o n8n devolver o eventId do Google, grava.
    const out = (await resp.json().catch(() => ({}))) as {
      google_event_id?: string;
    };
    if (acao === "upsert" && out?.google_event_id) {
      await rest(env, "PATCH", `/agendamentos?id=eq.${agendamentoId}`, {
        google_event_id: out.google_event_id,
      });
    }

    return json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message }, 500);
  }
});
