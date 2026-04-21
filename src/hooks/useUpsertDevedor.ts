// Mutations para salvar devedor e cadastrar instituição on-the-fly.
// Upsert por CPF: preserva campos editados (nome, tratamento, status,
// campos de acordo, observações) quando a linha já existe.
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import type { Devedor } from "@/lib/types";

// Campos que a importação pode sobrescrever com segurança.
// (endereço, email, telefones, valores agregados, etc.)
// Campos preservados não aparecem aqui: nome_devedor, tratamento,
// status_negociacao, observacoes_negociacao, acordo_*, motivo_escalonamento,
// operador_responsavel, tentativas_contato, data_primeiro_disparo,
// data_ultimo_contato.
export type CamposImportaveis = Pick<
  Devedor,
  | "id_devedor"
  | "cod_credor"
  | "cod_devedor"
  | "cpf"
  | "nome_devedor"
  | "primeiro_nome"
  | "tratamento"
  | "email"
  | "telefone"
  | "telefone_2"
  | "telefone_3"
  | "endereco"
  | "bairro"
  | "cidade"
  | "estado"
  | "cep"
  | "instituicao"
  | "nome_aluno"
  | "valor_original"
  | "valor_atualizado"
  | "qtd_parcelas_aberto"
  | "ano_inicial_dividas"
  | "ano_final_dividas"
  | "acordo_anterior"
  | "dado_adicional"
>;

export interface UpsertDevedorInput extends Partial<CamposImportaveis> {
  cpf: string;
  nome_devedor: string;
  telefone: string;
  instituicao: string;
}

/**
 * Faz UPSERT na fran_devedores:
 * - Se CPF não existe: INSERT completo com status_negociacao='pendente'.
 * - Se existe: UPDATE apenas dos campos "importáveis" (preserva edições
 *   humanas/da Fran). Campos recebidos como undefined são ignorados.
 */
async function upsertDevedor(input: UpsertDevedorInput): Promise<Devedor> {
  const cpfLimpo = input.cpf.replace(/\D/g, "");

  // Verifica existência
  const { data: existente, error: findErr } = await supabase
    .from("fran_devedores")
    .select("id")
    .eq("cpf", cpfLimpo)
    .maybeSingle();

  if (findErr) throw findErr;

  // Campos que podem ser atualizados na importação
  const camposImportaveis: Record<string, unknown> = {};
  const keys: (keyof CamposImportaveis)[] = [
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
  for (const key of keys) {
    if (input[key] !== undefined) camposImportaveis[key] = input[key];
  }

  if (existente) {
    // UPDATE preservando campos editados
    const { data, error } = await supabase
      .from("fran_devedores")
      .update(camposImportaveis)
      .eq("id", existente.id)
      .select()
      .single();
    if (error) throw error;
    return data as Devedor;
  }

  // INSERT novo registro com defaults
  const novo = {
    ...camposImportaveis,
    cpf: cpfLimpo,
    status_negociacao: "pendente",
    tentativas_contato: 0,
    status_judicial: "extrajudicial",
    tem_fiador: "nao",
  };
  const { data, error } = await supabase
    .from("fran_devedores")
    .insert(novo)
    .select()
    .single();
  if (error) throw error;
  return data as Devedor;
}

export function useUpsertDevedor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: upsertDevedor,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["devedores"] });
      queryClient.invalidateQueries({ queryKey: ["kpis"] });
    },
  });
}

/**
 * Garante que uma instituição exista. Se não existe, cria.
 * Retorna o nome usado (seja o existente ou o recém-criado).
 */
export async function garantirInstituicao(
  codCredor: string,
  nome: string
): Promise<string> {
  if (!codCredor || !nome) return nome;

  const { data: existente, error: findErr } = await supabase
    .from("fran_instituicoes")
    .select("nome")
    .eq("cod_credor", codCredor)
    .maybeSingle();

  if (findErr) throw findErr;
  if (existente) return existente.nome as string;

  const { data, error } = await supabase
    .from("fran_instituicoes")
    .insert({ cod_credor: codCredor, nome, ativo: true })
    .select("nome")
    .single();

  if (error) throw error;
  return (data as { nome: string }).nome;
}
