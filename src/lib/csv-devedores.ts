// Helpers para importação em massa de devedores via planilha CSV.
//
// Fluxo atual:
//   1) Lê o CSV e extrai pares (cod_credor, cod_devedor) — extrairCodigosDoCsv
//   2) Para cada par, chama a Cedrus em paralelo (lib/cedrus.ts)
//   3) Transforma cada resposta em CandidatoDevedor — candidatoDeDevedorCedrus
//   4) Insere em lote via useImportarDevedores
//
// O CSV do Stival traz SALDO/EMAIL/FONE que muitas vezes estão
// desatualizados; usamos só os códigos para buscar dados frescos.

import type { DevedorNormalizado, Instituicao } from "./types";

export interface CandidatoDevedor {
  cod_credor: string;
  cod_devedor: string;
  cpf: string;
  nome_devedor: string;
  primeiro_nome: string;
  tratamento: "Sr." | "Sra.";
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
  acordo_anterior: "sim" | "nao";
  dado_adicional: string | null;
}

// =========================================================
// 1) Extração de códigos do CSV
// =========================================================

export interface CodigoExtraido {
  linha: number; // 1-based, depois do header
  cod_credor: string;
  cod_devedor: string;
  // Categoria do CSV — preservada porque a Cedrus muitas vezes não retorna
  // esse campo e é informação útil pro operador (FALECIDO, ARQUIVADO etc.)
  categoria_csv: string | null;
}

export interface LinhaInvalida {
  linha: number;
  nome: string;
  motivos: string[];
}

export interface ExtracaoResultado {
  codigos: CodigoExtraido[];
  invalidos: LinhaInvalida[];
}

const NOMES_CREDOR = ["credor", "cod_credor", "codigo_credor"];
const NOMES_COD_DEVEDOR = ["cod_devedor", "codigo_devedor"];
const NOMES_NOME = ["nome_devedor", "nome", "devedor"];
const NOMES_CATEGORIA = ["categoria"];

function pegar(
  linha: Record<string, string>,
  candidatos: string[]
): string {
  for (const c of candidatos) {
    if (c in linha && linha[c]) return linha[c];
  }
  return "";
}

export function extrairCodigosDoCsv(
  linhasCsv: Record<string, string>[]
): ExtracaoResultado {
  const codigos: CodigoExtraido[] = [];
  const invalidos: LinhaInvalida[] = [];

  linhasCsv.forEach((linha, idx) => {
    const numLinha = idx + 2;
    const codCredor = pegar(linha, NOMES_CREDOR).trim();
    const codDevedor = pegar(linha, NOMES_COD_DEVEDOR).trim();
    const nome = pegar(linha, NOMES_NOME).trim();
    const categoria = pegar(linha, NOMES_CATEGORIA).trim();

    const motivos: string[] = [];
    if (!codCredor) motivos.push("Sem CREDOR");
    if (!codDevedor) motivos.push("Sem COD_DEVEDOR");

    if (motivos.length > 0) {
      invalidos.push({
        linha: numLinha,
        nome: nome || "(sem nome)",
        motivos,
      });
      return;
    }

    codigos.push({
      linha: numLinha,
      cod_credor: codCredor,
      cod_devedor: codDevedor,
      categoria_csv: categoria || null,
    });
  });

  return { codigos, invalidos };
}

// =========================================================
// 2) Transformação de devedor da Cedrus em candidato para INSERT
// =========================================================

export interface TransformResultado {
  validos: CandidatoDevedor[];
  invalidos: {
    cod_credor: string;
    cod_devedor: string;
    nome: string;
    motivos: string[];
  }[];
}

export function transformarRespostasCedrus(
  recebidos: Array<{
    cod_credor: string;
    cod_devedor: string;
    categoria_csv: string | null;
    devedor: DevedorNormalizado;
  }>,
  instituicoes: Instituicao[]
): TransformResultado {
  const mapaInst = new Map<string, string>(
    instituicoes
      .filter((i) => i.ativo !== false)
      .map((i) => [i.cod_credor.trim(), i.nome])
  );

  const validos: CandidatoDevedor[] = [];
  const invalidos: TransformResultado["invalidos"] = [];

  for (const item of recebidos) {
    const d = item.devedor;
    const motivos: string[] = [];

    const cpf = (d.cpf ?? "").replace(/\D/g, "");
    if (cpf.length !== 11) {
      motivos.push(
        cpf ? `CPF inválido (${cpf.length} dígitos)` : "Sem CPF"
      );
    }
    if (!d.nome_devedor?.trim()) motivos.push("Sem nome");
    if (!d.telefone) motivos.push("Sem telefone celular válido");

    const codCredorResolvido = d.cod_credor ?? item.cod_credor;
    const nomeInst = codCredorResolvido
      ? mapaInst.get(codCredorResolvido.trim())
      : undefined;
    if (!nomeInst) {
      motivos.push(
        `Credor ${codCredorResolvido} não cadastrado em Instituições`
      );
    }

    if (motivos.length > 0) {
      invalidos.push({
        cod_credor: item.cod_credor,
        cod_devedor: item.cod_devedor,
        nome: d.nome_devedor || "(sem nome)",
        motivos,
      });
      continue;
    }

    const partesDado: string[] = [];
    if (item.categoria_csv) {
      partesDado.push(`Categoria: ${item.categoria_csv}`);
    }
    if (d.dado_adicional) {
      partesDado.push(d.dado_adicional);
    }

    const primeiroNome =
      (d.nome_devedor ?? "").trim().split(/\s+/)[0] ?? "";
    const tratamento: "Sr." | "Sra." = /a$/i.test(primeiroNome)
      ? "Sra."
      : "Sr.";

    validos.push({
      cod_credor: codCredorResolvido ?? "",
      cod_devedor: d.cod_devedor ?? item.cod_devedor,
      cpf,
      nome_devedor: d.nome_devedor.trim(),
      primeiro_nome: primeiroNome,
      tratamento,
      email: d.email,
      telefone: d.telefone,
      telefone_2: d.telefone_2,
      telefone_3: d.telefone_3,
      endereco: d.endereco,
      bairro: d.bairro,
      cidade: d.cidade,
      estado: d.estado,
      cep: d.cep,
      instituicao: nomeInst as string,
      nome_aluno: d.nome_aluno || null,
      valor_original: d.valor_original,
      valor_atualizado: d.valor_atualizado,
      qtd_parcelas_aberto: d.qtd_parcelas_aberto,
      ano_inicial_dividas: d.ano_inicial_dividas,
      ano_final_dividas: d.ano_final_dividas,
      acordo_anterior: d.acordo_anterior ?? "nao",
      dado_adicional: partesDado.length > 0 ? partesDado.join(" · ") : null,
    });
  }

  return { validos, invalidos };
}
