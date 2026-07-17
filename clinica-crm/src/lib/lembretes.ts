// Regras de lembrete (config). RLS por unidade. A fila de lembretes é gerada
// pelo gatilho no banco e enviada pela Edge processar-lembretes (cron).
import { supabase } from "@/lib/supabase";
import type { LembreteConfig } from "@/lib/types";

export async function listarLembretesConfig(): Promise<LembreteConfig[]> {
  const { data, error } = await supabase
    .from("lembretes_config")
    .select("id,unidade_id,nome,meses,canal_id,mensagem,ativo,created_at,updated_at")
    .order("meses", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as LembreteConfig[];
}

export interface LembreteConfigPatch {
  canal_id?: number | null;
  mensagem?: string;
  ativo?: boolean;
}

export async function atualizarLembreteConfig(
  id: number,
  patch: LembreteConfigPatch,
): Promise<void> {
  const linha: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.canal_id !== undefined) linha.canal_id = patch.canal_id;
  if (patch.mensagem !== undefined) linha.mensagem = patch.mensagem;
  if (patch.ativo !== undefined) linha.ativo = patch.ativo;

  const { error } = await supabase
    .from("lembretes_config")
    .update(linha)
    .eq("id", id);
  if (error) throw new Error(error.message);
}
