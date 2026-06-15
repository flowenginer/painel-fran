// Período do filtro de data das Conversas. Trabalha no fuso local do
// navegador (operadoras no Brasil) — intuitivo e sem malabarismo de TZ.

export type Periodo =
  | { tipo: "todas" }
  | { tipo: "hoje" }
  | { tipo: "ontem" }
  | { tipo: "semana" }
  | { tipo: "custom"; de: string; ate: string }; // yyyy-mm-dd

const DIA = 86_400_000;

function inicioDeHoje(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function inicioDaSemana(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  // Semana começa na segunda-feira.
  const diaSemana = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - diaSemana);
  return d.getTime();
}

/** Intervalo [inicio, fim] em epoch ms (inclusivo). null = sem limite. */
export function intervaloPeriodo(p: Periodo): {
  inicio: number | null;
  fim: number | null;
} {
  switch (p.tipo) {
    case "todas":
      return { inicio: null, fim: null };
    case "hoje": {
      const i = inicioDeHoje();
      return { inicio: i, fim: i + DIA - 1 };
    }
    case "ontem": {
      const i = inicioDeHoje();
      return { inicio: i - DIA, fim: i - 1 };
    }
    case "semana":
      return { inicio: inicioDaSemana(), fim: Date.now() };
    case "custom": {
      const de = p.de ? new Date(`${p.de}T00:00:00`).getTime() : null;
      const ate = p.ate ? new Date(`${p.ate}T23:59:59.999`).getTime() : null;
      return { inicio: de, fim: ate };
    }
  }
}

/** A mensagem (created_at ISO) cai no período? */
export function dentroDoPeriodo(
  iso: string | null | undefined,
  p: Periodo
): boolean {
  if (p.tipo === "todas") return true;
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return false;
  const { inicio, fim } = intervaloPeriodo(p);
  if (inicio != null && t < inicio) return false;
  if (fim != null && t > fim) return false;
  return true;
}

/** dd/mm — para o rótulo do período personalizado. */
function ddmm(yyyymmdd: string): string {
  const [, m, d] = yyyymmdd.split("-");
  return d && m ? `${d}/${m}` : yyyymmdd;
}

/** Rótulo curto do período (para o botão). */
export function rotuloPeriodo(p: Periodo): string {
  switch (p.tipo) {
    case "todas":
      return "Todas as datas";
    case "hoje":
      return "Hoje";
    case "ontem":
      return "Ontem";
    case "semana":
      return "Esta semana";
    case "custom":
      if (p.de && p.ate) return `${ddmm(p.de)}–${ddmm(p.ate)}`;
      if (p.de) return `A partir de ${ddmm(p.de)}`;
      if (p.ate) return `Até ${ddmm(p.ate)}`;
      return "Período personalizado";
  }
}
