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

export interface ImportarEmLoteInput {
  candidatos: { cod_credor: string; nome: string }[];
}

export interface ImportarEmLoteResult {
  inseridos: number;
  ignorados: number;
  invalidos: number;
  codsExistentes: string[];
  codsInseridos: string[];
}

/**
 * Importa instituições em lote:
 * - Descarta entradas sem cod_credor OU sem nome.
 * - Busca cod_credor já existentes (IN) e ignora esses.
 * - INSERT em batch dos novos (ativo=true).
 */
async function importarInstituicoesEmLote(
  input: ImportarEmLoteInput
): Promise<ImportarEmLoteResult> {
  const validos = input.candidatos
    .map((c) => ({
      cod_credor: (c.cod_credor ?? "").trim(),
      nome: (c.nome ?? "").trim(),
    }))
    .filter((c) => c.cod_credor && c.nome);

  const invalidos = input.candidatos.length - validos.length;

  if (validos.length === 0) {
    return {
      inseridos: 0,
      ignorados: 0,
      invalidos,
      codsExistentes: [],
      codsInseridos: [],
    };
  }

  // Deduplica candidatos internamente (caso a planilha tenha repetidos)
  const unicosMap = new Map<string, { cod_credor: string; nome: string }>();
  for (const v of validos) {
    if (!unicosMap.has(v.cod_credor)) unicosMap.set(v.cod_credor, v);
  }
  const unicos = Array.from(unicosMap.values());

  // Busca existentes. Faz em chunks de 200 para evitar URL absurdamente longa.
  const codsExistentes = new Set<string>();
  for (let i = 0; i < unicos.length; i += 200) {
    const fatia = unicos.slice(i, i + 200).map((u) => u.cod_credor);
    const { data, error } = await supabase
      .from("fran_instituicoes")
      .select("cod_credor")
      .in("cod_credor", fatia);
    if (error) throw error;
    for (const row of data ?? []) {
      codsExistentes.add(row.cod_credor as string);
    }
  }

  const novos = unicos.filter((u) => !codsExistentes.has(u.cod_credor));

  if (novos.length > 0) {
    // Insert em chunks de 500
    for (let i = 0; i < novos.length; i += 500) {
      const fatia = novos.slice(i, i + 500).map((n) => ({
        cod_credor: n.cod_credor,
        nome: n.nome,
        ativo: true,
      }));
      const { error } = await supabase
        .from("fran_instituicoes")
        .insert(fatia);
      if (error) throw error;
    }
  }

  return {
    inseridos: novos.length,
    ignorados: codsExistentes.size,
    invalidos,
    codsExistentes: Array.from(codsExistentes),
    codsInseridos: novos.map((n) => n.cod_credor),
  };
}

export function useImportarInstituicoes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: importarInstituicoesEmLote,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["instituicoes"] }),
  });
}
