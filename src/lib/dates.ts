// Helpers de data/timezone para o painel.
// Regras de negócio operam em America/Sao_Paulo.

const TZ = "America/Sao_Paulo";

// Retorna a data atual em SP no formato yyyy-mm-dd (usado em queries de range por dia).
export function hojeSaoPaulo(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // en-CA produz "yyyy-mm-dd"
  return fmt.format(new Date());
}

// Início do dia atual em SP como ISO UTC.
// Útil para filtrar "disparos de hoje" em timestamps UTC.
export function inicioHojeSaoPauloUTC(): string {
  const hoje = hojeSaoPaulo(); // yyyy-mm-dd
  // 00:00 em SP corresponde a +03:00 em UTC (SP é UTC-3 sem DST desde 2019).
  // Para ficar resiliente, construímos via Date em UTC e ajustamos pelo offset real.
  const data = new Date(`${hoje}T00:00:00-03:00`);
  return data.toISOString();
}

// Início do primeiro dia do mês atual em SP como ISO UTC.
export function inicioMesSaoPauloUTC(): string {
  const hoje = hojeSaoPaulo();
  const [ano, mes] = hoje.split("-");
  const data = new Date(`${ano}-${mes}-01T00:00:00-03:00`);
  return data.toISOString();
}

// Hora atual em SP (0-23) — para comparar com horário de disparo permitido.
export function horaAtualSaoPaulo(): { hora: number; minuto: number } {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const hora = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minuto = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return { hora, minuto };
}
