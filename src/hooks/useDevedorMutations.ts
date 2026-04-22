// Mutations de alteração e remoção de devedores.
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import type { Devedor, StatusNegociacao } from "@/lib/types";

// Campos que o operador pode editar na revisão manual de um devedor.
// (Preserva campos gerenciados pela Fran: acordo_*, motivo_escalonamento,
// data_primeiro_disparo, tentativas_contato — operador não deve mexer neles
// por engano.)
export interface AtualizarDevedorInput {
  nome_devedor?: string;
  primeiro_nome?: string | null;
  tratamento?: string | null;
  email?: string | null;
  telefone?: string;
  telefone_2?: string | null;
  telefone_3?: string | null;
  endereco?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  cep?: string | null;
  instituicao?: string;
  nome_aluno?: string | null;
  acordo_anterior?: string | null;
  dado_adicional?: string | null;
  observacoes_negociacao?: string | null;
  status_negociacao?: StatusNegociacao;
}

async function atualizarDevedor(args: {
  id: number;
  input: AtualizarDevedorInput;
}): Promise<Devedor> {
  const { data, error } = await supabase
    .from("fran_devedores")
    .update({ ...args.input, updated_at: new Date().toISOString() })
    .eq("id", args.id)
    .select()
    .single();
  if (error) throw error;
  return data as Devedor;
}

async function removerDevedor(id: number): Promise<void> {
  const { error } = await supabase
    .from("fran_devedores")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

async function atualizarStatus(args: {
  id: number;
  status: StatusNegociacao;
}): Promise<Devedor> {
  const agora = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status_negociacao: args.status,
    updated_at: agora,
  };
  // Quando o operador volta manualmente pra "pendente", zera disparo pra
  // permitir nova campanha.
  if (args.status === "pendente") {
    patch.data_primeiro_disparo = null;
  }
  const { data, error } = await supabase
    .from("fran_devedores")
    .update(patch)
    .eq("id", args.id)
    .select()
    .single();
  if (error) throw error;
  return data as Devedor;
}

export function useAtualizarDevedor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: atualizarDevedor,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["devedores"] });
      qc.invalidateQueries({ queryKey: ["kpis"] });
    },
  });
}

export function useRemoverDevedor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: removerDevedor,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["devedores"] });
      qc.invalidateQueries({ queryKey: ["kpis"] });
    },
  });
}

export function useAtualizarStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: atualizarStatus,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["devedores"] });
      qc.invalidateQueries({ queryKey: ["kpis"] });
    },
  });
}
