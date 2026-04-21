import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useInstituicoes } from "@/hooks/useInstituicoes";
import type { StatusNegociacao } from "@/lib/types";
import {
  MultiSelectDropdown,
  type MultiSelectOption,
} from "./MultiSelectDropdown";
import type { DevedoresFilters } from "@/hooks/useDevedores";

const STATUS_OPTIONS: MultiSelectOption[] = [
  { value: "pendente", label: "Pendente" },
  { value: "primeira_msg", label: "1ª Mensagem" },
  { value: "em_negociacao", label: "Em Negociação" },
  { value: "acordo_aceito", label: "Acordo Fechado" },
  { value: "escalado", label: "Escalado" },
  { value: "sem_acordo", label: "Sem Acordo" },
  { value: "aguardando_retorno", label: "Aguardando" },
];

interface FiltrosBarProps {
  filters: DevedoresFilters;
  onChange: (next: DevedoresFilters) => void;
  onClear: () => void;
  hasFiltersAtivos: boolean;
}

export function FiltrosBar({
  filters,
  onChange,
  onClear,
  hasFiltersAtivos,
}: FiltrosBarProps) {
  const { data: instituicoes } = useInstituicoes();

  // Busca local com debounce leve para não refetch a cada tecla.
  const [busca, setBusca] = useState(filters.busca ?? "");
  useEffect(() => {
    setBusca(filters.busca ?? "");
  }, [filters.busca]);

  useEffect(() => {
    const t = setTimeout(() => {
      if ((filters.busca ?? "") !== busca) {
        onChange({ ...filters, busca: busca || undefined });
      }
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca]);

  const instituicoesOptions: MultiSelectOption[] =
    instituicoes?.map((i) => ({ value: i.nome, label: i.nome })) ?? [];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome ou CPF..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="pl-8 h-9"
        />
      </div>

      <MultiSelectDropdown
        label="Status"
        options={STATUS_OPTIONS}
        selected={filters.status ?? []}
        onChange={(next) =>
          onChange({
            ...filters,
            status:
              next.length > 0 ? (next as StatusNegociacao[]) : undefined,
          })
        }
      />

      <MultiSelectDropdown
        label="Instituição"
        options={instituicoesOptions}
        selected={filters.instituicoes ?? []}
        onChange={(next) =>
          onChange({
            ...filters,
            instituicoes: next.length > 0 ? next : undefined,
          })
        }
      />

      <div className="flex items-center gap-1">
        <label className="text-xs text-muted-foreground ml-2">De:</label>
        <Input
          type="date"
          value={filters.dataDe ?? ""}
          onChange={(e) =>
            onChange({ ...filters, dataDe: e.target.value || undefined })
          }
          className="h-9 w-[148px]"
        />
        <label className="text-xs text-muted-foreground ml-1">até</label>
        <Input
          type="date"
          value={filters.dataAte ?? ""}
          onChange={(e) =>
            onChange({ ...filters, dataAte: e.target.value || undefined })
          }
          className="h-9 w-[148px]"
        />
      </div>

      {hasFiltersAtivos && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="text-muted-foreground"
        >
          <X className="mr-1 h-4 w-4" />
          Limpar
        </Button>
      )}
    </div>
  );
}
