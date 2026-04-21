// Extração de nomes de alunos do campo complemento_3 dos títulos Cedrus.
// Regras da seção 7.2 do PRD.
//
// - Remove prefixos genéricos (MENSALIDADE, CHEQUES, PARCELAS DE ACORDO).
// - Remove itens que parecem genéricos (puramente números ou vazios).
// - Normaliza capitalização (Title Case) e retorna únicos com "; " de separador.

const PREFIXOS_GENERICOS = [
  "MENSALIDADE",
  "MENSALIDADES",
  "CHEQUE",
  "CHEQUES",
  "PARCELAS DE ACORDO",
  "PARCELA DE ACORDO",
  "ACORDO",
  "NEGOCIACAO",
  "NEGOCIAÇÃO",
];

function removerPrefixos(s: string): string {
  let resultado = s.trim();
  for (const prefixo of PREFIXOS_GENERICOS) {
    const re = new RegExp(`^${prefixo}\\b[\\s:-]*`, "i");
    resultado = resultado.replace(re, "").trim();
  }
  return resultado;
}

function pareceNome(s: string): boolean {
  if (!s) return false;
  // Precisa ter ao menos uma letra e não ser puramente números
  if (!/[A-Za-zÀ-ÿ]/.test(s)) return false;
  // Descarta se tem só um caractere
  if (s.length < 2) return false;
  return true;
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
  const conjunto = new Map<string, string>(); // chave normalizada → display

  for (const t of arr) {
    if (!t || typeof t !== "object") continue;
    const complemento = (t as { complemento_3?: unknown }).complemento_3;
    if (typeof complemento !== "string") continue;

    const semPrefixo = removerPrefixos(complemento);
    if (!pareceNome(semPrefixo)) continue;

    const display = titleCase(semPrefixo);
    const chave = display.toLowerCase();
    if (!conjunto.has(chave)) conjunto.set(chave, display);
  }

  return Array.from(conjunto.values()).join("; ");
}

// Detecta se algum título indica acordo anterior (complemento_3 com
// "PARCELAS DE ACORDO" ou tipo_titulo = "Negociação").
export function detectarAcordoAnterior(titulos: unknown): "sim" | "nao" {
  const arr = Array.isArray(titulos) ? titulos : [];
  for (const t of arr) {
    if (!t || typeof t !== "object") continue;
    const obj = t as Record<string, unknown>;
    const complemento = String(obj.complemento_3 ?? "");
    if (/parcelas?\s+de\s+acordo/i.test(complemento)) return "sim";
    const tipo = String(obj.tipo_titulo ?? "");
    if (/negocia/i.test(tipo)) return "sim";
  }
  return "nao";
}
