// Edge Function: agenda-webhook
//
// Recebe do n8n as mudanças feitas NO Google Calendar (sync de volta →
// bidirecional). O n8n observa o Google e faz POST aqui.
// Corpo: {
//   acao: "upsert" | "delete",
//   google_event_id, unidade_id?, titulo?, descricao?, inicio?, fim?, status?
// }
// header: X-Painel-Secret: <N8N_AGENDA_SECRET>
//
// Faz upsert por google_event_id. Autossuficiente (deploy pelo Dashboard).

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
  method: "GET" | "POST" | "PATCH" | "DELETE",
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const env = lerEnv();
    const secret = Deno.env.get("N8N_AGENDA_SECRET") ?? "";
    if (secret && req.headers.get("x-painel-secret") !== secret) {
      return json({ error: "Secret inválido" }, 401);
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const acao = String(body.acao ?? "upsert");
    const googleEventId = String(body.google_event_id ?? "");
    if (!googleEventId) return json({ error: "google_event_id ausente" }, 400);

    if (acao === "delete") {
      await rest(
        env,
        "DELETE",
        `/agendamentos?google_event_id=eq.${encodeURIComponent(googleEventId)}`,
      );
      return json({ ok: true });
    }

    // upsert por google_event_id
    const existResp = await rest(
      env,
      "GET",
      `/agendamentos?google_event_id=eq.${encodeURIComponent(googleEventId)}&select=id&limit=1`,
    );
    const existentes = existResp.ok
      ? ((await existResp.json()) as { id: number }[])
      : [];

    const campos: Record<string, unknown> = {};
    if (body.titulo !== undefined) campos.titulo = body.titulo;
    if (body.descricao !== undefined) campos.descricao = body.descricao;
    if (body.inicio !== undefined) campos.inicio = body.inicio;
    if (body.fim !== undefined) campos.fim = body.fim;
    if (body.status !== undefined) campos.status = body.status;

    if (existentes[0]) {
      await rest(
        env,
        "PATCH",
        `/agendamentos?id=eq.${existentes[0].id}`,
        campos,
      );
    } else {
      // Cria (precisa de unidade + horários).
      if (body.unidade_id === undefined || !campos.inicio || !campos.fim) {
        return json(
          { error: "Para criar via Google, informe unidade_id, inicio e fim" },
          400,
        );
      }
      await rest(env, "POST", "/agendamentos", {
        unidade_id: Number(body.unidade_id),
        titulo: campos.titulo ?? "Evento do Google",
        descricao: campos.descricao ?? null,
        inicio: campos.inicio,
        fim: campos.fim,
        status: campos.status ?? "agendado",
        google_event_id: googleEventId,
      });
    }

    return json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message }, 500);
  }
});
