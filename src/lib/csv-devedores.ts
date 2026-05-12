// Mapeamento de planilha CSV de devedores (formato Cedrus) para o schema
// da fran_devedores. Replica no frontend a lógica de normalização de
// telefones da Edge Function cedrus-buscar/telefones.ts.
//
// Colunas esperadas (case-insensitive):
//   CREDOR, COD_DEVEDOR, NOME_DEVEDOR, CNPJ_CPF, CATEGORIA, EMAIL,
//   DT_VENCIMENTO, SALDO, FONE_1, FONE_2, ..., FONE_10
// (demais colunas são ignoradas).

import { parseBRL } from "./formatters";
import type { Instituicao } from "./types";

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
  instituicao: string;
  valor_original: number | null;
  valor_atualizado: number | null;
  ano_inicial_dividas: number | null;
  ano_final_dividas: number | null;
  acordo_anterior: "nao";
  dado_adicional: string | null;
}

export interface InvalidoDevedor {
  linha: number; // índice 1-based da linha no CSV (depois do header)
  cod_credor: string;
  cod_devedor: string;
  cpf: string;
  nome: string;
  motivos: string[];
}

export interface MapeamentoResultado {
  validos: CandidatoDevedor[];
  invalidos: InvalidoDevedor[];
  /** cod_credor encontrado nas linhas mas não cadastrado em fran_instituicoes. */
  credoresNaoMapeados: string[];
}

// ------- helpers -------

function primeiroNomeDe(nomeCompleto: string): string {
  return (nomeCompleto ?? "").trim().split(/\s+/)[0] ?? "";
}

function sugerirTratamento(nomeCompleto: string): "Sr." | "Sra." {
  const primeiro = primeiroNomeDe(nomeCompleto);
  if (!primeiro) return "Sr.";
  return /a$/i.test(primeiro) ? "Sra." : "Sr.";
}

function primeiroEmail(s: string | undefined): string | null {
  if (!s) return null;
  const partes = s
    .split(/[;,]/)
    .map((p) => p.trim())
    .filter((p) => p.includes("@"));
  return partes[0] ?? null;
}

// dd/mm/yyyy → year (number) ou null
function anoDeDataBR(dt: string | undefined): number | null {
  if (!dt) return null;
  const m = dt.match(/^\s*\d{1,2}\/\d{1,2}\/(\d{4})/);
  return m ? Number(m[1]) : null;
}

interface TelClass {
  numero: string; // com 55 na frente
  celular: boolean;
}

function classificarTelefone(raw: string): TelClass | null {
  // Descarta valores em notação científica do Excel (ex: "6,30E+11")
  if (/e\+/i.test(raw)) return null;
  const digitos = raw.replace(/\D/g, "");
  if (!digitos) return null;

  let nacional = digitos;
  if (digitos.length === 13 && digitos.startsWith("55")) {
    nacional = digitos.slice(2);
  } else if (digitos.length === 12 && digitos.startsWith("55")) {
    nacional = digitos.slice(2);
  }

  if (nacional.length < 10 || nacional.length > 11) return null;

  let celular = false;
  if (nacional.length === 11) {
    if (nacional[2] !== "9") return null;
    celular = true;
  }
  return { numero: `55${nacional}`, celular };
}

function normalizarTelefones(brutos: string[]): {
  telefone: string;
  telefone_2: string | null;
  telefone_3: string | null;
} {
  const classificados: TelClass[] = [];
  const seen = new Set<string>();
  for (const raw of brutos) {
    if (!raw) continue;
    const c = classificarTelefone(raw);
    if (!c) continue;
    if (seen.has(c.numero)) continue;
    seen.add(c.numero);
    classificados.push(c);
  }
  classificados.sort((a, b) => Number(b.celular) - Number(a.celular));
  const [p1, p2, p3] = classificados;
  return {
    telefone: p1?.numero ?? "",
    telefone_2: p2?.numero ?? null,
    telefone_3: p3?.numero ?? null,
  };
}

// ------- mapping principal -------

const NOMES_CREDOR = ["credor", "cod_credor", "codigo_credor"];
const NOMES_COD_DEVEDOR = ["cod_devedor", "codigo_devedor"];
const NOMES_NOME = ["nome_devedor", "nome", "devedor"];
const NOMES_CPF = ["cnpj_cpf", "cpf", "cnpj"];
const NOMES_EMAIL = ["email"];
const NOMES_VENCIMENTO = ["dt_vencimento", "vencimento", "data_vencimento"];
const NOMES_SALDO = ["saldo", "valor", "valor_atualizado"];
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

