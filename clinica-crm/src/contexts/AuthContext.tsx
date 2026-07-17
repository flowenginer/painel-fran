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
  /** Perfil do usuário (papel + unidade + permissões). null enquanto carrega. */
  perfil: UsuarioPerfil | null;
  /** true quando o perfil carregado é admin ativo. */
  isAdmin: boolean;
  loading: boolean;
  /** Carregando o perfil de `usuarios` (separado da sessão de auth). */
  perfilLoading: boolean;
  temPermissao: (tipo: "pagina" | "acao", id: string) => boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function normalizarPermissoes(valor: unknown): UsuarioPermissoes {
  const obj = (valor ?? {}) as Partial<UsuarioPermissoes>;
  return {
    paginas: Array.isArray(obj.paginas) ? obj.paginas : [],
    acoes: Array.isArray(obj.acoes) ? obj.acoes : [],
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [perfil, setPerfil] = useState<UsuarioPerfil | null>(null);
  const [perfilLoading, setPerfilLoading] = useState(false);

  const carregarPerfil = useCallback(async (userId: string | null) => {
    if (!userId) {
      setPerfil(null);
      setPerfilLoading(false);
      return;
    }
    setPerfilLoading(true);
    const { data, error } = await supabase
      .from("usuarios")
      .select("id, nome, email, role, ativo, unidade_id, permissoes, created_at, updated_at")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      // Não derruba a sessão — só deixa o perfil indefinido (útil antes da
      // migração rodar / perfil não provisionado).
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
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      void carregarPerfil(session?.user?.id ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      void carregarPerfil(session?.user?.id ?? null);
    });

    return () => subscription.unsubscribe();
  }, [carregarPerfil]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
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
    [isAdmin, perfil],
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
