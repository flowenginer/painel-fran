// Extração de nomes de alunos do campo complemento_3 dos títulos Cedrus.
// Regras da seção 7.2 do PRD, refinadas após auditoria do JSON real
// de produção (credor 2168 — Escola M.L.).
//
// Padrões observados no campo complemento_3:
//   - Nomes reais: "MENSALIDADE ABRAAO", "MENSALIDADE CALEBE RAMOS"
//   - Tipos de título (sem nome): "ACORDO", "MENS", "MENS_PRAVC",
//     "MENS_EXTRA", "CHEQUE 3", "EDUCAÇÃO"
//
// A heurística descarta o segundo grupo.

// Remove só quando o prefixo aparece SEGUIDO de uma palavra (que seria
// o nome). "MENSALIDADE JOAO" → "JOAO". "MENS" sozinho → "" (descartado).
const PREFIXOS_NOMEADOS = [
  "MENSALIDADE",
  "MENSALIDADES",
  "CHEQUE",
  "CHEQUES",
  "PARCELAS DE ACORDO",
  "PARCELA DE ACORDO",
];

// Tokens que, sozinhos ou compostos só com códigos, NÃO são nomes.
const STOPWORDS = new Set([
  "ACORDO",
  "MENS",
  "MENSALIDADE",
  "MENSALIDADES",
  "CHEQUE",
  "CHEQUES",
  "NEGOCIACAO",
  "NEGOCIAÇÃO",
  "EDUCACAO",
  "EDUCAÇÃO",
  "MATERIAL",
  "PARCELA",
  "PARCELAS",
  "MULTA",
  "JUROS",
  "CORRECAO",
  "CORREÇÃO",
  "HONORARIOS",
  "HONORÁRIOS",
  "DIVIDA",
  "DÍVIDA",
  "DEBITO",
  "DÉBITO",
  "PRAVC",
  "EXTRA",
  "ORIGINAL",
]);

function removerPrefixosNomeados(s: string): string {
  let resultado = s.trim();
  for (const prefixo of PREFIXOS_NOMEADOS) {
    const re = new RegExp(`^${prefixo}\\s+`, "i");
    resultado = resultado.replace(re, "").trim();
  }
  return resultado;
}

// Um token "parece nome" se tem só letras/acentos e não é stopword.
function tokenPareceNome(tok: string): boolean {
  if (!tok) return false;
  if (!/^[A-Za-zÀ-ÿ]{2,}$/.test(tok)) return false; // só letras, 2+ chars
  if (STOPWORDS.has(tok.toUpperCase())) return false;
  return true;
}

// O valor inteiro parece um nome? Deve ter ao menos 1 token de nome.
function pareceNomeHumano(s: string): boolean {
  if (!s) return false;
  // Contém underscore ou dígitos → é código (MENS_PRAVC, CHEQUE 3)
  if (/[_\d]/.test(s)) return false;

  const tokens = s.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  // Pelo menos UM token precisa ser nome válido
  return tokens.some(tokenPareceNome);
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((palavra) =>
      palavra.length > 0
        ? palavra[0].toUpperCase() + palavra.slice(1)
        : palavra
    )
    .join(" ")
    .trim();
}

export function extrairNomesAlunos(titulos: unknown): string {
  const arr = Array.isArray(titulos) ? titulos : [];
  const conjunto = new Map<string, string>();

  for (const t of arr) {
    if (!t || typeof t !== "object") continue;
    const complemento = (t as { complemento_3?: unknown }).complemento_3;
    if (typeof complemento !== "string") continue;

    const semPrefixo = removerPrefixosNomeados(complemento);
    if (!pareceNomeHumano(semPrefixo)) continue;

    const display = titleCase(semPrefixo);
    const chave = display.toLowerCase();
    if (!conjunto.has(chave)) conjunto.set(chave, display);
  }

  return Array.from(conjunto.values()).join("; ");
}

// Detecta se algum título indica acordo anterior.
// Sinais (qualquer um basta):
//   - complemento_3 contém "ACORDO" (sozinho ou "PARCELAS DE ACORDO")
//   - tipo_titulo contém "Negocia" (ex: "Negociação")
//   - tipo_titulo = "Acordo"
export function detectarAcordoAnterior(titulos: unknown): "sim" | "nao" {
  const arr = Array.isArray(titulos) ? titulos : [];
  for (const t of arr) {
    if (!t || typeof t !== "object") continue;
    const obj = t as Record<string, unknown>;
    const complemento = String(obj.complemento_3 ?? "");
    if (/\bacordo\b/i.test(complemento)) return "sim";
    const tipo = String(obj.tipo_titulo ?? "");
    if (/negocia|acordo/i.test(tipo)) return "sim";
  }
  return "nao";
}
