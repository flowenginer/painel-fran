// Lógica compartilhada de disparo entre as Edge Functions `disparar-lote`
// (disparo manual/imediato) e `processar-fila` (drip automático por hora).
//
// Centraliza: shape do devedor, montagem do payload do webhook n8n,
// contagem de disparos por janela de tempo, validação de horário e o
// próprio POST ao webhook. Assim as duas funções aplicam exatamente as
// mesmas regras.

import { rest, type SupabaseEnv } from "./supabase-rest.ts";

export const TZ = "America/Sao_Paulo";

// Representa o devedor lido da tabela. Campos opcionais incluídos para
// que o webhook receba o registro completo — útil para a Fran ter
// contexto sem precisar fazer outra consulta.
export interface DevedorRow {
  id: number;
  // Identificação
  id_devedor: string | null;
  cod_credor: string | null;
  cod_devedor: string | null;
  cpf: string | null;
  nome_devedor: string;
  primeiro_nome: string | null;
  tratamento: string | null;
  email: string | null;
  // Telefones
  telefone: string;
  telefone_2: string | null;
  telefone_3: string | null;
  // Endereço
  endereco: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  cep: string | null;
  // Instituição/aluno
  instituicao: string;
  nome_aluno: string | null;
  // Dívida
  valor_original: number | null;
  valor_atualizado: number | null;
  qtd_parcelas_aberto: number | null;
  ano_inicial_dividas: number | null;
  ano_final_dividas: number | null;
  acordo_anterior: string | null;
  // Notas
  dado_adicional: string | null;
  observacoes_negociacao: string | null;
  // Negociação
  status_negociacao: string | null;
  campanha: string | null;
  data_primeiro_disparo: string | null;
  data_ultimo_contato: string | null;
  tentativas_contato: number | null;
  // Acordo (preenchido pela Fran via tools quando aceita)
  acordo_valor_total: number | null;
  acordo_valor_entrada: number | null;
  acordo_num_parcelas: number | null;
  acordo_valor_parcela: number | null;
  acordo_data_aceite: string | null;
}

// Início do dia atual em SP como ISO UTC. SP é UTC-3 (sem DST desde 2019).
export function inicioHojeSaoPauloUTC(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const hoje = fmt.format(new Date());
  return new Date(`${hoje}T00:00:00-03:00`).toISOString();
}

// Início da hora atual em SP como ISO UTC (ex: 14:37 → 14:00). Usado para
// contar quantos disparos já saíram dentro da hora corrente.
export function inicioHoraAtualSaoPauloUTC(): string {
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
  // Intl pode devolver "24" para meia-noite em alguns runtimes; normaliza.
  let hora = get("hour");
  if (hora === "24") hora = "00";
  return new Date(`${ano}-${mes}-${dia}T${hora}:00:00-03:00`).toISOString();
}

export function dentroDoHorario(inicio: string, fim: string): boolean {
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

// Conta disparos com status_envio=enviado a partir de `desdeISO`.
export async function contarEnviadosDesde(
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

export function montarPayloadDevedor(d: DevedorRow) {
  // Lista os telefones cadastrados em ordem, sem nulos/duplicados,
  // facilitando iteração no n8n caso o primário falhe.
  const telefones = [d.telefone, d.telefone_2, d.telefone_3]
    .filter((t): t is string => Boolean(t && t.trim()))
    .filter((t, i, arr) => arr.indexOf(t) === i);

  return {
    // Mantém devedor_id para compatibilidade com workflows n8n
    // existentes; id é o mesmo valor.
    devedor_id: d.id,
    id: d.id,
    // Identificação Cedrus
    id_devedor: d.id_devedor,
    cod_credor: d.cod_credor,
    cod_devedor: d.cod_devedor,
    cpf: d.cpf,
    // Pessoa
    nome_devedor: d.nome_devedor,
    primeiro_nome: d.primeiro_nome,
    tratamento: d.tratamento,
    email: d.email,
    // Telefones (primário + array completo)
    telefone: d.telefone,
    telefone_2: d.telefone_2,
    telefone_3: d.telefone_3,
    telefones,
    // Endereço
    endereco: d.endereco,
    bairro: d.bairro,
    cidade: d.cidade,
    estado: d.estado,
    cep: d.cep,
    // Instituição/aluno
    instituicao: d.instituicao,
    nome_aluno: d.nome_aluno,
    // Dívida
    valor_original: d.valor_original,
    valor_atualizado: d.valor_atualizado,
    qtd_parcelas_aberto: d.qtd_parcelas_aberto,
    ano_inicial_dividas: d.ano_inicial_dividas,
    ano_final_dividas: d.ano_final_dividas,
    acordo_anterior: d.acordo_anterior,
    // Notas
    dado_adicional: d.dado_adicional,
    observacoes_negociacao: d.observacoes_negociacao,
    // Negociação
    status_negociacao: d.status_negociacao,
    campanha: d.campanha,
    data_primeiro_disparo: d.data_primeiro_disparo,
    data_ultimo_contato: d.data_ultimo_contato,
    tentativas_contato: d.tentativas_contato,
    // Acordo (caso já tenha um aceito anteriormente)
    acordo_valor_total: d.acordo_valor_total,
    acordo_valor_entrada: d.acordo_valor_entrada,
    acordo_num_parcelas: d.acordo_num_parcelas,
    acordo_valor_parcela: d.acordo_valor_parcela,
    acordo_data_aceite: d.acordo_data_aceite,
  };
}

export interface WebhookResultado {
  ok: boolean;
  resposta: unknown;
  erro: string | null;
}

// POST ao webhook n8n com timeout de 60s. Não lança — devolve resultado.
export async function enviarWebhook(
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
