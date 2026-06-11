// Lista de usuários do painel (somente admin). Lê via Edge Function
// admin-usuarios, que aplica a checagem de papel no servidor.
import { useQuery } from "@tanstack/react-query";

import { listarUsuarios } from "@/lib/usuarios";
import type { UsuarioPerfil } from "@/lib/types";

export function useUsuarios(enabled = true) {
  return useQuery<UsuarioPerfil[]>({
    queryKey: ["usuarios"],
    queryFn: listarUsuarios,
    enabled,
    staleTime: 30_000,
  });
}
