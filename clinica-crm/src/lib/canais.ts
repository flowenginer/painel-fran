// CRUD de canais de WhatsApp + segredos (admin). RLS: leitura por unidade,
// escrita só admin; canal_secrets é admin-only.
import { supabase } from "@/lib/supabase";
import type { Canal, CanalTipo } from "@/lib/types";

const SELECT_CANAL =
  "id,unidade_id,nome,tipo,instancia,numero,zernio_account_id,ativo,conectado,status_em,created_at,updated_at";

export async function listarCanais(): Promise<Canal[]> {
  const { data, error } = await supabase
    .from("canais")
    .select(SELECT_CANAL)
    .order("unidade_id", { ascending: true })
    .order("nome", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Canal[];
}

export interface CanalInput {
  unidade_id: number;
  nome: string;
  tipo: CanalTipo;
  instancia?: string;
  numero?: string | null;
  zernio_account_id?: string | null;
  ativo?: boolean;
}

export async function criarCanal(input: CanalInput): Promise<Canal> {
  const { data, error } = await supabase
    .from("canais")
    .insert({
      unidade_id: input.unidade_id,
      nome: input.nome.trim(),
      tipo: input.tipo,
      instancia: input.instancia?.trim() ?? "",
      numero: input.numero?.trim() || null,
      zernio_account_id: input.zernio_account_id?.trim() || null,
      ativo: input.ativo ?? true,
    })
    .select(SELECT_CANAL)
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as Canal;
}

export async function atualizarCanal(
  id: number,
  patch: Partial<CanalInput>,
): Promise<Canal> {
  const linha: Record<string, unknown> = {};
  if (patch.nome !== undefined) linha.nome = patch.nome.trim();
  if (patch.tipo !== undefined) linha.tipo = patch.tipo;
  if (patch.instancia !== undefined) linha.instancia = patch.instancia.trim();
  if (patch.numero !== undefined) linha.numero = patch.numero?.trim() || null;
  if (patch.zernio_account_id !== undefined)
    linha.zernio_account_id = patch.zernio_account_id?.trim() || null;
  if (patch.ativo !== undefined) linha.ativo = patch.ativo;
  if (patch.unidade_id !== undefined) linha.unidade_id = patch.unidade_id;

  const { data, error } = await supabase
    .from("canais")
    .update(linha)
    .eq("id", id)
    .select(SELECT_CANAL)
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as Canal;
}

export async function removerCanal(id: number): Promise<void> {
  const { error } = await supabase.from("canais").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// --- Segredos (admin-only) -------------------------------------------------
export interface CanalSecret {
  token: string;
  webhook_secret: string;
  n8n_url: string;
}

export async function lerSecret(canalId: number): Promise<CanalSecret> {
  const { data, error } = await supabase
    .from("canal_secrets")
    .select("token,webhook_secret,n8n_url")
    .eq("canal_id", canalId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (
    (data as CanalSecret | null) ?? { token: "", webhook_secret: "", n8n_url: "" }
  );
}

export async function salvarSecret(
  canalId: number,
  secret: CanalSecret,
): Promise<void> {
  const { error } = await supabase.from("canal_secrets").upsert(
    {
      canal_id: canalId,
      token: secret.token ?? "",
      webhook_secret: secret.webhook_secret ?? "",
      n8n_url: secret.n8n_url ?? "",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "canal_id" },
  );
  if (error) throw new Error(error.message);
}
