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
 * Injeta explicitamente o JWT do usuário logado — sem sessão, falha cedo.
 */
export async function buscarNoCedrus(
  params: CedrusBuscarParams
): Promise<CedrusBuscarResponse> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Sessão expirou. Faça login novamente.");
  }

  const { data, error } = await supabase.functions.invoke<CedrusBuscarResponse>(
    "cedrus-buscar",
    {
      body: params,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    }
  );

  if (error) {
    // Tenta extrair o corpo da resposta de erro (FunctionsHttpError inclui context)
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const body = await ctx.json();
        if (body?.error) throw new Error(body.error);
      } catch {
        /* ignora, cai no throw padrão */
      }
    }
    throw new Error(
      error instanceof Error ? error.message : "Falha ao consultar Cedrus"
    );
  }

  if (!data) throw new Error("Resposta vazia da Edge Function");
  return data;
}
