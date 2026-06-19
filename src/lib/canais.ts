// Cliente da tabela fran_canais (canais de conexão WhatsApp/UAZAPI).
// Leitura por qualquer autenticado; escrita só admin (garantido pela RLS).
import { supabase } from "./supabase";

export interface Canal {
  id: number;
  nome: string;
  /** Identificador que o n8n usa para rotear (vai no payload do envio). */
  instancia: string;
  numero: string | null;
  ativo: boolean;
  peso: number;
  ordem: number;
  /** Participa do rodízio de disparo (1ª mensagem). */
  usar_no_disparo: boolean;
  /** Última conexão conhecida (cache, atualizado nos disparos). */
  conectado: boolean;
}

export interface CanalInput {
  nome: string;
  instancia: string;
  numero?: string | null;
  ativo?: boolean;
  peso?: number;
  ordem?: number;
  usar_no_disparo?: boolean;
}

export async function listarCanais(): Promise<Canal[]> {
  const { data, error } = await supabase
    .from("fran_canais")
    .select(
      "id, nome, instancia, numero, ativo, peso, ordem, usar_no_disparo, conectado"
    )
    .order("ordem", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Canal[];
}

/** Tokens por canal (tabela só-admin). Mapa canal_id → token. */
export async function listarCanalTokens(): Promise<Record<number, string>> {
  const { data, error } = await supabase
    .from("fran_canal_token")
    .select("canal_id, token");
  if (error) throw new Error(error.message);
  const mapa: Record<number, string> = {};
  for (const r of (data ?? []) as Array<{
    canal_id: number;
    token: string | null;
  }>) {
    mapa[r.canal_id] = r.token ?? "";
  }
  return mapa;
}

export async function salvarCanalToken(
  canalId: number,
  token: string
): Promise<void> {
  const { error } = await supabase
    .from("fran_canal_token")
    .upsert(
      { canal_id: canalId, token, updated_at: new Date().toISOString() },
      { onConflict: "canal_id" }
    );
  if (error) throw new Error(error.message);
}

export async function criarCanal(input: CanalInput): Promise<void> {
  const { error } = await supabase.from("fran_canais").insert({
    nome: input.nome,
    instancia: input.instancia,
    numero: input.numero ?? null,
    ativo: input.ativo ?? true,
    peso: input.peso ?? 1,
    ordem: input.ordem ?? 0,
  });
  if (error) throw new Error(error.message);
}

export async function atualizarCanal(
  id: number,
  patch: Partial<CanalInput>
): Promise<void> {
  const { error } = await supabase
    .from("fran_canais")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function removerCanal(id: number): Promise<void> {
  const { error } = await supabase.from("fran_canais").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
