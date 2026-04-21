// Mutations de CRUD para fran_instituicoes.
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import type { Instituicao } from "@/lib/types";

export interface InstituicaoInput {
  cod_credor: string;
  nome: string;
  ativo: boolean;
}

async function criarInstituicao(input: InstituicaoInput): Promise<Instituicao> {
  const { data, error } = await supabase
    .from("fran_instituicoes")
    .insert({
      cod_credor: input.cod_credor.trim(),
      nome: input.nome.trim(),
      ativo: input.ativo,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Instituicao;
}

async function atualizarInstituicao(
  id: number,
  input: InstituicaoInput
): Promise<Instituicao> {
  const { data, error } = await supabase
    .from("fran_instituicoes")
    .update({
      cod_credor: input.cod_credor.trim(),
      nome: input.nome.trim(),
      ativo: input.ativo,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Instituicao;
}

async function removerInstituicao(id: number, nome: string): Promise<void> {
  // Antes de remover, valida se não há devedores usando.
  const { count, error: countErr } = await supabase
    .from("fran_devedores")
    .select("*", { count: "exact", head: true })
    .eq("instituicao", nome);
  if (countErr) throw countErr;
  if ((count ?? 0) > 0) {
    throw new Error(
      `Não é possível remover: há ${count} devedor(es) usando esta instituição.`
    );
  }
  const { error } = await supabase
    .from("fran_instituicoes")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export function useCriarInstituicao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: criarInstituicao,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["instituicoes"] }),
  });
}

export function useAtualizarInstituicao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: InstituicaoInput }) =>
      atualizarInstituicao(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["instituicoes"] }),
  });
}

export function useRemoverInstituicao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, nome }: { id: number; nome: string }) =>
      removerInstituicao(id, nome),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["instituicoes"] }),
  });
}
