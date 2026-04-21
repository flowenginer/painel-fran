// Hook para listar devedores com paginação, filtros, busca e ordenação.
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import type { Devedor, StatusNegociacao } from "@/lib/types";

export const PAGE_SIZE = 25;

export type SortField =
  | "created_at"
  | "nome_devedor"
  | "valor_atualizado"
  | "data_ultimo_contato"
  | "status_negociacao";
export type SortDirection = "asc" | "desc";

export interface DevedoresFilters {
  // Busca livre em nome/CPF
  busca?: string;
  // Multi-select
  status?: StatusNegociacao[];
  instituicoes?: string[];
  // Campanha: "all" | <nome> | "__none__" (sem campanha)
  campanha?: string;
  // Período em data_ultimo_contato (ISO yyyy-mm-dd)
  dataDe?: string;
  dataAte?: string;
}

export interface DevedoresParams {
  page: number; // 1-based
  pageSize?: number;
  filters?: DevedoresFilters;
  sortField?: SortField;
  sortDirection?: SortDirection;
}

export interface DevedoresResult {
  devedores: Devedor[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

async function fetchDevedores(
  params: DevedoresParams
): Promise<DevedoresResult> {
  const pageSize = params.pageSize ?? PAGE_SIZE;
  const page = Math.max(1, params.page);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("fran_devedores")
    .select("*", { count: "exact" });

  const f = params.filters ?? {};

  // Busca livre (nome ou CPF)
  if (f.busca && f.busca.trim()) {
    const termo = f.busca.trim();
    const soDigitos = termo.replace(/\D/g, "");
    if (soDigitos && soDigitos.length >= 3) {
      // busca por CPF
      query = query.or(
        `cpf.ilike.%${soDigitos}%,nome_devedor.ilike.%${termo}%`
      );
    } else {
      query = query.ilike("nome_devedor", `%${termo}%`);
    }
  }

  if (f.status && f.status.length > 0) {
    query = query.in("status_negociacao", f.status);
  }

  if (f.instituicoes && f.instituicoes.length > 0) {
    query = query.in("instituicao", f.instituicoes);
  }

  if (f.campanha) {
    if (f.campanha === "__none__") {
      query = query.is("campanha", null);
    } else if (f.campanha !== "all") {
      query = query.eq("campanha", f.campanha);
    }
  }

  if (f.dataDe) query = query.gte("data_ultimo_contato", f.dataDe);
  if (f.dataAte) {
    // +1 dia no limite superior pra incluir o dia inteiro
    const d = new Date(f.dataAte);
    d.setDate(d.getDate() + 1);
    query = query.lt("data_ultimo_contato", d.toISOString().slice(0, 10));
  }

  // Ordenação
  const sortField = params.sortField ?? "created_at";
  const sortDirection = params.sortDirection ?? "desc";
  query = query.order(sortField, {
    ascending: sortDirection === "asc",
    nullsFirst: false,
  });

  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) throw error;

  const total = count ?? 0;
  return {
    devedores: (data ?? []) as Devedor[],
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export function useDevedores(params: DevedoresParams) {
  return useQuery({
    queryKey: ["devedores", params],
    queryFn: () => fetchDevedores(params),
    staleTime: 30_000,
  });
}
