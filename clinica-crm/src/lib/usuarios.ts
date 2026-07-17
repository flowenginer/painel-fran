// Gestão de usuários pelo admin — invoca a Edge Function `admin-usuarios`
// (service_role), que faz a autorização real (só admin ativo).
import { supabase } from "@/lib/supabase";
import type { UsuarioPerfil, UsuarioPermissoes } from "@/lib/types";

async function invocar<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("admin-usuarios", {
    body,
  });
  if (error) {
    let msg = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) {
        const j = (await ctx.json()) as { error?: string };
        if (j?.error) msg = j.error;
      }
    } catch {
      /* mantém error.message */
    }
    throw new Error(msg);
  }
  return data as T;
}

export async function listarUsuarios(): Promise<UsuarioPerfil[]> {
  const r = await invocar<{ usuarios: UsuarioPerfil[] }>({ action: "listar" });
  return r.usuarios ?? [];
}

export interface CriarUsuarioInput {
  email: string;
  password: string;
  nome?: string;
  role: "admin" | "atendente";
  unidade_id?: number | null;
  permissoes: UsuarioPermissoes;
}

export async function criarUsuario(input: CriarUsuarioInput): Promise<void> {
  await invocar({ action: "criar", ...input });
}

export interface AtualizarUsuarioInput {
  id: string;
  nome?: string;
  role?: "admin" | "atendente";
  ativo?: boolean;
  unidade_id?: number | null;
  permissoes?: UsuarioPermissoes;
}

export async function atualizarUsuario(
  input: AtualizarUsuarioInput,
): Promise<void> {
  await invocar({ action: "atualizar", ...input });
}

export async function resetarSenha(
  id: string,
  password: string,
): Promise<void> {
  await invocar({ action: "resetar_senha", id, password });
}

export async function removerUsuario(id: string): Promise<void> {
  await invocar({ action: "remover", id });
}
