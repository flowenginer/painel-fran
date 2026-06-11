// Lista de operadores ativos (via RPC fran_listar_operadores). Disponível
// para qualquer usuário autenticado — usada no seletor de transferência e
// para resolver o nome do responsável na tela de Conversas.
import { useQuery } from "@tanstack/react-query";

import { listarOperadores, type OperadorLite } from "@/lib/conversas-transfer";

export function useOperadores() {
  return useQuery<OperadorLite[]>({
    queryKey: ["operadores"],
    queryFn: listarOperadores,
    staleTime: 60_000,
  });
}
