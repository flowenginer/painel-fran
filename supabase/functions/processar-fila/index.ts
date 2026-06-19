// Edge Function: processar-fila
//
// Processa a "fila de distribuição" em gotejamento (drip). Pensada para
// ser chamada periodicamente pelo pg_cron do Supabase (a cada 10 min) e
// também manualmente pela UI ("Processar agora").
//
// Em cada execução respeita, nesta ordem:
//   1. fila_ativa            → liga/desliga o processamento
//   2. janela de horário     → horario_disparo_inicio/fim (São Paulo)
//   3. taxa por hora         → fila_disparos_por_hora
//   4. limite diário         → limite_diario_disparos
// Quando bate o limite do dia, simplesmente não envia mais nada — retoma
// naturalmente no dia seguinte, dentro da janela de horário.
//
// Compartilha a lógica de disparo com `disparar-lote` via
// `_shared/disparo-core.ts`.

// ─────────────────────────────────────────────────────────────────────────
// Helpers inlinados (cors + acesso ao Supabase + lógica de disparo).
// Inlinados para permitir o deploy pelo editor de Edge Functions do Supabase
// Dashboard, sem CLI. A MESMA lógica de disparo está inlinada em
// disparar-lote/index.ts — ao alterá-la, replicar nas DUAS functions.
// ─────────────────────────────────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(
  body: unknown,
  status = 200,
  extra: HeadersInit = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders, ...extra },
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

interface UserInfo {
  id: string;
  email?: string;
}

