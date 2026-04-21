// Escuta mudanças em fran_devedores via Supabase Realtime e sinaliza
// linhas atualizadas para flash visual. Invalida as queries dependentes
// (devedores e kpis) para refletir o novo estado.
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";

const FLASH_DURATION_MS = 2000;

/**
 * Retorna um Set de ids recentemente atualizados (flash de 2s).
 * A subscription cobre INSERT, UPDATE e DELETE — invalida o cache
 * em todos os casos e marca ids atualizados para animar a linha.
 */
export function useDevedoresRealtime() {
  const queryClient = useQueryClient();
  const [flashIds, setFlashIds] = useState<Set<number>>(new Set());
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(
    new Map()
  );

  useEffect(() => {
    const channel: RealtimeChannel = supabase
      .channel("fran_devedores_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "fran_devedores" },
        (payload) => {
          // Invalida queries dependentes
          queryClient.invalidateQueries({ queryKey: ["devedores"] });
          queryClient.invalidateQueries({ queryKey: ["kpis"] });

          // Só faz sentido marcar flash em UPDATE (INSERT cria linha nova
          // que já aparece, DELETE some com a linha).
          if (payload.eventType !== "UPDATE") return;

          const novo = payload.new as { id?: number };
          const id = novo?.id;
          if (!id) return;

          setFlashIds((prev) => {
            if (prev.has(id)) return prev;
            const next = new Set(prev);
            next.add(id);
            return next;
          });

          const prevTimer = timersRef.current.get(id);
          if (prevTimer) clearTimeout(prevTimer);

          const timer = setTimeout(() => {
            setFlashIds((prev) => {
              if (!prev.has(id)) return prev;
              const next = new Set(prev);
              next.delete(id);
              return next;
            });
            timersRef.current.delete(id);
          }, FLASH_DURATION_MS);

          timersRef.current.set(id, timer);
        }
      )
      .subscribe();

    return () => {
      const timers = timersRef.current;
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return flashIds;
}
