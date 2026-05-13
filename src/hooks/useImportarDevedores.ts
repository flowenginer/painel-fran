// Mutation de importação em massa de devedores via CSV.
// - Dedup por CPF dentro do lote.
// - Ignora CPF já cadastrado em fran_devedores.
// - Insert em chunks de 500.
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import type { CandidatoDevedor } from "@/lib/csv-devedores";

export interface ImportarDevedoresInput {
  candidatos: CandidatoDevedor[];
}

export interface ImportarDevedoresResult {
  inseridos: number;
  ignorados: number; // CPF já existia
  duplicadosNoLote: number; // CPF repetido no próprio CSV
  cpfsExistentes: string[];
  cpfsInseridos: string[];
}

async function importarEmLote(
  input: ImportarDevedoresInput
): Promise<ImportarDevedoresResult> {
  // 1. Dedup interno por CPF (pega o primeiro de cada).
  const mapa = new Map<string, CandidatoDevedor>();
  let duplicadosNoLote = 0;
  for (const c of input.candidatos) {
    if (mapa.has(c.cpf)) {
      duplicadosNoLote += 1;
      continue;
    }
    mapa.set(c.cpf, c);
  }
  const unicos = Array.from(mapa.values());

  if (unicos.length === 0) {
    return {
      inseridos: 0,
      ignorados: 0,
      duplicadosNoLote,
      cpfsExistentes: [],
      cpfsInseridos: [],
    };
  }

  // 2. Busca CPFs já cadastrados em chunks de 200 (evita URL longa).
  const existentes = new Set<string>();
  for (let i = 0; i < unicos.length; i += 200) {
    const fatia = unicos.slice(i, i + 200).map((u) => u.cpf);
    const { data, error } = await supabase
      .from("fran_devedores")
      .select("cpf")
      .in("cpf", fatia);
    if (error) throw error;
    for (const row of data ?? []) {
      if (row.cpf) existentes.add(row.cpf as string);
    }
  }

  const novos = unicos.filter((u) => !existentes.has(u.cpf));

  // 3. Insert em chunks de 500.
  if (novos.length > 0) {
    for (let i = 0; i < novos.length; i += 500) {
      const fatia = novos.slice(i, i + 500).map((n) => ({
        cod_credor: n.cod_credor,
        cod_devedor: n.cod_devedor,
        cpf: n.cpf,
        nome_devedor: n.nome_devedor,
        primeiro_nome: n.primeiro_nome,
        tratamento: n.tratamento,
        email: n.email,
        telefone: n.telefone,
        telefone_2: n.telefone_2,
        telefone_3: n.telefone_3,
        endereco: n.endereco,
        bairro: n.bairro,
        cidade: n.cidade,
        estado: n.estado,
        cep: n.cep,
        instituicao: n.instituicao,
        nome_aluno: n.nome_aluno,
        valor_original: n.valor_original,
        valor_atualizado: n.valor_atualizado,
        qtd_parcelas_aberto: n.qtd_parcelas_aberto,
        ano_inicial_dividas: n.ano_inicial_dividas,
        ano_final_dividas: n.ano_final_dividas,
        acordo_anterior: n.acordo_anterior,
        dado_adicional: n.dado_adicional,
        // Defaults
        status_negociacao: "pendente",
        tentativas_contato: 0,
        status_judicial: "extrajudicial",
        tem_fiador: "nao",
      }));
      const { error } = await supabase.from("fran_devedores").insert(fatia);
      if (error) throw error;
    }
  }

  return {
    inseridos: novos.length,
    ignorados: existentes.size,
    duplicadosNoLote,
    cpfsExistentes: Array.from(existentes),
    cpfsInseridos: novos.map((n) => n.cpf),
  };
}

export function useImportarDevedores() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: importarEmLote,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["devedores"] });
      qc.invalidateQueries({ queryKey: ["kpis"] });
    },
  });
}
