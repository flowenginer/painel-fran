// Mutations da fila de distribuição: enfileirar devedores, cancelar itens,
// esvaziar a fila e forçar um ciclo de processamento.
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { processarFilaAgora } from "@/lib/processar-fila";

function invalidarFila(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["fila"] });
  qc.invalidateQueries({ queryKey: ["fila-stats"] });
}

export interface EnfileirarInput {
  devedorIds: number[];
  campanha?: string;
}

export interface EnfileirarResult {
  enfileirados: number;
  jaNaFila: number;
  naoElegiveis: number;
}

// Enfileira apenas devedores com status pendente e que ainda não estejam
// na fila ativa. Devolve um resumo para feedback ao operador.
async function enfileirar(input: EnfileirarInput): Promise<EnfileirarResult> {
  const ids = Array.from(new Set(input.devedorIds)).filter((n) => n > 0);
  if (ids.length === 0) {
    return { enfileirados: 0, jaNaFila: 0, naoElegiveis: 0 };
  }

  // Consulta em chunks de 200 para não estourar o tamanho da URL.
  const jaNaFilaSet = new Set<number>();
  const pendentesSet = new Set<number>();
  for (let i = 0; i < ids.length; i += 200) {
    const fatia = ids.slice(i, i + 200);
    // 1. Quais já estão na fila ativa.
    const { data: existentes, error: errExist } = await supabase
      .from("fran_fila_disparo")
      .select("devedor_id")
      .eq("status", "na_fila")
      .in("devedor_id", fatia);
    if (errExist) throw errExist;
    for (const r of existentes ?? []) jaNaFilaSet.add(r.devedor_id);

    // 2. Quais são elegíveis (status pendente).
    const { data: pendentes, error: errPend } = await supabase
      .from("fran_devedores")
      .select("id")
      .eq("status_negociacao", "pendente")
      .in("id", fatia);
    if (errPend) throw errPend;
    for (const r of pendentes ?? []) pendentesSet.add(r.id);
  }

  const aInserir = ids.filter(
    (id) => pendentesSet.has(id) && !jaNaFilaSet.has(id)
  );
  const naoElegiveis = ids.filter((id) => !pendentesSet.has(id)).length;

  if (aInserir.length === 0) {
    return {
      enfileirados: 0,
      jaNaFila: jaNaFilaSet.size,
      naoElegiveis,
    };
  }

  const { data: userData } = await supabase.auth.getUser();
  const usuarioId = userData.user?.id ?? null;

  const linhas = aInserir.map((devedor_id) => ({
    devedor_id,
    campanha: input.campanha ?? null,
    enfileirado_por: usuarioId,
  }));

  // Insert em chunks de 500.
  for (let i = 0; i < linhas.length; i += 500) {
    const { error } = await supabase
      .from("fran_fila_disparo")
      .insert(linhas.slice(i, i + 500));
    if (error) throw error;
  }

  return {
    enfileirados: aInserir.length,
    jaNaFila: jaNaFilaSet.size,
    naoElegiveis,
  };
}

export function useEnfileirar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: enfileirar,
    onSuccess: () => invalidarFila(qc),
  });
}

// Cancela um item (sai da fila ativa, mantém histórico).
export function useCancelarItemFila() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase
        .from("fran_fila_disparo")
        .update({ status: "cancelado", updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidarFila(qc),
  });
}

// Cancela todos os itens que ainda estão aguardando.
export function useEsvaziarFila() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("fran_fila_disparo")
        .update({ status: "cancelado", updated_at: new Date().toISOString() })
        .eq("status", "na_fila");
      if (error) throw error;
    },
    onSuccess: () => invalidarFila(qc),
  });
}

// Força um ciclo de processamento (sem esperar o cron).
export function useProcessarFilaAgora() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: processarFilaAgora,
    onSuccess: () => {
      invalidarFila(qc);
      qc.invalidateQueries({ queryKey: ["devedores"] });
      qc.invalidateQueries({ queryKey: ["kpis"] });
    },
  });
}
