// Edge Function: zernio-webhook
//
// Recebe mensagens do canal OFICIAL (Zernio/Late). Fluxo:
//   1. Resolve o canal pelo accountId do payload.
//   2. Valida a assinatura HMAC (x-zernio-signature / x-late-signature) com o
//      webhook_secret do canal (se configurado).
//   3. Parseia o referral do Click-to-WhatsApp (atribuição de anúncio).
//   4. Cria/atualiza paciente + conversa (RPC crm_registrar_inbound).
//   5. Grava a mensagem recebida (direcao 'in').
//
// Configure a URL deste endpoint no painel do Zernio.
// Autossuficiente (deploy pelo Dashboard).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-zernio-signature, x-late-signature",
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

// HMAC-SHA256 em hex, comparação em tempo constante.
async function assinaturaOk(
  raw: string,
  header: string | null,
  secret: string,
): Promise<boolean> {
  if (!secret) return true; // sem secret configurado → pula (dev)
  if (!header) return false;
  const esperado = header.replace(/^sha256=/, "").trim().toLowerCase();
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(raw),
  );
  const calc = [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (calc.length !== esperado.length) return false;
  let diff = 0;
  for (let i = 0; i < calc.length; i++) diff |= calc.charCodeAt(i) ^ esperado.charCodeAt(i);
  return diff === 0;
}

interface CanalRow {
  id: number;
  zernio_account_id: string | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const env = lerEnv();
    const raw = await req.text();
    const payload = JSON.parse(raw || "{}") as Record<string, any>;
    const evento = String(payload.event ?? payload.action ?? "");

    if (evento === "webhook.test") return json({ ok: true });
    if (evento !== "message.received") return json({ ok: true, ignorado: evento });

    const msg = payload.message ?? {};
    const conta = payload.account ?? {};
    const accountId = String(conta.id ?? conta.accountId ?? msg.accountId ?? "");
    if (!accountId) return json({ error: "accountId ausente" }, 400);

    // Resolve o canal oficial por accountId.
    const canalResp = await rest(
      env,
      "GET",
      `/canais?tipo=eq.zernio&zernio_account_id=eq.${encodeURIComponent(accountId)}&select=id,zernio_account_id&limit=1`,
    );
    const canais = canalResp.ok ? ((await canalResp.json()) as CanalRow[]) : [];
    const canal = canais[0];
    if (!canal) return json({ error: "Canal oficial não cadastrado" }, 404);

    // Assinatura HMAC com o secret do canal.
    const segResp = await rest(
      env,
      "GET",
      `/canal_secrets?canal_id=eq.${canal.id}&select=webhook_secret`,
    );
    const segs = segResp.ok
      ? ((await segResp.json()) as { webhook_secret: string }[])
      : [];
    const secret = segs[0]?.webhook_secret ?? "";
    const header =
      req.headers.get("x-zernio-signature") ??
      req.headers.get("x-late-signature");
    if (!(await assinaturaOk(raw, header, secret))) {
      return json({ error: "Assinatura inválida" }, 401);
    }

    // Extrai conteúdo.
    const texto = String(msg.text ?? msg.body ?? "");
    const sender = msg.sender ?? {};
    const telefone = soDigitos(
      sender.phoneNumber ?? sender.id ?? (payload.conversation ?? {}).participantId,
    );
    const conversationId = String(
      msg.conversationId ?? (payload.conversation ?? {}).id ?? "",
    );
    if (!telefone) return json({ error: "telefone ausente" }, 400);

    // Mídia (primeiro anexo).
    let tipo = "texto";
    let mediaUrl: string | null = null;
    let mediaMime: string | null = null;
    const anexos = Array.isArray(msg.attachments) ? msg.attachments : [];
    if (anexos.length > 0) {
      const a = anexos[0];
      mediaUrl = a.url ?? a.link ?? null;
      mediaMime = a.mimeType ?? a.mime ?? null;
      const t = String(a.type ?? "").toLowerCase();
      tipo = /image/.test(t) || /image/.test(mediaMime ?? "")
        ? "imagem"
        : /audio/.test(t) || /audio/.test(mediaMime ?? "")
          ? "audio"
          : /video/.test(t) || /video/.test(mediaMime ?? "")
            ? "video"
            : "documento";
    }

    // Referral do Click-to-WhatsApp (atribuição de anúncio).
    const ref = msg.referral ?? (payload.referral ?? {});
    const origemAnuncioId = ref.source_id ?? ref.sourceId ?? ref.ctwa_clid ?? null;
    const origemCampanha = ref.headline ?? ref.source_url ?? ref.sourceUrl ?? null;
    const origemCriativo = ref.body ?? ref.media_type ?? null;

    // Upsert paciente + conversa.
    const rpc = await rest(env, "POST", "/rpc/crm_registrar_inbound", {
      p_canal_id: canal.id,
      p_telefone: telefone,
      p_conversation_id: conversationId || null,
      p_origem_campanha: origemCampanha,
      p_origem_criativo: origemCriativo,
      p_origem_anuncio_id: origemAnuncioId,
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

    // Grava a mensagem recebida.
    await rest(env, "POST", "/mensagens", {
      conversa_id: reg.conversa_id,
      unidade_id: reg.unidade_id,
      direcao: "in",
      tipo,
      conteudo: texto || null,
      media_url: mediaUrl,
      media_mime: mediaMime,
      provider_msg_id: msg.id ?? msg.messageId ?? null,
    });

    return json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message }, 500);
  }
});
