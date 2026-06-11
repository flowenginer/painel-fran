import {
  createContext,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { UsuarioPerfil, UsuarioPermissoes } from "@/lib/types";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  /** Perfil do usuário (papel + permissões). null enquanto carrega ou se não existe. */
  perfil: UsuarioPerfil | null;
  /** true quando o perfil carregado tem papel de admin ativo. */
  isAdmin: boolean;
  loading: boolean;
  /** Carregando o perfil de fran_usuarios (separado da sessão de auth). */
  perfilLoading: boolean;
  /**
   * O usuário pode acessar a página/ação? Admin sempre pode. Operador
   * depende da lista em perfil.permissoes.
   */
  temPermissao: (tipo: "pagina" | "acao", id: string) => boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(
  undefined
);

interface AuthProviderProps {
  children: ReactNode;
}

// Normaliza o JSON de permissões vindo do banco para o shape esperado.
function normalizarPermissoes(valor: unknown): UsuarioPermissoes {
  const obj = (valor ?? {}) as Partial<UsuarioPermissoes>;
  return {
    paginas: Array.isArray(obj.paginas) ? obj.paginas : [],
    acoes: Array.isArray(obj.acoes) ? obj.acoes : [],
  };
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [perfil, setPerfil] = useState<UsuarioPerfil | null>(null);
  const [perfilLoading, setPerfilLoading] = useState(false);

  // Carrega (ou recarrega) o perfil do usuário a partir de fran_usuarios.
  const carregarPerfil = useCallback(async (userId: string | null) => {
    if (!userId) {
      setPerfil(null);
      setPerfilLoading(false);
      return;
    }
    setPerfilLoading(true);
    const { data, error } = await supabase
      .from("fran_usuarios")
      .select(
        "id, nome, email, role, ativo, recebe_distribuicao, permissoes, ultima_atribuicao_em, created_at, updated_at"
      )
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      // Não derruba a sessão: apenas deixa o perfil indefinido. Útil enquanto
      // a migração 0004 ainda não rodou ou o perfil não foi provisionado.
      console.error("[auth] falha ao carregar perfil:", error.message);
      setPerfil(null);
    } else if (data) {
      setPerfil({
        ...data,
        permissoes: normalizarPermissoes(data.permissoes),
      } as UsuarioPerfil);
    } else {
      setPerfil(null);
    }
    setPerfilLoading(false);
  }, []);

  useEffect(() => {
    // Recupera sessão atual (se já estiver logado)
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      void carregarPerfil(session?.user?.id ?? null);
    });

    // Escuta mudanças de auth (login, logout, refresh token)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      void carregarPerfil(session?.user?.id ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [carregarPerfil]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });
    return { error };
  };

  const isAdmin = perfil?.role === "admin" && perfil.ativo === true;

  const temPermissao = useCallback(
    (tipo: "pagina" | "acao", id: string) => {
      if (isAdmin) return true;
      if (!perfil || !perfil.ativo) return false;
      const lista =
        tipo === "pagina" ? perfil.permissoes.paginas : perfil.permissoes.acoes;
      return lista.includes(id);
    },
    [isAdmin, perfil]
  );

  const value: AuthContextValue = {
    session,
    user,
    perfil,
    isAdmin,
    loading,
    perfilLoading,
    temPermissao,
    signIn,
    signOut,
    resetPassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