async function validarJwt(
  env: SupabaseEnv,
  authHeader: string
): Promise<UserInfo> {
  const resp = await fetch(`${env.url}/auth/v1/user`, {
    headers: { Authorization: authHeader, apikey: env.anonKey },
  });
  if (!resp.ok) {
    const texto = await resp.text().catch(() => "");
    throw new Error(
      `Sessão inválida (HTTP ${resp.status}): ${texto || "JWT não aceito"}`
    );
  }
  const user = (await resp.json()) as UserInfo;
  if (!user?.id) throw new Error("Usuário sem id retornado pelo auth");
  return user;
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
  if (!resp.ok) {
    const texto = await resp.text().catch(() => "");
    throw new Error(`Falha ao ler fran_config: ${resp.status} ${texto}`);
  }
  const rows = (await resp.json()) as Array<{
    chave: string;
    valor: string | null;
  }>;
  const mapa: Record<string, string> = {};
  for (const r of rows) mapa[r.chave] = r.valor ?? "";
  return mapa;
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

const TZ = "America/Sao_Paulo";

interface DevedorRow {
  id: number;
  id_devedor: string | null;
  cod_credor: string | null;
  cod_devedor: string | null;
  cpf: string | null;
  nome_devedor: string;
  primeiro_nome: string | null;
  tratamento: string | null;
  email: string | null;
  telefone: string;
  telefone_2: string | null;
  telefone_3: string | null;
  endereco: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  cep: string | null;
  instituicao: string;
  nome_aluno: string | null;
  valor_original: number | null;
  valor_atualizado: number | null;
  qtd_parcelas_aberto: number | null;
  ano_inicial_dividas: number | null;
  ano_final_dividas: number | null;
  acordo_anterior: string | null;
  dado_adicional: string | null;
  observacoes_negociacao: string | null;
  status_negociacao: string | null;
  campanha: string | null;
  data_primeiro_disparo: string | null;
  data_ultimo_contato: string | null;
  tentativas_contato: number | null;
  acordo_valor_total: number | null;
  acordo_valor_entrada: number | null;
  acordo_num_parcelas: number | null;
  acordo_valor_parcela: number | null;
  acordo_data_aceite: string | null;
}

function inicioHojeSaoPauloUTC(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const hoje = fmt.format(new Date());
  return new Date(`${hoje}T00:00:00-03:00`).toISOString();
}

function inicioHoraAtualSaoPauloUTC(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const ano = get("year");
  const mes = get("month");
  const dia = get("day");
  let hora = get("hour");
  if (hora === "24") hora = "00";
  return new Date(`${ano}-${mes}-${dia}T${hora}:00:00-03:00`).toISOString();
}

function diaSemanaSaoPaulo(): number {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" });
  const dia = fmt.format(new Date());
  const mapa: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return mapa[dia] ?? new Date().getUTCDay();
}

function diaPermitido(dias: string | undefined | null): boolean {
  const lista = (dias ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (lista.length === 0) return true;
  return lista.includes(String(diaSemanaSaoPaulo()));
}

function dentroDoHorario(inicio: string, fim: string): boolean {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const hora = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minuto = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const atual = hora * 60 + minuto;
  const [iH, iM] = (inicio ?? "08:00").split(":").map(Number);
  const [fH, fM] = (fim ?? "20:00").split(":").map(Number);
  return atual >= iH * 60 + iM && atual <= fH * 60 + fM;
}

async function contarEnviadosDesde(
  env: SupabaseEnv,
  desdeISO: string
): Promise<number> {
  const resp = await rest(
    env,
    "GET",
    `/fran_disparos?status_envio=eq.enviado&data_disparo=gte.${encodeURIComponent(
      desdeISO
    )}&select=id`,
    undefined,
    { Prefer: "count=exact" }
  );
  if (!resp.ok) {
    throw new Error(
      `Falha ao contar disparos: ${resp.status} ${await resp.text()}`
    );
  }
  const contentRange = resp.headers.get("content-range") ?? "0-0/0";
  return Number(contentRange.split("/")[1]) || 0;
}

function montarPayloadDevedor(d: DevedorRow) {
  const telefones = [d.telefone, d.telefone_2, d.telefone_3]
    .filter((t): t is string => Boolean(t && t.trim()))
    .filter((t, i, arr) => arr.indexOf(t) === i);
  return {
    devedor_id: d.id,
    id: d.id,
    id_devedor: d.id_devedor,
    cod_credor: d.cod_credor,
    cod_devedor: d.cod_devedor,
    cpf: d.cpf,
    nome_devedor: d.nome_devedor,
    primeiro_nome: d.primeiro_nome,
    tratamento: d.tratamento,
    email: d.email,
    telefone: d.telefone,
    telefone_2: d.telefone_2,
    telefone_3: d.telefone_3,
    telefones,
    endereco: d.endereco,
    bairro: d.bairro,
    cidade: d.cidade,
    estado: d.estado,
    cep: d.cep,
    instituicao: d.instituicao,
    nome_aluno: d.nome_aluno,
    valor_original: d.valor_original,
    valor_atualizado: d.valor_atualizado,
    qtd_parcelas_aberto: d.qtd_parcelas_aberto,
    ano_inicial_dividas: d.ano_inicial_dividas,
    ano_final_dividas: d.ano_final_dividas,
    acordo_anterior: d.acordo_anterior,
    dado_adicional: d.dado_adicional,
    observacoes_negociacao: d.observacoes_negociacao,
    status_negociacao: d.status_negociacao,
    campanha: d.campanha,
    data_primeiro_disparo: d.data_primeiro_disparo,
    data_ultimo_contato: d.data_ultimo_contato,
    tentativas_contato: d.tentativas_contato,
    acordo_valor_total: d.acordo_valor_total,
    acordo_valor_entrada: d.acordo_valor_entrada,
    acordo_num_parcelas: d.acordo_num_parcelas,
    acordo_valor_parcela: d.acordo_valor_parcela,
    acordo_data_aceite: d.acordo_data_aceite,
  };
}

interface WebhookResultado {
  ok: boolean;
  resposta: unknown;
  erro: string | null;
}

interface CanalDisparo {
  instancia: string;
  token: string;
}

// Escolhe o próximo canal de disparo (rodízio ponderado por peso). Quando
// `conectadas` é passado, só considera essas instâncias. Retorna null se
// nenhum canal elegível — o n8n usa o número padrão dele.
async function escolherCanal(
  env: SupabaseEnv,
  conectadas: string[] | null
): Promise<CanalDisparo | null> {
  try {
    const resp = await rest(
      env,
      "POST",
      "/rpc/fran_proximo_canal_disparo",
      conectadas ? { p_conectadas: conectadas } : {}
    );
    if (!resp.ok) return null;
    const rows = (await resp.json().catch(() => [])) as Array<{
      instancia: string | null;
      token: string | null;
    }>;
    const r = Array.isArray(rows) ? rows[0] : null;
    if (!r || !r.instancia) return null;
    return { instancia: r.instancia, token: r.token ?? "" };
  } catch {
    return null;
  }
}

// Checa, via webhook de status do n8n (UAZAPI), se a instância está conectada.
async function instanciaConectada(
  webhookUrl: string,
  secret: string,
  instancia: string
): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8_000);
  try {
    const r = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Painel-Secret": secret },
      body: JSON.stringify({ acao: "status", instancia }),
      signal: ctrl.signal,
    });
    if (!r.ok) return false;
    const raw = await r.json().catch(() => null);
    const o = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown> | null;
    return String(o?.estado ?? "") === "connected";
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// Lista as instâncias de disparo CONECTADAS agora e atualiza o cache
// fran_canais.conectado. Retorna null quando a checagem não pôde rodar.
async function lerCanaisConectados(
  env: SupabaseEnv,
  webhookUrl: string,
  secret: string
): Promise<string[] | null> {
  if (!webhookUrl || !secret) return null;
  try {
    const resp = await rest(
      env,
      "GET",
      "/fran_canais?ativo=eq.true&usar_no_disparo=eq.true&select=id,instancia"
    );
    if (!resp.ok) return null;
    const canais = (await resp.json().catch(() => [])) as Array<{
      id: number;
      instancia: string | null;
    }>;
    const candidatos = canais.filter((c) => (c.instancia ?? "").trim());
    if (candidatos.length === 0) return null;

    const resultados = await Promise.all(
      candidatos.map(async (c) => {
        const inst = (c.instancia ?? "").trim();
        const conectado = await instanciaConectada(webhookUrl, secret, inst);
        await rest(
          env,
          "PATCH",
          `/fran_canais?id=eq.${c.id}`,
          { conectado, status_em: new Date().toISOString() },
          { Prefer: "return=minimal" }
        ).catch(() => undefined);
        return { inst, conectado };
      })
    );
    return resultados.filter((r) => r.conectado).map((r) => r.inst);
  } catch {
    return null;
  }
}

