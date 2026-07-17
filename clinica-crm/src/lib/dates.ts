// Helpers de data/hora no fuso de São Paulo para o inbox.

const TZ = "America/Sao_Paulo";

// Hora curta "14:32".
export function horaCurta(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  });
}

// Chave do dia (YYYY-MM-DD) no fuso de SP, para agrupar mensagens.
export function diaSP(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-CA", { timeZone: TZ }); // en-CA => YYYY-MM-DD
}

// Rótulo do dia: "Hoje", "Ontem" ou data por extenso curta.
export function rotuloDia(iso: string | null | undefined): string {
  if (!iso) return "";
  const dia = diaSP(iso);
  const hoje = diaSP(new Date().toISOString());
  const ontemDate = new Date();
  ontemDate.setDate(ontemDate.getDate() - 1);
  const ontem = diaSP(ontemDate.toISOString());
  if (dia === hoje) return "Hoje";
  if (dia === ontem) return "Ontem";
  const d = new Date(iso!);
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: TZ,
  });
}

// Duração restante da janela de 24h ("2h 15m", "45m" ou "" se expirada).
export function duracaoRestante(
  expiraIso: string | null | undefined,
): string {
  if (!expiraIso) return "";
  const expira = new Date(expiraIso).getTime();
  if (Number.isNaN(expira)) return "";
  const restanteMs = expira - Date.now();
  if (restanteMs <= 0) return "";
  const totalMin = Math.floor(restanteMs / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function janelaAberta(expiraIso: string | null | undefined): boolean {
  if (!expiraIso) return false;
  const expira = new Date(expiraIso).getTime();
  return !Number.isNaN(expira) && Date.now() < expira;
}
