// Cliente frontend da Edge Function cedrus-buscar.
import { supabase } from "./supabase";
import type { DevedorNormalizado } from "./types";

export interface CedrusBuscarParams {
  id_devedor?: string;
  cod_credor?: string;
  cod_devedor?: string;
  cnpj_cpf?: string;
  status?: "A" | "P" | "C" | "S";
  dt_vencimento_de?: string; // dd/mm/yyyy
  dt_vencimento_ate?: string;
  num_pagina?: number;
}

export interface CedrusBuscarResponse {
  devedores: DevedorNormalizado[];
  pagina: number;
  tamanhoPagina: number;
  possuiProximaPagina: boolean;
  total: number;
  message?: string | null;
}

/**
 * Chama a Edge Function cedrus-buscar com os filtros informados.
 * Lança erro se a função retornar status != 2xx.
 */
export async function buscarNoCedrus(
  params: CedrusBuscarParams
): Promise<CedrusBuscarResponse> {
  const { data, error } = await supabase.functions.invoke<CedrusBuscarResponse>(
    "cedrus-buscar",
    { body: params }
  );

  if (error) {
    // supabase-js encapsula detalhes; tenta extrair mensagem amigável
    const msg =
      error instanceof Error && error.message
        ? error.message
        : "Falha ao consultar Cedrus";
    throw new Error(msg);
  }

  if (!data) throw new Error("Resposta vazia da Edge Function");
  return data;
}