export function mapearCsvParaCandidatos(
  linhasCsv: Record<string, string>[],
  instituicoes: Instituicao[]
): MapeamentoResultado {
  // Mapa cod_credor → nome da instituição
  const mapaInst = new Map<string, string>(
    instituicoes
      .filter((i) => i.ativo !== false)
      .map((i) => [i.cod_credor.trim(), i.nome])
  );

  const validos: CandidatoDevedor[] = [];
  const invalidos: InvalidoDevedor[] = [];
  const credoresAusentes = new Set<string>();

  // Header pra detecção dos campos FONE_1..FONE_N (qualquer quantidade)
  const headersDaLinha = linhasCsv[0] ? Object.keys(linhasCsv[0]) : [];
  const colunasFone = headersDaLinha
    .filter((h) => /^fone_?\d+$/i.test(h))
    .sort((a, b) => {
      const na = Number(a.match(/\d+/)?.[0] ?? 0);
      const nb = Number(b.match(/\d+/)?.[0] ?? 0);
      return na - nb;
    });

  linhasCsv.forEach((linha, idx) => {
    const numLinha = idx + 2; // +1 porque é 0-based, +1 porque header é a linha 1
    const motivos: string[] = [];

    const codCredor = pegar(linha, NOMES_CREDOR).trim();
    const codDevedor = pegar(linha, NOMES_COD_DEVEDOR).trim();
    const nomeBruto = pegar(linha, NOMES_NOME).trim();
    const cpfBruto = pegar(linha, NOMES_CPF).replace(/\D/g, "");
    const emailBruto = pegar(linha, NOMES_EMAIL);
    const saldoBruto = pegar(linha, NOMES_SALDO);
    const vencimentoBruto = pegar(linha, NOMES_VENCIMENTO);
    const categoriaBruta = pegar(linha, NOMES_CATEGORIA).trim();

    const telefonesBrutos = colunasFone.map((c) => linha[c] ?? "");
    const tels = normalizarTelefones(telefonesBrutos);

    // Validações
    if (cpfBruto.length !== 11) {
      motivos.push(
        cpfBruto
          ? `CPF inválido (${cpfBruto.length} dígitos)`
          : "Sem CPF"
      );
    }
    if (!nomeBruto) motivos.push("Sem nome");
    if (!tels.telefone) motivos.push("Sem telefone celular válido");

    const nomeInst = codCredor ? mapaInst.get(codCredor) : undefined;
    if (!codCredor) {
      motivos.push("Sem credor");
    } else if (!nomeInst) {
      motivos.push(`Credor ${codCredor} não cadastrado em Instituições`);
      credoresAusentes.add(codCredor);
    }

    if (motivos.length > 0) {
      invalidos.push({
        linha: numLinha,
        cod_credor: codCredor,
        cod_devedor: codDevedor,
        cpf: cpfBruto,
        nome: nomeBruto || "(sem nome)",
        motivos,
      });
      return;
    }

    const valor = parseBRL(saldoBruto);
    const anoVenc = anoDeDataBR(vencimentoBruto);

    // Categoria + email (quando tem) → guardamos contexto em dado_adicional
    const partesDado: string[] = [];
    if (categoriaBruta) partesDado.push(`Categoria: ${categoriaBruta}`);

    validos.push({
      cod_credor: codCredor,
      cod_devedor: codDevedor,
      cpf: cpfBruto,
      nome_devedor: nomeBruto,
      primeiro_nome: primeiroNomeDe(nomeBruto),
      tratamento: sugerirTratamento(nomeBruto),
      email: primeiroEmail(emailBruto),
      telefone: tels.telefone,
      telefone_2: tels.telefone_2,
      telefone_3: tels.telefone_3,
      instituicao: nomeInst as string,
      valor_original: valor,
      valor_atualizado: valor,
      ano_inicial_dividas: anoVenc,
      ano_final_dividas: anoVenc,
      acordo_anterior: "nao",
      dado_adicional: partesDado.length > 0 ? partesDado.join(" · ") : null,
    });
  });

  return {
    validos,
    invalidos,
    credoresNaoMapeados: Array.from(credoresAusentes).sort(),
  };
}
