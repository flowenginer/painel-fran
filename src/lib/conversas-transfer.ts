// Cliente das RPCs de Conversas (Fase 4): listar operadores e transferir.
// A autorização da transferência é feita no banco (fran_transferir_conversa).
import { supabase } from "./supabase";

export interface OperadorLite {
  id: string;
  nome: string | null;
  email: string | null;
  role: string;
  ativo: boolean;
}

/** Lista usuários ativos (para o seletor de destino e resolução de nomes). */
export async function listarOperadores(): Promise<OperadorLite[]> {
  const { data, error } = await supabase.rpc("fran_listar_operadores");
  if (error) throw new Error(error.message);
  return (data ?? []) as OperadorLite[];
}

/** Transfere a conversa (lead) para outro operador. */
export async function transferirConversa(
  devedorId: number,
  paraUsuarioId: string,
  motivo?: string | null
): Promise<void> {
  const { error } = await supabase.rpc("fran_transferir_conversa", {
    p_devedor_id: devedorId,
    p_para_usuario: paraUsuarioId,
    p_motivo: motivo ?? null,
  });
  if (error) throw new Error(error.message);
}

/** Nome amigável de um operador a partir da lista (nome ou e-mail). */
export function nomeOperador(
  operadores: OperadorLite[] | undefined,
  id: string | null | undefined
): string | null {
  if (!id) return null;
  const op = operadores?.find((o) => o.id === id);
  if (!op) return null;
  return op.nome || op.email || null;
}
