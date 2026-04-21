// Gerencia o conjunto de IDs selecionados para disparo em lote.
// Limpa automaticamente ao desmontar.
import { useCallback, useState } from "react";

export function useSelecaoDevedores() {
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());

  const toggle = useCallback((id: number) => {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Se todos os ids já estão selecionados, desmarca-os; senão adiciona os que faltam.
  const togglePagina = useCallback((ids: number[]) => {
    setSelecionados((prev) => {
      const todosPresentes = ids.every((id) => prev.has(id));
      const next = new Set(prev);
      if (todosPresentes) {
        for (const id of ids) next.delete(id);
      } else {
        for (const id of ids) next.add(id);
      }
      return next;
    });
  }, []);

  const limpar = useCallback(() => setSelecionados(new Set()), []);

  return { selecionados, toggle, togglePagina, limpar };
}
