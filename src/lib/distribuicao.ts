// Cliente das RPCs de configuração da distribuição (Fase 6). Admin-only —
// a checagem é feita no banco (fran_is_admin dentro das funções).
import { supabase } from "./supabase";

export type DistribuicaoMetodo = "round_robin" | "ponderado";

export interface DistribuicaoUsuario {
  id: string;
  nome: string | null;
  email: string | null;
  role: string;
  ativo: boolean;
  recebe_distribuicao: boolean;
  peso: number;
  total_atribuidos: number;
}

export async function listarDistribuicao(): Promise<DistribuicaoUsuario[]> {
  const { data, error } = await supabase.rpc("fran_listar_distribuicao");
  if (error) throw new Error(error.message);
  return (data ?? []) as DistribuicaoUsuario[];
}

export async function setDistribuicao(
  userId: string,
  recebe: boolean,
  peso: number
): Promise<void> {
  const { error } = await supabase.rpc("fran_set_distribuicao", {
    p_user_id: userId,
    p_recebe: recebe,
    p_peso: peso,
  });
  if (error) throw new Error(error.message);
}
