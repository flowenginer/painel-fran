// Edge Function: zernio-broadcast (Broadcasts — fase 2, o processador de envio)
// -----------------------------------------------------------------------------
// Processa a fila de itens `na_fila` de fran_zernio_broadcast_itens: para cada
// alvo (número frio, sem conversa aberta) INICIA uma conversa no Zernio enviando
// o template aprovado — que é a única forma permitida pela Meta de falar com um
// lead fora da janela de 24h.
//
// Envio (cold-start com template) — documentado no Zernio:
//   POST https://zernio.com/api/v1/inbox/conversations
//   body: { accountId, participantId: <telefone>, templateName, templateLanguage,
//           templateComponents?: [{ type:"body", parameters:[{type:"text", text}] }] }
//   -> cria a conversa E dispara o template. Devolve a conversa criada (id).
//
// Depois de enviar, grava na fran_memory (type "ai", canal `zernio:<accountId>`)
// para a mensagem aparecer em Conversas, e faz upsert em fran_zernio_conversas.
//
// Ritmo: respeita zernio_broadcast_por_hora e zernio_broadcast_limite_diario
// (config), além de um teto por invocação. Só roda se zernio_broadcast_ativo.
//
// Autorização: header x-cron-secret == fran_config.zernio_broadcast_cron_secret
// (chamado pelo pg_cron) OU um JWT de admin (botão "processar agora").
// -----------------------------------------------------------------------------

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonOk(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
}
function jsonErr(body: unknown, status = 400): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });
}
function soDigitos(s: string): string { return (s ?? "").replace(/\D/g, ""); }

interface Env { supabaseUrl: string; anonKey: string; serviceKey: string; }

function lerEnvSupabase(): Env {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) throw new Error("Variaveis Supabase ausentes");
  return { supabaseUrl, anonKey, serviceKey };
}

