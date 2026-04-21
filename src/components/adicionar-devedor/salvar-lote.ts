// Lógica de salvamento em lote: para cada devedor normalizado, verifica
// se tem todos os campos obrigatórios; se sim, salva direto via UPSERT;
// se não, coloca na fila de revisão manual.
import { supabase } from "@/lib/supabase";
import type { DevedorNormalizado, Instituicao } from "@/lib/types";
import {
  extrairPrimeiroNome,
  sugerirTratamento,
} from "./review-helpers";

export interface SalvarLoteDevedor {
  normalizado: DevedorNormalizado;
  instituicao: string; // resolvida a partir de fran_instituicoes (ou vazia)
}

export type ResultadoItem =
  | { status: "salvo"; cpf: string; nome: string }
  | { status: "revisao"; cpf: string; nome: string; motivo: string }
  | { status: "erro"; cpf: string; nome: string; erro: string };

export interface ResumoLote {
  salvos: number;
  revisao: number;
  erros: number;
  items: ResultadoItem[];
}

// Verifica se um devedor normalizado tem todos os campos obrigatórios
// para ser salvo direto. Retorna string com o motivo se falta algo.
function motivoRevisao(
  d: DevedorNormalizado,
  instituicao: string
): string | null {
  const cpfDigitos = (d.cpf ?? "").replace(/\D/g, "");
  if (cpfDigitos.length !== 11) return "CPF inválido";
  if (!d.nome_devedor?.trim()) return "Sem nome";
  const telDigitos = (d.telefone ?? "").replace(/\D/g, "");
  if (telDigitos.length < 12 || telDigitos.length > 13)
    return "Sem telefone válido";
  if (!instituicao?.trim()) return "Instituição não mapeada";
  return null;
}

// Converte normalizado → payload de UPSERT completo.
function toPayload(
  d: DevedorNormalizado,
  instituicao: string
): Record<string, unknown> {
  return {
    id_devedor: d.id_devedor,
    cod_credor: d.cod_credor,
    cod_devedor: d.cod_devedor,
    cpf: (d.cpf ?? "").replace(/\D/g, ""),
    nome_devedor: d.nome_devedor.trim(),
    primeiro_nome: extrairPrimeiroNome(d.nome_devedor),
    tratamento: sugerirTratamento(d.nome_devedor),
    email: d.email,
    telefone: d.telefone,
    telefone_2: d.telefone_2,
    telefone_3: d.telefone_3,
    endereco: d.endereco,
    bairro: d.bairro,
    cidade: d.cidade,
    estado: d.estado,
    cep: (d.cep ?? "").replace(/\D/g, "") || null,
    instituicao,
    nome_aluno: d.nome_aluno || null,
    valor_original: d.valor_original,
    valor_atualizado: d.valor_atualizado,
    qtd_parcelas_aberto: d.qtd_parcelas_aberto,
    ano_inicial_dividas: d.ano_inicial_dividas,
    ano_final_dividas: d.ano_final_dividas,
    acordo_anterior: d.acordo_anterior,
    dado_adicional: d.dado_adicional,
  };
}

// Campos preservados em update (não sobrescrevemos edições humanas/Fran).
const CAMPOS_UPDATE = [
  "id_devedor",
  "cod_credor",
  "cod_devedor",
  "nome_devedor",
  "primeiro_nome",
  "tratamento",
  "email",
  "telefone",
  "telefone_2",
  "telefone_3",
  "endereco",
  "bairro",
  "cidade",
  "estado",
  "cep",
  "instituicao",
  "nome_aluno",
  "valor_original",
  "valor_atualizado",
  "qtd_parcelas_aberto",
  "ano_inicial_dividas",
  "ano_final_dividas",
  "acordo_anterior",
  "dado_adicional",
];

async function salvarUm(
  d: DevedorNormalizado,
  instituicao: string
): Promise<ResultadoItem> {
  const cpf = (d.cpf ?? "").replace(/\D/g, "");
  try {
    const { data: existente, error: findErr } = await supabase
      .from("fran_devedores")
      .select("id")
      .eq("cpf", cpf)
      .maybeSingle();
    if (findErr) throw findErr;

    const payload = toPayload(d, instituicao);

    if (existente) {
      const updatePayload: Record<string, unknown> = {};
      for (const k of CAMPOS_UPDATE) {
        updatePayload[k] = payload[k];
      }
      const { error } = await supabase
        .from("fran_devedores")
        .update(updatePayload)
        .eq("id", existente.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("fran_devedores").insert({
        ...payload,
        status_negociacao: "pendente",
        tentativas_contato: 0,
        status_judicial: "extrajudicial",
        tem_fiador: "nao",
      });
      if (error) throw error;
    }

    return { status: "salvo", cpf, nome: d.nome_devedor };
  } catch (err) {
    return {
      status: "erro",
      cpf,
      nome: d.nome_devedor,
      erro: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Processa lote de devedores:
 * - Para cada um, verifica elegibilidade.
 * - Elegíveis: salva direto via UPSERT.
 * - Inelegíveis: retorna com status "revisao" para a UI exibir aviso.
 */
export async function processarLote(
  devedores: DevedorNormalizado[],
  instituicoes: Instituicao[],
  onProgress?: (done: number, total: number) => void
): Promise<ResumoLote> {
  const mapa = new Map(
    instituicoes.map((i) => [i.cod_credor, i.nome] as const)
  );

  const items: ResultadoItem[] = [];
  const total = devedores.length;
  let done = 0;

  for (const d of devedores) {
    const nomeInst = d.cod_credor ? mapa.get(d.cod_credor) ?? "" : "";
    const motivo = motivoRevisao(d, nomeInst);

    if (motivo) {
      items.push({
        status: "revisao",
        cpf: (d.cpf ?? "").replace(/\D/g, ""),
        nome: d.nome_devedor || "—",
        motivo,
      });
    } else {
      items.push(await salvarUm(d, nomeInst));
    }

    done += 1;
    onProgress?.(done, total);
  }

  const salvos = items.filter((i) => i.status === "salvo").length;
  const revisao = items.filter((i) => i.status === "revisao").length;
  const erros = items.filter((i) => i.status === "erro").length;

  return { salvos, revisao, erros, items };
}
