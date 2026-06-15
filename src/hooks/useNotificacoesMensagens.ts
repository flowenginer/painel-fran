// Notificações de desktop para novas mensagens do lead (Notification API).
// Usa o mesmo realtime da fran_memory. Só dispara quando:
//   - a mensagem é do lead (type "human", não gatilho de automação);
//   - a aba/sistema NÃO está em foco (document.hidden);
//   - o usuário já concedeu permissão de notificação.
// Fica montado no AppLayout, então funciona em qualquer página.
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import {
  ehMensagemAutomacao,
  parsearMensagem,
  previewContent,
  type FranMemoryRow,
} from "@/lib/conversas";
import type { ConversaItem } from "@/hooks/useConversas";

function resolverNome(
  conversas: ConversaItem[] | undefined,
  telefoneNorm: string
): string {
  const c = conversas?.find((x) => x.telefone_normalizado === telefoneNorm);
  return c?.devedor?.nome_devedor || `+${telefoneNorm}`;
}

export function useNotificacoesMensagens() {
  const qc = useQueryClient();

  useEffect(() => {
    const tituloOriginal = document.title;

    const restaurarTitulo = () => {
      if (!document.hidden) document.title = tituloOriginal;
    };
    document.addEventListener("visibilitychange", restaurarTitulo);

    const channel = supabase
      .channel("notif_fran_memory")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "fran_memory" },
        (payload) => {
          const novo = (payload.new ?? {}) as FranMemoryRow;
          const m = parsearMensagem(novo);

          // Só mensagens recebidas do lead, com conteúdo, sem gatilhos.
          if (m.type !== "human") return;
          if (!m.content || ehMensagemAutomacao(m.content)) return;

          // Não notifica se a aba está em foco (a UI já atualiza sozinha).
          if (!document.hidden) return;
          if (
            typeof Notification === "undefined" ||
            Notification.permission !== "granted"
          ) {
            return;
          }

          const conversas = qc.getQueryData<ConversaItem[]>(["conversas"]);
          const nome = resolverNome(conversas, m.session_id_normalizado);

          try {
            const n = new Notification(`Nova mensagem — ${nome}`, {
              body: previewContent(m.content, 90),
              tag: m.session_id_normalizado,
            });
            n.onclick = () => {
              window.focus();
              n.close();
            };
            document.title = "🔔 Nova mensagem";
          } catch {
            /* ignora falhas de Notification */
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", restaurarTitulo);
      document.title = tituloOriginal;
    };
  }, [qc]);
}
