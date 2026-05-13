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
    // Tenta extrair o corpo da resposta de erro (FunctionsHttpError inclui context).
    const ctx = (error as { context?: Response }).context;
    let mensagem: string | null = null;
    if (ctx && typeof ctx.json === "function") {
      try {
        const body = await ctx.json();
        if (body?.error && typeof body.error === "string") {
          mensagem = body.error;
        }
      } catch {
        /* ignora, cai no fallback */
      }
    }
    throw new Error(
      mensagem ??
        (error instanceof Error ? error.message : "Falha ao consultar Cedrus")
    );
  }

  if (!data) throw new Error("Resposta vazia da Edge Function");
  return data;
}

// ============================================================
// Busca em lote: várias consultas em paralelo controlado
// ============================================================

export interface BuscaIndividual {
  cod_credor?: string;
  cod_devedor?: string;
  cnpj_cpf?: string;
  /** Identificador da linha no CSV (1-based, depois do header). */
  linha?: number;
}

export type StatusBuscaIndividual = "encontrado" | "nao_encontrado" | "erro";

export interface ResultadoBuscaIndividual {
  params: BuscaIndividual;
  status: StatusBuscaIndividual;
  devedor?: DevedorNormalizado;
  erro?: string;
}

export interface BuscarVariosOpcoes {
  /** Quantas chamadas simultâneas à Edge Function. Default 3. */
  concorrencia?: number;
  /** Callback de progresso após cada item processado. */
  onProgress?: (
    done: number,
    total: number,
    ultimo: ResultadoBuscaIndividual
  ) => void;
  /** Sinal para cancelar o processamento em andamento. */
  signal?: AbortSignal;
}

/**
 * Faz múltiplas buscas no Cedrus com concorrência limitada para não
 * sobrecarregar a API. Continua processando mesmo se itens individuais
 * falham — o erro fica registrado no resultado correspondente.
 */
export async function buscarVariosDoCedrus(
  buscas: BuscaIndividual[],
  opcoes: BuscarVariosOpcoes = {}
): Promise<ResultadoBuscaIndividual[]> {
  const concorrencia = Math.max(1, opcoes.concorrencia ?? 3);
  const resultados: ResultadoBuscaIndividual[] = new Array(buscas.length);
  let proximoIndex = 0;
  let concluidos = 0;

  async function worker() {
    while (!opcoes.signal?.aborted) {
      const idx = proximoIndex++;
      if (idx >= buscas.length) return;
      const params = buscas[idx];
      let resultado: ResultadoBuscaIndividual;
      try {
        const resp = await buscarNoCedrus({
          cod_credor: params.cod_credor,
          cod_devedor: params.cod_devedor,
          cnpj_cpf: params.cnpj_cpf,
          status: "A",
          num_pagina: 1,
        });
        if (resp.devedores.length === 0) {
          resultado = { params, status: "nao_encontrado" };
        } else {
          resultado = {
            params,
            status: "encontrado",
            devedor: resp.devedores[0],
          };
        }
      } catch (err) {
        resultado = {
          params,
          status: "erro",
          erro: err instanceof Error ? err.message : String(err),
        };
      }
      resultados[idx] = resultado;
      concluidos += 1;
      opcoes.onProgress?.(concluidos, buscas.length, resultado);
    }
  }

  await Promise.all(
    Array.from({ length: concorrencia }, () => worker())
  );

  return resultados;
}