async function rest(env: Env, method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}): Promise<Response> {
  return fetch(`${env.supabaseUrl}/rest/v1${path}`, {
    method,
    headers: { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}`, "Content-Type": "application/json", ...extraHeaders },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function rpc(env: Env, fn: string, params: Record<string, unknown>): Promise<Response> {
  return fetch(`${env.supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
}

// Conta linhas via header Content-Range (Prefer: count=exact) sem baixar os dados.
async function contar(env: Env, path: string): Promise<number> {
  const resp = await rest(env, "GET", path, undefined, { Prefer: "count=exact", Range: "0-0" });
  const cr = resp.headers.get("content-range") ?? "";
  const total = cr.split("/")[1];
  const n = Number(total);
  return Number.isFinite(n) ? n : 0;
}

async function lerConfig(env: Env, chaves: string[]): Promise<Record<string, string>> {
  const resp = await fetch(
    `${env.supabaseUrl}/rest/v1/fran_config?chave=in.(${chaves.join(",")})&select=chave,valor`,
    { headers: { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}` } },
  );
  const mapa: Record<string, string> = {};
  if (resp.ok) {
    const rows = (await resp.json().catch(() => [])) as Array<{ chave: string; valor: string | null }>;
    for (const r of rows) mapa[r.chave] = r.valor ?? "";
  }
  return mapa;
}

async function validarAdminJwt(env: Env, authHeader: string): Promise<boolean> {
  const resp = await fetch(`${env.supabaseUrl}/auth/v1/user`, { headers: { Authorization: authHeader, apikey: env.anonKey } });
  if (!resp.ok) return false;
  const user = (await resp.json().catch(() => null)) as { id?: string } | null;
  if (!user?.id) return false;
  const perfilResp = await rest(env, "GET", `/fran_usuarios?id=eq.${user.id}&select=role,ativo`);
  const rows = (await perfilResp.json().catch(() => [])) as Array<{ role: string; ativo: boolean }>;
  return rows[0]?.role === "admin" && rows[0]?.ativo === true;
}

// ---- Resolução de variáveis do template a partir do devedor ------------------
interface Devedor {
  nome_devedor: string | null;
  primeiro_nome: string | null;
  tratamento: string | null;
  instituicao: string | null;
  cidade: string | null;
  valor_atualizado: number | null;
  valor_original: number | null;
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
function formatBRL(v: number | null): string { return v === null || v === undefined ? "" : brl.format(v); }

// Mesmo mapeamento do front (src/lib/broadcasts.ts → CAMPOS_DEVEDOR).
function valorCampo(campoId: string, d: Devedor): string {
  switch (campoId) {
    case "primeiro_nome": return (d.primeiro_nome?.trim() || d.nome_devedor?.split(/\s+/)[0] || "");
    case "nome_devedor": return d.nome_devedor ?? "";
    case "tratamento": return d.tratamento ?? "";
    case "instituicao": return d.instituicao ?? "";
    case "cidade": return d.cidade ?? "";
    case "valor_atualizado": return formatBRL(d.valor_atualizado);
    case "valor_original": return formatBRL(d.valor_original);
    default: return "";
  }
}

// Constrói os parâmetros do componente "body" na ordem 1,2,3... a partir do
// mapa de variáveis do broadcast ({"1":"primeiro_nome", ...}) e do devedor.
function montarTemplateComponents(
  variaveis: Record<string, string> | null | undefined,
  d: Devedor,
): { componentes: Array<Record<string, unknown>>; valores: Record<string, string> } {
  const mapa = variaveis ?? {};
  const indices = Object.keys(mapa).map((k) => Number(k)).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  const valores: Record<string, string> = {};
  const parameters = indices.map((i) => {
    const valor = valorCampo(mapa[String(i)], d);
    valores[String(i)] = valor;
    return { type: "text", text: valor };
  });
  if (parameters.length === 0) return { componentes: [], valores };
  return { componentes: [{ type: "body", parameters }], valores };
}

// ---- Envio de UM item --------------------------------------------------------
interface ItemFila {
  id: number;
  broadcast_id: number;
  devedor_id: number;
  telefone: string;
  tentativas: number;
  broadcast: { template_name: string; template_language: string; variaveis: Record<string, string> | null; status: string } | null;
  devedor: Devedor | null;
}

const MAX_TENTATIVAS = 3;

async function processarItem(
  env: Env,
  apiKey: string,
  accountId: string,
  item: ItemFila,
): Promise<"enviado" | "erro"> {
  const b = item.broadcast;
  const d = item.devedor;
  const telefone = soDigitos(item.telefone);
  if (!b || !telefone) {
    await marcarErro(env, item, "Item sem broadcast/telefone válido");
    return "erro";
  }

  const { componentes, valores } = montarTemplateComponents(b.variaveis, d ?? {
    nome_devedor: null, primeiro_nome: null, tratamento: null, instituicao: null,
    cidade: null, valor_atualizado: null, valor_original: null,
  });

  const zernioBody: Record<string, unknown> = {
    accountId,
    participantId: telefone,
    templateName: b.template_name,
    templateLanguage: b.template_language,
  };
  if (componentes.length > 0) zernioBody.templateComponents = componentes;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  let resp: Response;
  try {
    resp = await fetch("https://zernio.com/api/v1/inbox/conversations", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(zernioBody),
      signal: ctrl.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const isAbort = err instanceof Error && err.name === "AbortError";
    await marcarErro(env, item, isAbort ? "Timeout no Zernio" : `Falha de rede: ${String(err)}`);
    return "erro";
  }
  clearTimeout(timer);

  const respText = await resp.text().catch(() => "");
  if (!resp.ok) {
    console.error(`[zernio-broadcast] item ${item.id} falhou: ${resp.status} ${respText}`);
    await marcarErro(env, item, `Zernio ${resp.status}: ${respText}`.slice(0, 500));
    return "erro";
  }

  let data: Record<string, any> = {};
  try { data = JSON.parse(respText); } catch { /* resposta sem corpo JSON */ }
  const conv = (data.conversation ?? data) as Record<string, any>;
  const conversationId = String(conv.id ?? conv.conversationId ?? data.conversationId ?? "");
  const messageId = String(data.messageId ?? conv.lastMessageId ?? "") || null;

  // Upsert da conversa (para o zernio-enviar achar o conversationId depois).
  if (conversationId) {
    try {
      await rpc(env, "fran_zernio_upsert_conversa", { p_telefone: telefone, p_conversation_id: conversationId, p_account_id: accountId });
    } catch (e) { console.error("[zernio-broadcast] upsert conversa:", e); }
  }

  // Grava na thread (Conversas) — type "ai".
  const rotulo = `📢 Template "${b.template_name}" enviado`;
  const additional_kwargs: Record<string, unknown> = {
    broadcast_id: item.broadcast_id,
    template_name: b.template_name,
    template_language: b.template_language,
    zernio_conversation_id: conversationId || null,
    zernio_message_id: messageId,
  };
  if (Object.keys(valores).length > 0) additional_kwargs.variaveis = valores;

  await rest(env, "POST", "/fran_memory", {
    session_id: telefone,
    message: { type: "ai", content: rotulo, additional_kwargs },
    canal: `zernio:${accountId}`,
  }, { Prefer: "return=minimal" });

  await rest(env, "PATCH", `/fran_zernio_broadcast_itens?id=eq.${item.id}`, {
    status: "enviado",
    tentativas: item.tentativas + 1,
    zernio_message_id: messageId,
    data_processado: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    erro_detalhes: null,
  }, { Prefer: "return=minimal" });

  return "enviado";
}

// Marca erro: mantém na_fila para nova tentativa até MAX_TENTATIVAS; depois "erro".
async function marcarErro(env: Env, item: ItemFila, detalhe: string): Promise<void> {
  const tentativas = item.tentativas + 1;
  const status = tentativas >= MAX_TENTATIVAS ? "erro" : "na_fila";
  await rest(env, "PATCH", `/fran_zernio_broadcast_itens?id=eq.${item.id}`, {
    status,
    tentativas,
    erro_detalhes: detalhe.slice(0, 500),
    data_processado: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { Prefer: "return=minimal" });
}

// Recalcula totais e status de um broadcast depois do lote.
async function reconciliarBroadcast(env: Env, broadcastId: number): Promise<void> {
  const enviados = await contar(env, `/fran_zernio_broadcast_itens?broadcast_id=eq.${broadcastId}&status=eq.enviado&select=id`);
  const erros = await contar(env, `/fran_zernio_broadcast_itens?broadcast_id=eq.${broadcastId}&status=eq.erro&select=id`);
  const naFila = await contar(env, `/fran_zernio_broadcast_itens?broadcast_id=eq.${broadcastId}&status=eq.na_fila&select=id`);

  // Não sobrescreve estados manuais (pausado/cancelado).
  const bResp = await rest(env, "GET", `/fran_zernio_broadcasts?id=eq.${broadcastId}&select=status`);
  const bRows = (await bResp.json().catch(() => [])) as Array<{ status: string }>;
  const atual = bRows[0]?.status ?? "";
  const patch: Record<string, unknown> = { total_enviados: enviados, total_erros: erros, updated_at: new Date().toISOString() };
  if (atual !== "pausado" && atual !== "cancelado") {
    patch.status = naFila > 0 ? "ativo" : "concluido";
  }
  await rest(env, "PATCH", `/fran_zernio_broadcasts?id=eq.${broadcastId}`, patch, { Prefer: "return=minimal" });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonErr({ error: "Metodo nao permitido" }, 405);

  try {
    const env = lerEnvSupabase();

    // --- Autorização: cron secret OU admin JWT ---
    const cfg = await lerConfig(env, [
      "zernio_api_key", "zernio_account_id", "zernio_broadcast_ativo",
      "zernio_broadcast_por_hora", "zernio_broadcast_limite_diario", "zernio_broadcast_cron_secret",
    ]);
    const cronSecret = cfg["zernio_broadcast_cron_secret"] || "";
    const headerSecret = req.headers.get("x-cron-secret") || "";
    const authHeader = req.headers.get("Authorization") || "";

    let autorizado = false;
    if (cronSecret && headerSecret && headerSecret === cronSecret) autorizado = true;
    else if (authHeader) autorizado = await validarAdminJwt(env, authHeader);
    if (!autorizado) return jsonErr({ error: "Nao autorizado" }, 401);

    // --- Liga/desliga ---
    if ((cfg["zernio_broadcast_ativo"] || "false").toLowerCase() !== "true") {
      return jsonOk({ ok: true, ativo: false, mensagem: "Processamento de broadcasts desligado (zernio_broadcast_ativo=false)" });
    }

    const apiKey = cfg["zernio_api_key"] || Deno.env.get("ZERNIO_API_KEY") || "";
    const accountId = cfg["zernio_account_id"] || Deno.env.get("ZERNIO_ACCOUNT_ID") || "";
    if (!apiKey || !accountId) return jsonErr({ error: "Config Zernio ausente (zernio_api_key/zernio_account_id)" }, 500);

    const porHora = Math.max(1, Number(cfg["zernio_broadcast_por_hora"] || "60") || 60);
    const limiteDiario = Math.max(1, Number(cfg["zernio_broadcast_limite_diario"] || "1000") || 1000);
    const TETO_INVOCACAO = 20;

    // --- Quotas: quanto já saiu na última hora / último dia ---
    const agora = Date.now();
    const desdeHoraIso = new Date(agora - 60 * 60 * 1000).toISOString();
    const desdeDiaIso = new Date(agora - 24 * 60 * 60 * 1000).toISOString();
    const enviadosHora = await contar(env, `/fran_zernio_broadcast_itens?status=eq.enviado&data_processado=gte.${encodeURIComponent(desdeHoraIso)}&select=id`);
    const enviadosDia = await contar(env, `/fran_zernio_broadcast_itens?status=eq.enviado&data_processado=gte.${encodeURIComponent(desdeDiaIso)}&select=id`);

    const restanteHora = porHora - enviadosHora;
    const restanteDia = limiteDiario - enviadosDia;
    const quota = Math.min(TETO_INVOCACAO, restanteHora, restanteDia);
    if (quota <= 0) {
      return jsonOk({ ok: true, processados: 0, mensagem: "Limite atingido nesta janela", enviadosHora, enviadosDia, porHora, limiteDiario });
    }

    // --- Puxa o lote de itens na_fila (com broadcast + devedor embutidos) ---
    const select = [
      "id", "broadcast_id", "devedor_id", "telefone", "tentativas",
      "broadcast:fran_zernio_broadcasts(template_name,template_language,variaveis,status)",
      "devedor:fran_devedores(nome_devedor,primeiro_nome,tratamento,instituicao,cidade,valor_atualizado,valor_original)",
    ].join(",");
    const itensResp = await rest(env, "GET", `/fran_zernio_broadcast_itens?status=eq.na_fila&order=created_at.asc&limit=${quota}&select=${encodeURIComponent(select)}`);
    if (!itensResp.ok) {
      const t = await itensResp.text().catch(() => "");
      return jsonErr({ error: `Falha ao ler fila: ${t}` }, 500);
    }
    const itens = (await itensResp.json().catch(() => [])) as ItemFila[];

    // Ignora itens de broadcasts pausados/cancelados (deixa na fila, sem enviar).
    const enviaveis = itens.filter((it) => {
      const s = it.broadcast?.status ?? "";
      return s !== "pausado" && s !== "cancelado";
    });

    let enviados = 0, erros = 0;
    const afetados = new Set<number>();
    for (const item of enviaveis) {
      const r = await processarItem(env, apiKey, accountId, item);
      if (r === "enviado") enviados++; else erros++;
      afetados.add(item.broadcast_id);
    }

    for (const bid of afetados) {
      try { await reconciliarBroadcast(env, bid); } catch (e) { console.error("[zernio-broadcast] reconciliar:", e); }
    }

    console.log(`[zernio-broadcast] lote: enviados=${enviados} erros=${erros} (quota=${quota}, hora=${enviadosHora}/${porHora}, dia=${enviadosDia}/${limiteDiario})`);
    return jsonOk({ ok: true, processados: enviaveis.length, enviados, erros, quota, enviadosHora, enviadosDia, porHora, limiteDiario });

  } catch (err) {
    console.error("[zernio-broadcast] Excecao:", err);
    return jsonErr({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
