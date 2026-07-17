// Acesso a dados de pacientes/leads e unidades.
// A RLS do Supabase já filtra por unidade (admin vê todas; atendente só a sua),
// então aqui não precisamos amarrar unidade_id nas leituras.
import { supabase } from "@/lib/supabase";
import { normalizarTelefone } from "@/lib/formatters";
import type { Paciente, StatusFunil, Unidade } from "@/lib/types";

const SELECT_PACIENTE =
  "id,unidade_id,telefone,nome,email,procedimento,status_funil,responsavel_id," +
  "origem_campanha,origem_criativo,origem_anuncio_id," +
  "data_primeiro_contato,data_ultimo_contato,created_at,updated_at";

export interface ListarPacientesFiltro {
  status?: StatusFunil | null;
  busca?: string | null;
}

export async function listarPacientes(
  filtro: ListarPacientesFiltro = {},
): Promise<Paciente[]> {
  let query = supabase
    .from("pacientes")
    .select(SELECT_PACIENTE)
    .order("updated_at", { ascending: false });

  if (filtro.status) {
    query = query.eq("status_funil", filtro.status);
  }

  const termo = filtro.busca?.trim();
  if (termo) {
    // Busca por nome (case-insensitive) OU por dígitos do telefone.
    const digitos = termo.replace(/\D/g, "");
    if (digitos) {
      query = query.or(`nome.ilike.%${termo}%,telefone.ilike.%${digitos}%`);
    } else {
      query = query.ilike("nome", `%${termo}%`);
    }
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Paciente[];
}

export interface CriarPacienteInput {
  unidade_id: number;
  telefone: string;
  nome?: string | null;
  email?: string | null;
  procedimento?: string | null;
  status_funil?: StatusFunil;
  responsavel_id?: string | null;
}

// Pré-cadastro exige só telefone + unidade. Os demais campos entram na edição.
export async function criarPaciente(
  input: CriarPacienteInput,
): Promise<Paciente> {
  const telefone = normalizarTelefone(input.telefone);
  if (!telefone) throw new Error("Telefone inválido");

  const agora = new Date().toISOString();
  const linha = {
    unidade_id: input.unidade_id,
    telefone,
    nome: input.nome?.trim() || null,
    email: input.email?.trim() || null,
    procedimento: input.procedimento?.trim() || null,
    status_funil: input.status_funil ?? "lead_novo",
    responsavel_id: input.responsavel_id ?? null,
    data_primeiro_contato: agora,
    data_ultimo_contato: agora,
  };

  const { data, error } = await supabase
    .from("pacientes")
    .insert(linha)
    .select(SELECT_PACIENTE)
    .single();

  if (error) {
    // Telefone único por unidade → colisão vira mensagem amigável.
    if (error.code === "23505") {
      throw new Error("Já existe um paciente com esse telefone nesta unidade.");
    }
    throw new Error(error.message);
  }
  return data as unknown as Paciente;
}

export interface AtualizarPacienteInput {
  telefone?: string;
  nome?: string | null;
  email?: string | null;
  procedimento?: string | null;
  status_funil?: StatusFunil;
  responsavel_id?: string | null;
  unidade_id?: number;
}

export async function atualizarPaciente(
  id: number,
  patch: AtualizarPacienteInput,
): Promise<Paciente> {
  const linha: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (patch.telefone !== undefined) {
    const tel = normalizarTelefone(patch.telefone);
    if (!tel) throw new Error("Telefone inválido");
    linha.telefone = tel;
  }
  if (patch.nome !== undefined) linha.nome = patch.nome?.trim() || null;
  if (patch.email !== undefined) linha.email = patch.email?.trim() || null;
  if (patch.procedimento !== undefined)
    linha.procedimento = patch.procedimento?.trim() || null;
  if (patch.status_funil !== undefined) linha.status_funil = patch.status_funil;
  if (patch.responsavel_id !== undefined)
    linha.responsavel_id = patch.responsavel_id;
  if (patch.unidade_id !== undefined) linha.unidade_id = patch.unidade_id;

  const { data, error } = await supabase
    .from("pacientes")
    .update(linha)
    .eq("id", id)
    .select(SELECT_PACIENTE)
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new Error("Já existe um paciente com esse telefone nesta unidade.");
    }
    throw new Error(error.message);
  }
  return data as unknown as Paciente;
}

export async function removerPaciente(id: number): Promise<void> {
  const { error } = await supabase.from("pacientes").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function listarUnidades(): Promise<Unidade[]> {
  const { data, error } = await supabase
    .from("unidades")
    .select("id,nome,ativo,created_at")
    .order("nome", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Unidade[];
}
