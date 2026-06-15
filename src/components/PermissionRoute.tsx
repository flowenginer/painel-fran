import { Navigate } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";

import { useAuth } from "@/hooks/useAuth";
import { filtrarNavItems } from "@/components/layout/nav-items";

/** Caminho da primeira página que o perfil atual pode acessar (ou null). */
function usePrimeiraPaginaPermitida(): string | null {
  const { isAdmin, temPermissao } = useAuth();
  const itens = filtrarNavItems(isAdmin, temPermissao);
  return itens[0]?.to ?? null;
}

interface PermissionRouteProps {
  /** id da página em lib/permissoes / nav-items. */
  pagina: string;
  /** Quando true, exige papel de admin (ignora a lista de permissões). */
  adminOnly?: boolean;
  children: ReactNode;
}

/**
 * Protege uma rota por permissão de página. Assume que já está dentro de
 * ProtectedRoute (sessão garantida). Enquanto o perfil carrega, mostra
 * loading; sem acesso, mostra um aviso (sem redirect, para evitar loops).
 */
export function PermissionRoute({
  pagina,
  adminOnly,
  children,
}: PermissionRouteProps) {
  const { isAdmin, temPermissao, perfilLoading, perfil } = useAuth();

  // Só bloqueia na carga INICIAL (sem perfil ainda). Recargas posteriores
  // (ex.: refresh de token ao voltar para a aba) não desmontam a página —
  // isso fechava a conversa aberta nas Conversas.
  if (perfilLoading && !perfil) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const permitido = adminOnly ? isAdmin : temPermissao("pagina", pagina);
  if (!permitido) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
        <ShieldAlert className="h-10 w-10 text-muted-foreground" />
        <div>
          <p className="text-lg font-semibold">Sem acesso</p>
          <p className="text-sm text-muted-foreground">
            Você não tem permissão para acessar esta página. Fale com um
            administrador.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

/**
 * Redireciona a rota raiz para a primeira página permitida do perfil.
 * Útil para operadores que não têm acesso ao Dashboard.
 */
export function RedirecionarInicio() {
  const { perfilLoading, perfil } = useAuth();
  const destino = usePrimeiraPaginaPermitida();

  if (perfilLoading && !perfil) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!destino) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
        <ShieldAlert className="h-10 w-10 text-muted-foreground" />
        <div>
          <p className="text-lg font-semibold">Nenhuma página liberada</p>
          <p className="text-sm text-muted-foreground">
            Seu usuário ainda não tem acesso a nenhuma página. Fale com um
            administrador.
          </p>
        </div>
      </div>
    );
  }

  return <Navigate to={destino} replace />;
}
