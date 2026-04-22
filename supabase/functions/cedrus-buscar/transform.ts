// Transforma um devedor bruto da API Cedrus em estrutura pré-processada
// pronta para a tela de revisão do painel.
//
// Tratamentos aplicados (seção 4.4 e 7 do PRD):
// - Telefones normalizados + priorização de celular.
// - Valores em formato BR parseados para decimal.
// - Extração de nomes de alunos únicos.
// - Detecção de acordo anterior.
// - Agregações: valor_original, valor_atualizado, qtd_parcelas_aberto,
//   ano_inicial_dividas, ano_final_dividas (apenas títulos status=A).
// - Endereço concatenado (endereço + número + complemento).

import { normalizarTelefones } from "./telefones.ts";
import { parseBRL, parseDataBR } from "./valores.ts";
import { detectarAcordoAnterior, extrairNomesAlunos } from "./alunos.ts";

// Tipo do devedor bruto da API Cedrus.
// A API é flexível; tratamos tudo como unknown e acessamos com segurança.
export type DevedorCedrusBruto = Record<string, unknown>;

// Devedor normalizado que a UI vai receber.
export interface DevedorNormalizado {
  // Identificação Cedrus
  id_devedor: string | null;
  cod_credor: string | null;
  cod_devedor: string | null;

  // Pessoa
  cpf: string | null;
  nome_devedor: string;
  email: string | null;

  // Telefones priorizados (55DDDNNNNNNNN)
  telefone: string;
  telefone_2: string | null;
  telefone_3: string | null;

  // Endereço
  endereco: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  cep: string | null;

  // Informações relacionadas ao aluno/titular
  nome_aluno: string;

  // Agregados dos títulos em aberto
  valor_original: number | null;
  valor_atualizado: number | null;
  qtd_parcelas_aberto: number | null;
  ano_inicial_dividas: number | null;
  ano_final_dividas: number | null;

  // Flags
  acordo_anterior: "sim" | "nao";

  // Categoria pra revisão (ex. COBRANÇA ARQUIVADA)
  categoria: string | null;

  // Referência
  dado_adicional: string | null;
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function somenteDigitos(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const d = s.replace(/\D/g, "");
  return d.length > 0 ? d : null;
}

function concatenarEndereco(b: DevedorCedrusBruto): string | null {
  const partes = [
    str(b.endereco),
    str(b.numero),
    str(b.complemento),
  ].filter(Boolean);
  return partes.length > 0 ? partes.join(", ") : null;
}

// Cedrus pode retornar "email1@x.com;email2@x.com" — pega o primeiro válido.
function primeiroEmail(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const partes = s.split(/[;,]/).map((p) => p.trim()).filter(Boolean);
  return partes[0] ?? null;
}

export function transformarDevedor(
  bruto: DevedorCedrusBruto
): DevedorNormalizado {
  const titulosRaw = bruto.titulos;
  const titulos = Array.isArray(titulosRaw) ? titulosRaw : [];

  // Títulos em aberto: tudo exceto Pago, Cancelado e Suspenso.
  // A API pode retornar "A" (Aberto), "N" (Negociado mas em aberto), vazio,
  // ou outros valores. Auditoria mostrou casos com título sob "N" que ainda
  // precisa ser cobrado — filtrar só por "A" perdia a maior parte da dívida.
  const STATUS_FECHADO = new Set(["P", "C", "S"]);
  const titulosAbertos = titulos.filter((t) => {
    if (!t || typeof t !== "object") return false;
    const status = String(
      (t as Record<string, unknown>).status ?? ""
    )
      .trim()
      .toUpperCase();
    return !STATUS_FECHADO.has(status);
  });

  // Soma valores. Nem todo título tem vl_atualizado preenchido — quando
  // falta, usamos vl_titulo como estimativa para o valor atualizado não
  // ficar menor que o original (caso visto em produção).
  let valorOriginal: number | null = null;
  let valorAtualizado: number | null = null;
  for (const t of titulosAbertos) {
    const obj = t as Record<string, unknown>;
    const vOrig = parseBRL(obj.vl_titulo);
    const vAtu = parseBRL(obj.vl_atualizado) ?? vOrig;
    if (vOrig !== null) valorOriginal = (valorOriginal ?? 0) + vOrig;
    if (vAtu !== null) valorAtualizado = (valorAtualizado ?? 0) + vAtu;
  }

  // Anos (min/max de dt_vencimento)
  let anoMin: number | null = null;
  let anoMax: number | null = null;
  for (const t of titulosAbertos) {
    const obj = t as Record<string, unknown>;
    const data = parseDataBR(obj.dt_vencimento);
    if (!data) continue;
    const ano = data.getFullYear();
    if (anoMin === null || ano < anoMin) anoMin = ano;
    if (anoMax === null || ano > anoMax) anoMax = ano;
  }

  const telefones = normalizarTelefones(bruto.telefones);

  return {
    id_devedor: str(bruto.id_devedor),
    cod_credor: str(bruto.cod_credor),
    cod_devedor: str(bruto.cod_devedor),

    cpf: somenteDigitos(bruto.cnpj_cpf),
    // Cedrus usa "nome"; mantemos fallback em "nome_devedor" por robustez.
    nome_devedor: str(bruto.nome) ?? str(bruto.nome_devedor) ?? "",
    email: primeiroEmail(bruto.email),

    telefone: telefones.telefone,
    telefone_2: telefones.telefone_2,
    telefone_3: telefones.telefone_3,

    endereco: concatenarEndereco(bruto),
    bairro: str(bruto.bairro),
    cidade: str(bruto.cidade),
    estado: str(bruto.estado ?? bruto.uf),
    cep: str(bruto.cep),

    nome_aluno: extrairNomesAlunos(titulos),

    valor_original: valorOriginal,
    valor_atualizado: valorAtualizado,
    qtd_parcelas_aberto: titulosAbertos.length || null,
    ano_inicial_dividas: anoMin,
    ano_final_dividas: anoMax,

    acordo_anterior: detectarAcordoAnterior(titulos),

    categoria: str(bruto.categoria),

    dado_adicional: str(bruto.dado_adicional),
  };
}
