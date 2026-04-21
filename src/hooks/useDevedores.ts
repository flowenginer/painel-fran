// Hook para listar devedores com paginação via TanStack Query.
// Filtros e ordenação serão acoplados na TASK-009.
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import type { Devedor } from "@/lib/types";

export const PAGE_SIZE = 25;

export interface DevedoresParams {
  page: number; // 1-based
  pageSize?: number;
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

  const { data, error, count } = await supabase
    .from("fran_devedores")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

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