async function atribuirResponsaveis(
  env: SupabaseEnv,
  devedorIds: number[]
): Promise<void> {
  for (const id of devedorIds) {
    try {
      const resp = await rest(env, "POST", "/rpc/fran_atribuir_responsavel", {
        p_devedor_id: id,
      });
      if (!resp.ok) {
        console.error(
          `[distribuicao] falha ao atribuir devedor ${id}:`,
          resp.status,
          await resp.text()
        );
      }
    } catch (err) {
      console.error(`[distribuicao] exceção ao atribuir devedor ${id}:`, err);
    }
  }
}

async function enviarWebhook(
  url: string,
  payload: unknown
): Promise<WebhookResultado> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60_000);
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const texto = await resp.text();
    let resposta: unknown;
    try {
      resposta = texto ? JSON.parse(texto) : texto;
    } catch {
      resposta = texto;
    }
    if (resp.ok) return { ok: true, resposta, erro: null };
    return { ok: false, resposta, erro: `HTTP ${resp.status}` };
  } catch (err) {
    clearTimeout(timer);
    const erro =
      err instanceof Error && err.name === "AbortError"
        ? "Timeout ao chamar webhook n8n"
        : err instanceof Error
          ? err.message
          : String(err);
    return { ok: false, resposta: null, erro };
  }
}
// ───────────────────────── fim dos helpers inlinados ─────────────────────

// Quantas vezes o cron roda por hora (a cada 10 min). Usado para diluir a
// taxa por hora em levas menores, evitando rajadas no topo de cada hora.
const RUNS_POR_HORA = 6;
// Tentativas de webhook antes de marcar o item da fila como erro.
const MAX_TENTATIVAS = 3;

interface FilaRow {
  id: number;
  devedor_id: number;
  campanha: string | null;
  tentativas: number;
  fran_devedores: DevedorRow | null;
}

// Resposta padrão "não fez nada" (ainda 200, para o cron não acusar falha).
function ocioso(motivo: string, extra: Record<string, unknown> = {}) {
  return jsonResponse({
    ok: true,
    processados: 0,
    enviados: 0,
    erros: 0,
    motivo,
    ...extra,
  });
}

