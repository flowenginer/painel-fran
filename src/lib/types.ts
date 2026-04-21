/**
 * Types das tabelas do Supabase (fran_devedores, fran_instituicoes, etc.)
 * Conforme schema definido no PRD v2.
 */

// Status possíveis de negociação de um devedor
export type StatusNegociacao =
  | "pendente"
  | "primeira_msg"
  | "em_negociacao"
  | "acordo_aceito"
  | "escalado"
  | "sem_acordo"
  | "aguardando_retorno";

// Devedor (tabela fran_devedores - schema completo, existe no banco)
export interface Devedor {
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
  valor_correcao: number | null;
  valor_juros: number | null;
  valor_multa: number | null;
  valor_tarifa_protesto: number | null;
  valor_honorarios: number | null;
  valor_com_desconto: number | null;
  valor_abatido: number | null;
  percentual_desconto: number | null;
  entrada_sugerida: number | null;
  entrada_minima: number | null;
  parcelas_sugeridas: number | null;
  valor_parcela_sugerida: number | null;
  qtd_parcelas_aberto: number | null;
  ano_inicial_dividas: number | null;
  ano_final_dividas: number | null;
  tem_fiador: string | null;
  nome_fiador: string | null;
  status_judicial: string | null;
  acordo_anterior: string | null;
  dado_adicional: string | null;
  status_negociacao: StatusNegociacao | null;
  motivo_escalonamento: string | null;
  observacoes_negociacao: string | null;
  acordo_valor_total: number | null;
  acordo_valor_entrada: number | null;
  acordo_entrada_parcelas: number | null;
  acordo_num_parcelas: number | null;
  acordo_valor_parcela: number | null;
  acordo_dia_vencimento: number | null;
  acordo_data_aceite: string | null;
  campanha: string | null;
  operador_responsavel: string | null;
  data_primeiro_disparo: string | null;
  data_ultimo_contato: string | null;
  tentativas_contato: number | null;
  created_at: string | null;
  updated_at: string | null;
}

// Instituição (tabela fran_instituicoes - nova)
export interface Instituicao {
  id: number;
  cod_credor: string;
  nome: string;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

// Config (tabela fran_config - nova)
export interface Config {
  id: number;
  chave: string;
  valor: string | null;
  descricao: string | null;
  updated_at: string;
}

// Devedor normalizado retornado pela Edge Function cedrus-buscar
// (ver supabase/functions/cedrus-buscar/transform.ts).
// Representa um devedor pré-processado pronto para a tela de revisão.
export interface DevedorNormalizado {
  id_devedor: string | null;
  cod_credor: string | null;
  cod_devedor: string | null;
  cpf: string | null;
  nome_devedor: string;
  email: string | null;
  telefone: string;
  telefone_2: string | null;
  telefone_3: string | null;
  endereco: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  cep: string | null;
  nome_aluno: string;
  valor_original: number | null;
  valor_atualizado: number | null;
  qtd_parcelas_aberto: number | null;
  ano_inicial_dividas: number | null;
  ano_final_dividas: number | null;
  acordo_anterior: "sim" | "nao";
  categoria: string | null;
  dado_adicional: string | null;
}

// Disparo (tabela fran_disparos - nova)
export interface Disparo {
  id: number;
  devedor_id: number | null;
  telefone: string;
  data_disparo: string;
  status_envio: "enviado" | "erro";
  erro_detalhes: string | null;
  webhook_response: Record<string, unknown> | null;
  campanha: string | null;
  usuario_id: string | null;
  created_at: string;
}
