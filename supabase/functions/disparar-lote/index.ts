// Edge Function: disparar-lote
//
// Dispara a primeira mensagem em lote via webhook n8n com validações
// de limite diário, horário e elegibilidade dos devedores.
//
// Disparo manual/imediato (acionado pelo botão "Disparar Campanha"). O
// disparo automático por hora vive na função `processar-fila`. Ambas
// compartilham a lógica em `_shared/disparo-core.ts`.

// ─────────────────────────────────────────────────────────────────────────
// Helpers inlinados (cors + acesso ao Supabase + lógica de disparo).
// Inlinados para permitir o deploy pelo editor de Edge Functions do Supabase
// Dashboard, sem CLI. A MESMA lógica de disparo está inlinada em
// processar-fila/index.ts — ao alterá-la, replicar nas DUAS functions.
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

interface RequestBody {
  devedor_ids: number[];
  campanha?: string;
  /**
   * Se true, é um reenvio da primeira mensagem (não requer status=pendente).
   * Usado a partir do dropdown de ações do devedor. Quem já fechou acordo
   * (status=acordo_aceito) continua bloqueado para proteger negociações.
   */
  reenviar?: boolean;
}

function validarBody(raw: unknown): RequestBody {
  if (!raw || typeof raw !== "object") {
    throw new Error("Body deve ser um objeto JSON");
  }
  const b = raw as Record<string, unknown>;
  const ids = b.devedor_ids;
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error("devedor_ids deve ser um array não-vazio");
  }
  const parsed: number[] = [];
  for (const id of ids) {
    const n = Number(id);
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error("devedor_ids contém valores inválidos");
    }
    parsed.push(Math.floor(n));
  }
  const campanha =
    typeof b.campanha === "string" && b.campanha.trim().length > 0
      ? b.campanha.trim()
      : undefined;
  const reenviar = b.reenviar === true;
  return { devedor_ids: parsed, campanha, reenviar };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Método não permitido" }, 405);
  }

  try {
    console.log("[disparar-lote] start");
    const env = lerEnv();

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Header Authorization ausente" }, 401);
    }
    let usuarioId: string;
    try {
      const user = await validarJwt(env, authHeader);
      usuarioId = user.id;
    } catch (err) {
      console.error("[disparar-lote] JWT inválido:", err);
      return jsonResponse(
        {
          error:
            "Sessão inválida ou expirada. Faça logout e login novamente.",
          detail: err instanceof Error ? err.message : String(err),
        },
        401
      );
    }

    const body = await req.json().catch(() => null);
    const { devedor_ids, campanha, reenviar } = validarBody(body);

    // 1. Lê configs
    const cfg = await lerConfig(env, [
      "limite_diario_disparos",
      "horario_disparo_inicio",
      "horario_disparo_fim",
      "n8n_webhook_url",
    ]);

    const limiteDiario = Number(cfg.limite_diario_disparos) || 40;
    const horaInicio = cfg.horario_disparo_inicio?.trim() || "08:00";
    const horaFim = cfg.horario_disparo_fim?.trim() || "20:00";
    const webhookUrl = cfg.n8n_webhook_url?.trim();
    if (!webhookUrl) {
      return jsonResponse(
        { error: "URL do webhook n8n não configurada." },
        400
      );
    }

    // 2. Valida horário
    if (!dentroDoHorario(horaInicio, horaFim)) {
      return jsonResponse(
        {
          error: `Fora do horário permitido (${horaInicio}–${horaFim} em São Paulo).`,
        },
        400
      );
    }

    // 3. Valida limite diário
    const jaEnviados = await contarEnviadosDesde(
      env,
      inicioHojeSaoPauloUTC()
    );

    const disponivel = limiteDiario - jaEnviados;
    if (disponivel <= 0) {
      return jsonResponse(
        { error: `Limite diário atingido (${jaEnviados}/${limiteDiario}).` },
        400
      );
    }
    if (devedor_ids.length > disponivel) {
      return jsonResponse(
        {
          error: `Selecionou ${devedor_ids.length}, mas só restam ${disponivel} disparos hoje (limite ${limiteDiario}).`,
        },
        400
      );
    }

    // 4. Busca devedores e valida elegibilidade
    const ids = devedor_ids.join(",");
    const devResp = await rest(
      env,
      "GET",
      // select=* para enviar o registro completo no payload do n8n.
      // Reduz round-trips e dá à Fran o contexto inteiro do lead.
      `/fran_devedores?id=in.(${ids})&select=*`
    );
    if (!devResp.ok) {
      throw new Error(
        `Falha ao buscar devedores: ${devResp.status} ${await devResp.text()}`
      );
    }
    const devedores = (await devResp.json()) as DevedorRow[];
    const mapa = new Map(devedores.map((d) => [d.id, d]));

    const elegiveis: DevedorRow[] = [];
    const inelegiveis: { id: number; motivo: string }[] = [];

    for (const id of devedor_ids) {
      const d = mapa.get(id);
      if (!d) {
        inelegiveis.push({ id, motivo: "Devedor não encontrado" });
        continue;
      }
      if (reenviar) {
        // Reenvio: só proíbe devedores com acordo já aceito (para não
        // perturbar negociações fechadas).
        if (d.status_negociacao === "acordo_aceito") {
          inelegiveis.push({
            id,
            motivo: "Devedor já fechou acordo — reenvio bloqueado",
          });
          continue;
        }
      } else {
        // Disparo inicial: exige status=pendente.
        if (d.status_negociacao !== "pendente") {
          inelegiveis.push({
            id,
            motivo: `Status é ${d.status_negociacao ?? "indefinido"}, esperava pendente`,
          });
          continue;
        }
      }
      if (!d.telefone || d.telefone.trim().length < 12) {
        inelegiveis.push({ id, motivo: "Sem telefone válido" });
        continue;
      }
      elegiveis.push(d);
    }

    if (elegiveis.length === 0) {
      return jsonResponse(
        { error: "Nenhum devedor elegível para disparo", inelegiveis },
        400
      );
    }

    // 5. Envia ao webhook n8n
    const payload = {
      campanha,
      usuario_id: usuarioId,
      reenviar: reenviar ?? false,
      devedores: elegiveis.map(montarPayloadDevedor),
    };

    const webhook = await enviarWebhook(webhookUrl, payload);
    const webhookOk = webhook.ok;
    const webhookErr = webhook.erro;
    const webhookResp = webhook.resposta;

    // 6. Registra em fran_disparos
    const agora = new Date().toISOString();
    const linhasDisparo = elegiveis.map((d) => ({
      devedor_id: d.id,
      telefone: d.telefone,
      data_disparo: agora,
      status_envio: webhookOk ? "enviado" : "erro",
      erro_detalhes: webhookErr,
      webhook_response: webhookResp,
      campanha,
      usuario_id: usuarioId,
    }));

    const insResp = await rest(
      env,
      "POST",
      "/fran_disparos",
      linhasDisparo,
      { Prefer: "return=minimal" }
    );
    if (!insResp.ok) {
      console.error(
        "Erro ao inserir fran_disparos:",
        insResp.status,
        await insResp.text()
      );
    }

    // 7. Atualiza devedores se sucesso
    if (webhookOk) {
      const idsList = elegiveis.map((d) => d.id).join(",");
      // No reenvio, preserva status e data_primeiro_disparo — só marca que
      // houve contato agora. No disparo inicial, muda para primeira_msg e
      // grava o primeiro disparo.
      const patch: Record<string, unknown> = reenviar
        ? { data_ultimo_contato: agora }
        : {
            status_negociacao: "primeira_msg",
            data_primeiro_disparo: agora,
            data_ultimo_contato: agora,
          };
      const updResp = await rest(
        env,
        "PATCH",
        `/fran_devedores?id=in.(${idsList})`,
        patch,
        { Prefer: "return=minimal" }
      );
      if (!updResp.ok) {
        console.error(
          "Erro ao atualizar devedores:",
          updResp.status,
          await updResp.text()
        );
      }
      // Distribui os leads entre os operadores (round-robin), apenas no
      // disparo inicial — reenvio não é "primeira mensagem" e o lead já
      // tem (ou não) dono definido anteriormente.
      if (!reenviar) {
        await atribuirResponsaveis(
          env,
          elegiveis.map((d) => d.id)
        );
      }
    }

    return jsonResponse({
      ok: webhookOk,
      enviados: webhookOk ? elegiveis.length : 0,
      erros: webhookOk ? 0 : elegiveis.length,
      inelegiveis,
      limite_diario: limiteDiario,
      limite_restante: Math.max(
        0,
        disponivel - (webhookOk ? elegiveis.length : 0)
      ),
      webhook_error: webhookErr,
    });
  } catch (err) {
    console.error("[disparar-lote] exceção não tratada:", err);
    const message = err instanceof Error ? err.message : String(err);
    const isValidation =
      /devedor_ids|Body deve ser|Fora do hor|Limite di|Selecionou/.test(
        message
      );
    return jsonResponse(
      { error: message, stack: err instanceof Error ? err.stack : undefined },
      isValidation ? 400 : 500
    );
  }
});
