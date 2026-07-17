import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// Assina as mudanças de `mensagens` e `conversas` (Realtime) e invalida os
// caches do React Query. A RLS por unidade garante que a atendente só recebe
// eventos da própria unidade. O fetch é refeito — não injetamos no cache
// (a bolha otimista do envio é a única inserção direta, na fase 3b).
export function useConversasRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const canal = supabase
      .channel("inbox_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "mensagens" },
        (payload) => {
          const row = (payload.new ?? payload.old) as
            | { conversa_id?: number }
            | undefined;
          queryClient.invalidateQueries({ queryKey: ["conversas"] });
          if (row?.conversa_id != null) {
            queryClient.invalidateQueries({
              queryKey: ["mensagens", row.conversa_id],
            });
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversas" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["conversas"] });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(canal);
    };
  }, [queryClient]);
}
