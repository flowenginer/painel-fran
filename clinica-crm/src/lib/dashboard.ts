// Agregações do Dashboard. RLS por unidade já filtra (admin vê tudo).
import { supabase } from "@/lib/supabase";
import type { StatusFunil } from "@/lib/types";

export interface ResumoDashboard {
  totalLeads: number;
  novos7d: number;
  agendados: number;
  pacientesConvertidos: number;
  conversasAbertas: number;
  conversasNaoLidas: number;
  funil: Record<StatusFunil, number>;
  origens: { campanha: string; total: number }[];
}

const FUNIL_ZERO: Record<StatusFunil, number> = {
  lead_novo: 0,
  em_atendimento: 0,
  agendou: 0,
  compareceu: 0,
  paciente: 0,
  perdido: 0,
};

export async function carregarDashboard(): Promise<ResumoDashboard> {
  const seteDiasAtras = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [pacRes, convRes] = await Promise.all([
    supabase.from("pacientes").select("status_funil,created_at,origem_campanha"),
    supabase.from("conversas").select("nao_lida,status"),
  ]);

  if (pacRes.error) throw new Error(pacRes.error.message);
  if (convRes.error) throw new Error(convRes.error.message);

  const pacientes = (pacRes.data ?? []) as {
    status_funil: StatusFunil;
    created_at: string;
    origem_campanha: string | null;
  }[];
  const conversas = (convRes.data ?? []) as {
    nao_lida: boolean;
    status: string;
  }[];

  const funil = { ...FUNIL_ZERO };
  const origensMap = new Map<string, number>();
  let novos7d = 0;

  for (const p of pacientes) {
    if (p.status_funil in funil) funil[p.status_funil]++;
    if (p.created_at >= seteDiasAtras) novos7d++;
    if (p.origem_campanha) {
      origensMap.set(
        p.origem_campanha,
        (origensMap.get(p.origem_campanha) ?? 0) + 1,
      );
    }
  }

  const origens = [...origensMap.entries()]
    .map(([campanha, total]) => ({ campanha, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);

  return {
    totalLeads: pacientes.length,
    novos7d,
    agendados: funil.agendou,
    pacientesConvertidos: funil.paciente,
    conversasAbertas: conversas.filter((c) => c.status === "aberta").length,
    conversasNaoLidas: conversas.filter((c) => c.nao_lida).length,
    funil,
    origens,
  };
}
