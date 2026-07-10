// Edge Function: zernio-webhook
// Recebe eventos do Zernio (API Oficial WhatsApp Business / Meta Cloud API) e
// grava as mensagens recebidas na fran_memory + fran_zernio_conversas.
//
// Formato real do payload do Zernio (message.received):
//   payload.event                      = "message.received"
//   payload.message.text               = texto completo
//   payload.message.sender.phoneNumber = "+55..."
//   payload.message.conversationId      = "<id da conversa Zernio>"
//   payload.account.id / .accountId     = "<id interno da conta no Zernio>"
//
// A verificação HMAC usa zernio_webhook_secret (fran_config) com fallback
// para o Secret ZERNIO_WEBHOOK_SECRET das Edge Functions.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-zernio-signature, x-late-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonOk(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
}
function jsonErr(body: unknown, status = 400): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });
}

async function verificarAssinatura(rawBody: string, signatureHeader: string | null, secret: string): Promise<boolean> {
  if (!signatureHeader) return false;
  const recebida = signatureHeader.startsWith("sha256=") ? signatureHeader.slice(7) : signatureHeader;
  const enc = new TextEncoder();
  const chave = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const assinatura = await crypto.subtle.sign("HMAC", chave, enc.encode(rawBody));
  const calculada = Array.from(new Uint8Array(assinatura)).map((b) => b.toString(16).padStart(2, "0")).join("");
  if (calculada.length !== recebida.length) return false;
  let diff = 0;
  for (let i = 0; i < calculada.length; i++) diff |= calculada.charCodeAt(i) ^ recebida.charCodeAt(i);
  return diff === 0;
}

function soDigitos(s: string): string {
  return (s ?? "").replace(/\D/g, "");
}

async function rest(supabaseUrl: string, serviceKey: string, method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}): Promise<Response> {
  return fetch(`${supabaseUrl}/rest/v1${path}`, {
    method,
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", ...extraHeaders },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function rpc(supabaseUrl: string, serviceKey: string, fn: string, params: Record<string, unknown>): Promise<Response> {
  return fetch(`${supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
}

// Lê o secret do webhook da fran_config (com fallback para o Secret)
async function lerWebhookSecret(supabaseUrl: string, serviceKey: string): Promise<string> {
  const resp = await fetch(
    `${supabaseUrl}/rest/v1/fran_config?chave=in.(zernio_webhook_secret)&select=chave,valor`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
  );
  const mapa: Record<string, string> = {};
  if (resp.ok) {
    const rows = (await resp.json().catch(() => [])) as Array<{ chave: string; valor: string | null }>;
    for (const r of rows) mapa[r.chave] = r.valor ?? "";
  }
  return mapa["zernio_webhook_secret"] || Deno.env.get("ZERNIO_WEBHOOK_SECRET") || "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonErr({ error: "Metodo nao permitido" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return jsonErr({ error: "Configuracao interna ausente" }, 500);

  const rawBody = await req.text().catch(() => "");

  let payload: Record<string, any>;
  try { payload = JSON.parse(rawBody); } catch { return jsonErr({ error: "Payload invalido" }, 400); }

  // O Zernio manda o nome do evento em "event"; aceitamos "action" por robustez.
  const eventName = String(payload.event ?? payload.action ?? "");

  // webhook.test: responde sem verificar assinatura (o Zernio nao assina o teste)
  if (eventName === "webhook.test") return jsonOk({ ok: true, message: "Webhook funcionando" });

  // Eventos reais: verificar assinatura HMAC
  const webhookSecret = await lerWebhookSecret(supabaseUrl, serviceKey);
  if (webhookSecret) {
    const sig = req.headers.get("x-zernio-signature") ?? req.headers.get("x-late-signature");
    const valido = await verificarAssinatura(rawBody, sig, webhookSecret).catch(() => false);
    if (!valido) { console.error("[zernio-webhook] Assinatura invalida"); return jsonErr({ error: "Assinatura invalida" }, 401); }
  }

  if (eventName === "message.received") {
    const message = (payload.message ?? {}) as Record<string, any>;
    const account = (payload.account ?? {}) as Record<string, any>;
    const conversation = (payload.conversation ?? {}) as Record<string, any>;
    const sender = (message.sender ?? {}) as Record<string, any>;

    const accountId = String(account.id ?? account.accountId ?? "");
    const conversationId = String(message.conversationId ?? conversation.id ?? "");
    const platform = message.platform ?? account.platform ?? "whatsapp";
    const telefone = soDigitos(String(sender.phoneNumber ?? sender.id ?? conversation.participantId ?? ""));
    const senderName = sender.name ?? conversation.participantName ?? null;
    const messageId = message.id ?? null;
    const texto = String(message.text ?? "").trim();
    const anexos = Array.isArray(message.attachments) ? message.attachments : [];
    const temAnexo = anexos.length > 0;

    if (!accountId || !conversationId || !telefone) {
      console.error("[zernio-webhook] Payload incompleto:", JSON.stringify({ accountId, conversationId, telefone }));
      return jsonErr({ error: "Payload incompleto" }, 400);
    }

    let tipoMsg = "text";
    let mediaUrl: string | null = null;
    let mediaMime: string | null = null;
    if (temAnexo) {
      const a = (anexos[0] ?? {}) as Record<string, any>;
      tipoMsg = a.type ?? "document";
      mediaUrl = a.url ?? a.mediaUrl ?? a.link ?? null;
      mediaMime = a.mimeType ?? a.mime ?? null;
    }

    const placeholders: Record<string, string> = {
      image: "[imagem]", audio: "[audio]", document: "[documento]", video: "[video]",
      sticker: "[sticker]", voice: "[audio]", location: "[localizacao]", contacts: "[contato]",
    };
    const content = temAnexo ? (texto || placeholders[tipoMsg] || `[${tipoMsg}]`) : (texto || "[mensagem vazia]");

    const additional_kwargs: Record<string, unknown> = {};
    if (temAnexo) {
      additional_kwargs.media_tipo = tipoMsg;
      if (mediaUrl) additional_kwargs.media_url = mediaUrl;
      if (mediaMime) additional_kwargs.media_mime = mediaMime;
    }
    additional_kwargs.zernio_message_id = messageId;
    additional_kwargs.zernio_account_id = accountId;
    additional_kwargs.zernio_conversation_id = conversationId;
    additional_kwargs.plataforma = platform;
    additional_kwargs.nome_remetente = senderName;

    try {
      await rpc(supabaseUrl, serviceKey, "fran_zernio_upsert_conversa", { p_telefone: telefone, p_conversation_id: conversationId, p_account_id: accountId });
    } catch (e) { console.error("[zernio-webhook] Erro upsert conversa:", e); }

    const insResp = await rest(
      supabaseUrl, serviceKey, "POST", "/fran_memory",
      { session_id: telefone, message: { type: "human", content, additional_kwargs }, canal: `zernio:${accountId}` },
      { Prefer: "return=minimal" },
    );
    if (!insResp.ok) {
      const t = await insResp.text().catch(() => "");
      console.error("[zernio-webhook] Erro ao gravar fran_memory:", t);
      return jsonOk({ ok: false, aviso: "Mensagem recebida mas nao gravada", detalhe: t });
    }

    console.log(`[zernio-webhook] OK | telefone=${telefone} | conv=${conversationId}`);
    return jsonOk({ ok: true, telefone, conversationId, tipo: tipoMsg });
  }

  console.log(`[zernio-webhook] Evento '${eventName}' ignorado`);
  return jsonOk({ ok: true, event: eventName, handled: false });
});
