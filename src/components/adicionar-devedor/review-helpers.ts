// Helpers para o modal de revisão de devedor.
import type { DevedorNormalizado } from "@/lib/types";

// Heurística simples: se o primeiro nome termina em "a", sugere Sra.
// Cobre a maioria dos casos brasileiros; operador pode corrigir na revisão.
export function sugerirTratamento(nomeCompleto: string): "Sr." | "Sra." {
  const primeiro = (nomeCompleto ?? "").trim().split(/\s+/)[0] ?? "";
  if (!primeiro) return "Sr.";
  return /a$/i.test(primeiro) ? "Sra." : "Sr.";
}

export function extrairPrimeiroNome(nomeCompleto: string): string {
  return (nomeCompleto ?? "").trim().split(/\s+/)[0] ?? "";
}

// Formulário de revisão — estado controlado.
// Difere do DevedorNormalizado em que tratamento, primeiro_nome e
// instituicao são editáveis e obrigatórios na validação final.
export interface DevedorReviewForm {
  // identificação Cedrus (read-only após busca)
  id_devedor: string | null;
  cod_credor: string | null;
  cod_devedor: string | null;

  // identificação pessoal
  cpf: string;
  nome_devedor: string;
  primeiro_nome: string;
  tratamento: "Sr." | "Sra.";
  email: string;

  // telefones
  telefone: string;
  telefone_2: string;
  telefone_3: string;

  // endereço
  endereco: string;
  bairro: string;
  cidade: string;
  estado: string;
  cep: string;

  // instituição
  instituicao: string;

  // info do aluno
  nome_aluno: string;

  // agregados
  valor_original: number | null;
  valor_atualizado: number | null;
  qtd_parcelas_aberto: number | null;
  ano_inicial_dividas: number | null;
  ano_final_dividas: number | null;

  // flags
  acordo_anterior: "sim" | "nao";
  categoria: string | null;
  dado_adicional: string;
}

export function formFromNormalizado(
  d: DevedorNormalizado,
  instituicaoSugerida?: string
): DevedorReviewForm {
  const primeiro = extrairPrimeiroNome(d.nome_devedor);
  return {
    id_devedor: d.id_devedor,
    cod_credor: d.cod_credor,
    cod_devedor: d.cod_devedor,

    cpf: d.cpf ?? "",
    nome_devedor: d.nome_devedor ?? "",
    primeiro_nome: primeiro,
    tratamento: sugerirTratamento(d.nome_devedor),
    email: d.email ?? "",

    telefone: d.telefone ?? "",
    telefone_2: d.telefone_2 ?? "",
    telefone_3: d.telefone_3 ?? "",

    endereco: d.endereco ?? "",
    bairro: d.bairro ?? "",
    cidade: d.cidade ?? "",
    estado: d.estado ?? "",
    cep: d.cep ?? "",

    instituicao: instituicaoSugerida ?? "",

    nome_aluno: d.nome_aluno ?? "",

    valor_original: d.valor_original,
    valor_atualizado: d.valor_atualizado,
    qtd_parcelas_aberto: d.qtd_parcelas_aberto,
    ano_inicial_dividas: d.ano_inicial_dividas,
    ano_final_dividas: d.ano_final_dividas,

    acordo_anterior: d.acordo_anterior,
    categoria: d.categoria,
    dado_adicional: d.dado_adicional ?? "",
  };
}

export function formVazio(): DevedorReviewForm {
  return {
    id_devedor: null,
    cod_credor: null,
    cod_devedor: null,

    cpf: "",
    nome_devedor: "",
    primeiro_nome: "",
    tratamento: "Sr.",
    email: "",

    telefone: "",
    telefone_2: "",
    telefone_3: "",

    endereco: "",
    bairro: "",
    cidade: "",
    estado: "",
    cep: "",

    instituicao: "",

    nome_aluno: "",

    valor_original: null,
    valor_atualizado: null,
    qtd_parcelas_aberto: null,
    ano_inicial_dividas: null,
    ano_final_dividas: null,

    acordo_anterior: "nao",
    categoria: null,
    dado_adicional: "",
  };
}

export interface ValidacaoResult {
  valido: boolean;
  erros: Partial<Record<keyof DevedorReviewForm, string>>;
}

export function validarForm(form: DevedorReviewForm): ValidacaoResult {
  const erros: ValidacaoResult["erros"] = {};

  const cpfDigitos = form.cpf.replace(/\D/g, "");
  if (!cpfDigitos) erros.cpf = "CPF obrigatório";
  else if (cpfDigitos.length !== 11) erros.cpf = "CPF deve ter 11 dígitos";

  if (!form.nome_devedor.trim()) erros.nome_devedor = "Nome obrigatório";

  const telDigitos = form.telefone.replace(/\D/g, "");
  if (!telDigitos) erros.telefone = "Telefone obrigatório";
  else if (telDigitos.length < 12 || telDigitos.length > 13)
    erros.telefone = "Telefone inválido (esperado 12-13 dígitos com 55)";

  if (!form.instituicao.trim())
    erros.instituicao = "Instituição obrigatória";

  return { valido: Object.keys(erros).length === 0, erros };
}
