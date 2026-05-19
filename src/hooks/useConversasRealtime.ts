// Escuta inserts na fran_memory e invalida caches de conversas e threads.
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";
import { normalizarSessionId } from "@/lib/conversas";

export function useConversasRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel: RealtimeChannel = supabase
      .channel("fran_memory_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "fran_memory" },
        (payload) => {
          // Sempre invalida a lista de conversas (preview muda)
          queryClient.invalidateQueries({ queryKey: ["conversas"] });

          // Se conseguir identificar a sessão, invalida só a thread dela
          const novo = (payload.new ?? {}) as { session_id?: string };
          const norm = normalizarSessionId(novo.session_id);
          if (norm) {
            queryClient.invalidateQueries({
              queryKey: ["conversa", norm],
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
