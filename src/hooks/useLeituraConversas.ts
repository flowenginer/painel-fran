// Controle de "não lida" por conversa, por operador (guardado no navegador).
// Guarda o id da última mensagem vista de cada conversa; uma conversa fica
// "não lida" quando a última mensagem é do lead (human) e o id é maior que o
// último visto.
import { useCallback, useEffect, useState } from "react";

import type { ConversaItem } from "@/hooks/useConversas";

type MapaLido = Record<string, number>;

export function useLeituraConversas(userId: string | null) {
  const chave = `leitura-conversas:${userId ?? "anon"}`;
  const [lidas, setLidas] = useState<MapaLido>({});

  // Carrega/recarrega quando o usuário muda.
  useEffect(() => {
    try {
      setLidas(JSON.parse(localStorage.getItem(chave) || "{}") as MapaLido);
    } catch {
      setLidas({});
    }
  }, [chave]);

  const marcarLida = useCallback(
    (telefone: string, msgId: number) => {
      setLidas((prev) => {
        if ((prev[telefone] ?? 0) >= msgId) return prev;
        const novo = { ...prev, [telefone]: msgId };
        try {
          localStorage.setItem(chave, JSON.stringify(novo));
        } catch {
          /* storage indisponível */
        }
        return novo;
      });
    },
    [chave]
  );

  const naoLida = useCallback(
    (c: ConversaItem) => {
      const um = c.ultima_mensagem;
      if (!um || um.type !== "human") return false;
      return um.id > (lidas[c.telefone_normalizado] ?? 0);
    },
    [lidas]
  );

  return { naoLida, marcarLida };
}
