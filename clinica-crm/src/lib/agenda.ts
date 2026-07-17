// Acesso a dados da Agenda: agendamentos + categorias de cor.
// RLS por unidade já filtra. Após cada mutação, dispara o sync com o Google
// (via Edge Function agenda-sync) em best-effort — se não estiver configurado,
// a Edge responde ok sem fazer nada.
import { supabase } from "@/lib/supabase";
import type {
  AgendaCategoria,
  AgendamentoComRelacoes,
  StatusAgendamento,
} from "@/lib/types";

const SELECT_AG =
  "id,unidade_id,paciente_id,categoria_id,titulo,descricao,inicio,fim,status," +
  "responsavel_id,criado_por,google_event_id,created_at,updated_at," +
  "paciente:pacientes(id,nome,telefone)," +
  "categoria:agenda_categorias(id,nome,google_color_id)";

// Dispara o sync com o Google (não bloqueia a UI se falhar).
function sincronizar(agendamentoId: number, acao: "upsert" | "delete") {
  void supabase.functions
    .invoke("agenda-sync", { body: { agendamento_id: agendamentoId, acao } })
    .catch(() => {
      /* best-effort: Google sync é opcional */
    });
}

export async function listarAgendamentos(
  deIso: string,
  ateIso: string,
): Promise<AgendamentoComRelacoes[]> {
  const { data, error } = await supabase
    .from("agendamentos")
    .select(SELECT_AG)
    .gte("inicio", deIso)
    .lte("inicio", ateIso)
    .order("inicio", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as AgendamentoComRelacoes[];
}

export async function listarCategorias(): Promise<AgendaCategoria[]> {
  const { data, error } = await supabase
    .from("agenda_categorias")
    .select("id,unidade_id,nome,google_color_id,ativo,created_at")
    .eq("ativo", true)
    .order("nome", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as AgendaCategoria[];
}

export interface AgendamentoInput {
  unidade_id: number;
  paciente_id?: number | null;
  categoria_id?: number | null;
  titulo: string;
  descricao?: string | null;
  inicio: string;
  fim: string;
  status?: StatusAgendamento;
  responsavel_id?: string | null;
}

export async function criarAgendamento(
  input: AgendamentoInput,
): Promise<AgendamentoComRelacoes> {
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("agendamentos")
    .insert({
      unidade_id: input.unidade_id,
      paciente_id: input.paciente_id ?? null,
      categoria_id: input.categoria_id ?? null,
      titulo: input.titulo.trim(),
      descricao: input.descricao?.trim() || null,
      inicio: input.inicio,
      fim: input.fim,
      status: input.status ?? "agendado",
      responsavel_id: input.responsavel_id ?? null,
      criado_por: userData.user?.id ?? null,
    })
    .select(SELECT_AG)
    .single();
  if (error) throw new Error(error.message);
  const linha = data as unknown as AgendamentoComRelacoes;
  sincronizar(linha.id, "upsert");
  return linha;
}

export async function atualizarAgendamento(
  id: number,
  patch: Partial<AgendamentoInput>,
): Promise<AgendamentoComRelacoes> {
  const linha: Record<string, unknown> = {};
  if (patch.paciente_id !== undefined) linha.paciente_id = patch.paciente_id;
  if (patch.categoria_id !== undefined) linha.categoria_id = patch.categoria_id;
  if (patch.titulo !== undefined) linha.titulo = patch.titulo.trim();
  if (patch.descricao !== undefined)
    linha.descricao = patch.descricao?.trim() || null;
  if (patch.inicio !== undefined) linha.inicio = patch.inicio;
  if (patch.fim !== undefined) linha.fim = patch.fim;
  if (patch.status !== undefined) linha.status = patch.status;
  if (patch.responsavel_id !== undefined)
    linha.responsavel_id = patch.responsavel_id;

  const { data, error } = await supabase
    .from("agendamentos")
    .update(linha)
    .eq("id", id)
    .select(SELECT_AG)
    .single();
  if (error) throw new Error(error.message);
  const row = data as unknown as AgendamentoComRelacoes;
  sincronizar(row.id, "upsert");
  return row;
}

export async function removerAgendamento(id: number): Promise<void> {
  sincronizar(id, "delete"); // avisa o Google antes de apagar localmente
  const { error } = await supabase.from("agendamentos").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
