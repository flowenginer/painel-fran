// Converte valores no formato brasileiro ("1.500,00") para número decimal.
// API Cedrus retorna valores como string com vírgula decimal.
export function parseBRL(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;

  const str = String(raw).trim();
  if (!str) return null;

  // Remove espaços e eventual "R$"
  const limpo = str.replace(/[R$\s]/g, "");
  // Remove pontos (milhar) e troca vírgula por ponto
  const normalizado = limpo.replace(/\./g, "").replace(",", ".");
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}

// Parse data em formato brasileiro "dd/mm/yyyy" para Date.
// Retorna null se inválido.
export function parseDataBR(raw: unknown): Date | null {
  if (!raw || typeof raw !== "string") return null;
  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, dia, mes, ano] = match;
  const d = new Date(Number(ano), Number(mes) - 1, Number(dia));
  return Number.isNaN(d.getTime()) ? null : d;
}
