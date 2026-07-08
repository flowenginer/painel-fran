// Hook para gerar/refinar sugestões de resposta via IA.
import { useMutation } from "@tanstack/react-query";

import { sugerirResposta, type SugestaoTurno } from "@/lib/sugestao";

export function useSugestao() {
  return useMutation({
    mutationFn: ({
      telefone,
      mensagens,
    }: {
      telefone: string;
      mensagens: SugestaoTurno[];
    }) => sugerirResposta({ telefone, mensagens }),
  });
}
