// Sincroniza filtros, paginação e ordenação com a query string.
// Permite compartilhar URLs com filtros aplicados.
import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import type { StatusNegociacao } from "@/lib/types";
import type {
  DevedoresFilters,
  SortDirection,
  SortField,
} from "./useDevedores";

export interface DevedoresTableState {
  page: number;
  filters: DevedoresFilters;
  sortField: SortField;
  sortDirection: SortDirection;
}

const SORT_FIELDS: SortField[] = [
  "created_at",
  "nome_devedor",
  "valor_atualizado",
  "data_ultimo_contato",
  "status_negociacao",
];

const STATUS_VALUES: StatusNegociacao[] = [
  "pendente",
  "primeira_msg",
  "em_negociacao",
  "acordo_aceito",
  "escalado",
  "sem_acordo",
  "aguardando_retorno",
];

function parseList<T extends string>(
  raw: string | null,
  allowed: readonly T[]
): T[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is T => (allowed as readonly string[]).includes(s));
}

export function useDevedoresFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const state: DevedoresTableState = useMemo(() => {
    const pageRaw = parseInt(searchParams.get("page") ?? "1", 10);
    const sortFieldRaw = searchParams.get("sort") ?? "created_at";
    const sortField: SortField = (
      SORT_FIELDS as readonly string[]
    ).includes(sortFieldRaw)
      ? (sortFieldRaw as SortField)
      : "created_at";
    const dir = searchParams.get("dir");
    const sortDirection: SortDirection = dir === "asc" ? "asc" : "desc";

    const statusAllFree = searchParams.get("status");
    const instFree = searchParams.get("inst");

    const filters: DevedoresFilters = {
      busca: searchParams.get("q") || undefined,
      status:
        parseList(statusAllFree, STATUS_VALUES).length > 0
          ? parseList(statusAllFree, STATUS_VALUES)
          : undefined,
      instituicoes: instFree
        ? instFree.split(",").filter(Boolean)
        : undefined,
      campanha: searchParams.get("camp") || undefined,
      dataDe: searchParams.get("de") || undefined,
      dataAte: searchParams.get("ate") || undefined,
    };

    return {
      page: Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1,
      filters,
      sortField,
      sortDirection,
    };
  }, [searchParams]);

  const update = useCallback(
    (patch: Partial<DevedoresTableState>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          const merged = { ...state, ...patch };
          const { page, filters, sortField, sortDirection } = merged;

          if (page > 1) next.set("page", String(page));
          else next.delete("page");

          if (filters.busca) next.set("q", filters.busca);
          else next.delete("q");

          if (filters.status && filters.status.length > 0)
            next.set("status", filters.status.join(","));
          else next.delete("status");

          if (filters.instituicoes && filters.instituicoes.length > 0)
            next.set("inst", filters.instituicoes.join(","));
          else next.delete("inst");

          if (filters.campanha) next.set("camp", filters.campanha);
          else next.delete("camp");

          if (filters.dataDe) next.set("de", filters.dataDe);
          else next.delete("de");

          if (filters.dataAte) next.set("ate", filters.dataAte);
          else next.delete("ate");

          if (sortField !== "created_at") next.set("sort", sortField);
          else next.delete("sort");

          if (sortDirection !== "desc") next.set("dir", sortDirection);
          else next.delete("dir");

          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams, state]
  );

  const setFilters = useCallback(
    (filters: DevedoresFilters) => {
      // Mudar filtros reseta a página
      update({ filters, page: 1 });
    },
    [update]
  );

  const setPage = useCallback((page: number) => update({ page }), [update]);

  const setSort = useCallback(
    (sortField: SortField, sortDirection: SortDirection) =>
      update({ sortField, sortDirection, page: 1 }),
    [update]
  );

  const clear = useCallback(() => {
    setSearchParams(new URLSearchParams(), { replace: true });
  }, [setSearchParams]);

  const hasFiltersAtivos = useMemo(() => {
    const f = state.filters;
    return Boolean(
      f.busca ||
        (f.status && f.status.length > 0) ||
        (f.instituicoes && f.instituicoes.length > 0) ||
        f.campanha ||
        f.dataDe ||
        f.dataAte
    );
  }, [state.filters]);

  return {
    state,
    setFilters,
    setPage,
    setSort,
    clear,
    hasFiltersAtivos,
  };
}
