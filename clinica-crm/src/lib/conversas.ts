// Acesso a dados do inbox: conversas + mensagens.
// RLS por unidade já filtra (admin vê todas; atendente só a sua).
// A ESCRITA de mensagens é feita pelas Edge Functions (fase 3b) — o front só lê.
import { supabase } from "@/lib/supabase";
import type { ConversaComPaciente, Mensagem } from "@/lib/types";

const SELECT_CONVERSA =
  "id,unidade_id,paciente_id,canal_id,telefone,responsavel_id,status," +
  "ultima_mensagem_at,ultima_mensagem_preview,ultima_direcao,nao_lida," +
  "janela_expira_at,created_at,updated_at," +
  "paciente:pacientes(id,nome,status_funil)," +
  "canal:canais(id,nome,tipo)";

export interface ListarConversasFiltro {
  /** Só não-lidas. */
  naoLidas?: boolean;
  /** Filtra por tipo de canal (oficial/não-oficial). */
  canalTipo?: "uazapi" | "zernio" | null;
  busca?: string | null;
}

export async function listarConversas(
  filtro: ListarConversasFiltro = {},
): Promise<ConversaComPaciente[]> {
  let query = supabase
    .from("conversas")
    .select(SELECT_CONVERSA)
    .order("ultima_mensagem_at", { ascending: false, nullsFirst: false });

  if (filtro.naoLidas) query = query.eq("nao_lida", true);

  const termo = filtro.busca?.trim();
  if (termo) {
    const digitos = termo.replace(/\D/g, "");
    if (digitos) query = query.ilike("telefone", `%${digitos}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  let linhas = (data ?? []) as unknown as ConversaComPaciente[];

  // Filtro por tipo de canal e busca por nome do paciente ficam no client
  // (a busca por nome cruza a tabela relacionada).
  if (filtro.canalTipo) {
    linhas = linhas.filter((c) => c.canal?.tipo === filtro.canalTipo);
  }
  const termoNome = filtro.busca?.trim().toLowerCase();
  if (termoNome && !/\d/.test(termoNome)) {
    linhas = linhas.filter((c) =>
      (c.paciente?.nome ?? "").toLowerCase().includes(termoNome),
    );
  }
  return linhas;
}

export async function listarMensagens(conversaId: number): Promise<Mensagem[]> {
  const { data, error } = await supabase
    .from("mensagens")
    .select(
      "id,conversa_id,unidade_id,direcao,tipo,conteudo,media_url,media_mime," +
        "enviado_por,provider_msg_id,created_at",
    )
    .eq("conversa_id", conversaId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Mensagem[];
}

// Marca a conversa como lida (permitido pela RLS de UPDATE por unidade).
export async function marcarConversaLida(conversaId: number): Promise<void> {
  const { error } = await supabase
    .from("conversas")
    .update({ nao_lida: false })
    .eq("id", conversaId);
  if (error) throw new Error(error.message);
}

// Atribui/transfere a conversa a uma atendente.
export async function atribuirConversa(
  conversaId: number,
  responsavelId: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("conversas")
    .update({ responsavel_id: responsavelId })
    .eq("id", conversaId);
  if (error) throw new Error(error.message);
}
