// Cliente frontend da Edge Function admin-usuarios. Toda a autorização é
// feita no servidor (checa se o chamador é admin). Aqui só montamos a
// chamada e extraímos a mensagem de erro de forma amigável.
import { supabase } from "./supabase";
import type { UsuarioPerfil, UsuarioPermissoes, UsuarioRole } from "./types";

type AdminAction =
  | "listar"
  | "criar"
  | "atualizar"
  | "resetar_senha"
  | "remover";

async function chamar<T>(
  action: AdminAction,
  payload: Record<string, unknown> = {}
): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Sessão expirou. Faça login novamente.");
  }

  const { data, error } = await supabase.functions.invoke<T>("admin-usuarios", {
    body: { action, ...payload },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (error) {
    const ctx = (error as { context?: Response }).context;
    let mensagem: string | null = null;
    if (ctx && typeof ctx.json === "function") {
      try {
        const body = await ctx.json();
        if (body?.error && typeof body.error === "string") mensagem = body.error;
      } catch {
        /* ignora */
      }
    }
    throw new Error(
      mensagem ??
        (error instanceof Error ? error.message : "Falha ao chamar admin-usuarios")
    );
  }
  if (!data) throw new Error("Resposta vazia");
  return data;
}

export interface CriarUsuarioInput {
  email: string;
  password: string;
  nome?: string | null;
  role?: UsuarioRole;
  recebe_distribuicao?: boolean;
  permissoes?: UsuarioPermissoes;
}

export interface AtualizarUsuarioInput {
  id: string;
  nome?: string | null;
  role?: UsuarioRole;
  ativo?: boolean;
  recebe_distribuicao?: boolean;
  permissoes?: UsuarioPermissoes;
}

export async function listarUsuarios(): Promise<UsuarioPerfil[]> {
  const r = await chamar<{ usuarios: UsuarioPerfil[] }>("listar");
  return r.usuarios ?? [];
}

export async function criarUsuario(
  input: CriarUsuarioInput
): Promise<UsuarioPerfil | null> {
  const r = await chamar<{ usuario: UsuarioPerfil | null }>("criar", input);
  return r.usuario;
}

export async function atualizarUsuario(
  input: AtualizarUsuarioInput
): Promise<UsuarioPerfil | null> {
  const r = await chamar<{ usuario: UsuarioPerfil | null }>("atualizar", input);
  return r.usuario;
}

export async function resetarSenhaUsuario(
  id: string,
  password: string
): Promise<void> {
  await chamar("resetar_senha", { id, password });
}

export async function removerUsuario(id: string): Promise<void> {
  await chamar("remover", { id });
}