// Autoriza a chamada: via segredo de cron (header x-cron-secret) ou via
// JWT de operador (botão "Processar agora" na UI).
async function autorizar(
  env: SupabaseEnv,
  req: Request,
  cronSecret: string
): Promise<{ ok: true; via: "cron" | "usuario" } | { ok: false; resp: Response }> {
  const headerSecret = req.headers.get("x-cron-secret");
  if (headerSecret && cronSecret && headerSecret === cronSecret) {
    return { ok: true, via: "cron" };
  }
  const authHeader = req.headers.get("Authorization");
  if (authHeader) {
    try {
      await validarJwt(env, authHeader);
      return { ok: true, via: "usuario" };
    } catch {
      /* cai no 401 abaixo */
    }
  }
  return {
    ok: false,
    resp: jsonResponse({ error: "Não autorizado" }, 401),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Método não permitido" }, 405);
  }

  try {
    console.log("[processar-fila] start");
    const env = lerEnv();

    const cfg = await lerConfig(env, [
      "fila_ativa",
      "fila_disparos_por_hora",
      "fila_dias_semana",
      "fila_cron_secret",
      "limite_diario_disparos",
      "horario_disparo_inicio",
      "horario_disparo_fim",
      "n8n_webhook_url",
      "uazapi_webhook_url",
      "uazapi_webhook_secret",
    ]);

    const auth = await autorizar(env, req, cfg.fila_cron_secret?.trim() ?? "");
    if (!auth.ok) return auth.resp;

    const filaAtiva = (cfg.fila_ativa?.trim() ?? "false") === "true";
    const porHora = Math.max(0, Number(cfg.fila_disparos_por_hora) || 0);
    const limiteDiario = Number(cfg.limite_diario_disparos) || 40;
    const horaInicio = cfg.horario_disparo_inicio?.trim() || "08:00";
    const horaFim = cfg.horario_disparo_fim?.trim() || "20:00";
    const webhookUrl = cfg.n8n_webhook_url?.trim();
    const statusUrl = cfg.uazapi_webhook_url?.trim() || "";
    const statusSecret = cfg.uazapi_webhook_secret?.trim() || "";

    if (!filaAtiva) return ocioso("fila_pausada");
    if (porHora <= 0) return ocioso("taxa_por_hora_zerada");
    if (!webhookUrl) {
      return jsonResponse(
        { error: "URL do webhook n8n não configurada." },
        400
      );
    }
    if (!diaPermitido(cfg.fila_dias_semana)) {
      return ocioso("fora_dia_semana");
    }
    if (!dentroDoHorario(horaInicio, horaFim)) {
      return ocioso("fora_horario", { horario: `${horaInicio}-${horaFim}` });
    }

    // Quanto ainda cabe hoje e nesta hora.
    const enviadosHoje = await contarEnviadosDesde(
      env,
      inicioHojeSaoPauloUTC()
    );
    const enviadosHora = await contarEnviadosDesde(
      env,
      inicioHoraAtualSaoPauloUTC()
    );

    const restanteDia = Math.max(0, limiteDiario - enviadosHoje);
    const restanteHora = Math.max(0, porHora - enviadosHora);
    // Dilui a taxa por hora nas execuções do cron (evita rajada).
    const capPorRun = Math.max(1, Math.ceil(porHora / RUNS_POR_HORA));

    const quota = Math.min(restanteDia, restanteHora, capPorRun);
    if (quota <= 0) {
      return ocioso(
        restanteDia <= 0 ? "limite_diario_atingido" : "limite_hora_atingido",
        {
          enviados_hoje: enviadosHoje,
          limite_diario: limiteDiario,
          enviados_hora: enviadosHora,
          por_hora: porHora,
        }
      );
    }

    // Busca itens na fila + devedor embutido. Pega um buffer extra para
    // compensar itens que se tornaram inelegíveis (já contatados, etc.).
    const limite = quota + 25;
    const filaResp = await rest(
      env,
      "GET",
      `/fran_fila_disparo?status=eq.na_fila&select=id,devedor_id,campanha,tentativas,fran_devedores(*)&order=prioridade.asc,created_at.asc&limit=${limite}`
    );
    if (!filaResp.ok) {
      throw new Error(
        `Falha ao ler fila: ${filaResp.status} ${await filaResp.text()}`
      );
    }
    const itens = (await filaResp.json()) as FilaRow[];
    if (itens.length === 0) return ocioso("fila_vazia");

    const elegiveis: { item: FilaRow; devedor: DevedorRow }[] = [];
    const inelegiveis: { id: number; motivo: string }[] = [];

    for (const item of itens) {
      if (elegiveis.length >= quota) break;
      const d = item.fran_devedores;
      if (!d) {
        inelegiveis.push({ id: item.id, motivo: "Devedor não encontrado" });
        continue;
      }
      if (d.status_negociacao !== "pendente") {
        inelegiveis.push({
          id: item.id,
          motivo: `Status é ${d.status_negociacao ?? "indefinido"}, esperava pendente`,
        });
        continue;
      }
      if (!d.telefone || d.telefone.trim().length < 12) {
        inelegiveis.push({ id: item.id, motivo: "Sem telefone válido" });
        continue;
      }
      elegiveis.push({ item, devedor: d });
    }

    // Remove inelegíveis da fila (marca como erro com o motivo) para não
    // travarem o processamento das próximas execuções.
    if (inelegiveis.length > 0) {
      const ids = inelegiveis.map((i) => i.id).join(",");
      await rest(
        env,
        "PATCH",
        `/fran_fila_disparo?id=in.(${ids})`,
        {
          status: "erro",
          erro_detalhes: "Inelegível no processamento da fila",
          data_processado: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { Prefer: "return=minimal" }
      );
    }

    if (elegiveis.length === 0) {
      return ocioso("nenhum_elegivel", { inelegiveis: inelegiveis.length });
    }

    // Agrupa por campanha (itens podem ter campanhas diferentes). Na prática
    // costuma ser uma só, mas mantemos correto enviando um payload por grupo.
    const grupos = new Map<string, { devedor: DevedorRow; itemId: number }[]>();
    for (const { item, devedor } of elegiveis) {
      const chave = item.campanha ?? "";
      const lista = grupos.get(chave) ?? [];
      lista.push({ devedor, itemId: item.id });
      grupos.set(chave, lista);
    }

    let enviados = 0;
    let erros = 0;
    const agora = new Date().toISOString();

    // Instâncias conectadas agora — só elas entram no rodízio de disparo.
    const conectadas = await lerCanaisConectados(env, statusUrl, statusSecret);

    for (const [campanhaChave, grupo] of grupos) {
      const campanha = campanhaChave || undefined;
      const devedores = grupo.map((g) => g.devedor);
      const itemIds = grupo.map((g) => g.itemId);
      const devedorIds = devedores.map((d) => d.id);

      // Canal de disparo por devedor (rodízio ponderado por peso).
      const canalPorDev = new Map<number, CanalDisparo>();
      for (const d of devedores) {
        const c = await escolherCanal(env, conectadas);
        if (c) canalPorDev.set(d.id, c);
      }

      const webhook = await enviarWebhook(webhookUrl, {
        campanha,
        origem: "fila",
        reenviar: false,
        devedores: devedores.map((d) => {
          const c = canalPorDev.get(d.id);
          return {
            ...montarPayloadDevedor(d),
            instancia: c?.instancia ?? null,
            token: c?.token ?? null,
          };
        }),
      });

      // Registra em fran_disparos (1 linha por devedor).
      const linhas = devedores.map((d) => ({
        devedor_id: d.id,
        telefone: d.telefone,
        data_disparo: agora,
        status_envio: webhook.ok ? "enviado" : "erro",
        erro_detalhes: webhook.erro,
        webhook_response: webhook.resposta,
        campanha,
      }));
      const insResp = await rest(env, "POST", "/fran_disparos", linhas, {
        Prefer: "return=minimal",
      });
      if (!insResp.ok) {
        console.error(
          "[processar-fila] erro ao inserir fran_disparos:",
          insResp.status,
          await insResp.text()
        );
      }

      if (webhook.ok) {
        enviados += devedores.length;
        // Marca itens da fila como enviados.
        await rest(
          env,
          "PATCH",
          `/fran_fila_disparo?id=in.(${itemIds.join(",")})`,
          {
            status: "enviado",
            erro_detalhes: null,
            data_processado: agora,
            updated_at: agora,
          },
          { Prefer: "return=minimal" }
        );
        // Atualiza devedores: primeira mensagem enviada.
        await rest(
          env,
          "PATCH",
          `/fran_devedores?id=in.(${devedorIds.join(",")})`,
          {
            status_negociacao: "primeira_msg",
            data_primeiro_disparo: agora,
            data_ultimo_contato: agora,
          },
          { Prefer: "return=minimal" }
        );
        // Distribui os leads recém-disparados entre os operadores (round-robin).
        await atribuirResponsaveis(env, devedorIds);
      } else {
        erros += devedores.length;
        // Incrementa tentativas; se estourar o máximo, marca erro, senão
        // devolve para a fila para nova tentativa no próximo ciclo.
        for (const g of grupo) {
          const tentativas =
            (elegiveis.find((e) => e.item.id === g.itemId)?.item.tentativas ??
              0) + 1;
          const estourou = tentativas >= MAX_TENTATIVAS;
          await rest(
            env,
            "PATCH",
            `/fran_fila_disparo?id=eq.${g.itemId}`,
            {
              status: estourou ? "erro" : "na_fila",
              tentativas,
              erro_detalhes: webhook.erro,
              updated_at: agora,
              ...(estourou ? { data_processado: agora } : {}),
            },
            { Prefer: "return=minimal" }
          );
        }
      }
    }

    return jsonResponse({
      ok: true,
      processados: elegiveis.length,
      enviados,
      erros,
      inelegiveis: inelegiveis.length,
      quota,
      restante_dia: Math.max(0, restanteDia - enviados),
      enviados_hoje: enviadosHoje + enviados,
      limite_diario: limiteDiario,
      por_hora: porHora,
    });
  } catch (err) {
    console.error("[processar-fila] exceção não tratada:", err);
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse(
      { error: message, stack: err instanceof Error ? err.stack : undefined },
      500
    );
  }
});
