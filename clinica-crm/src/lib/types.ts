// Tipos das tabelas do Supabase (usuarios, unidades, pacientes).
// Fundação do CRM da clínica — multi-unidade.

// Papéis de acesso.
//  - admin: dona da clínica; enxerga TODAS as unidades.
//  - atendente: recepção; enxerga só a(s) unidade(s) dela (via unidade_id).
export type UsuarioRole = "admin" | "atendente";

// Permissões granulares que o admin atribui às atendentes.
export interface UsuarioPermissoes {
  paginas: string[];
  acoes: string[];
}

// Unidade da clínica (multi-unidade).
export interface Unidade {
  id: number;
  nome: string;
  ativo: boolean;
  created_at: string;
}

// Perfil do usuário (tabela usuarios, 1:1 com auth.users).
export interface UsuarioPerfil {
  id: string;
  nome: string | null;
  email: string | null;
  role: UsuarioRole;
  ativo: boolean;
  /** Unidade da atendente. null para admin (vê todas). */
  unidade_id: number | null;
  permissoes: UsuarioPermissoes;
  created_at: string;
  updated_at: string;
}

// Etapas do funil do paciente/lead.
export type StatusFunil =
  | "lead_novo" // chegou pelo tráfego, ainda não atendido
  | "em_atendimento" // atendente conversando
  | "agendou" // visita marcada
  | "compareceu" // veio à clínica
  | "paciente" // cadastro completo, virou paciente
  | "perdido"; // sem resposta / desistiu

// Paciente/lead (tabela pacientes). Pré-cadastro = só telefone + origem;
// cadastro completo = nome, email, procedimento etc.
export interface Paciente {
  id: number;
  unidade_id: number;
  // Contato
  telefone: string;
  nome: string | null;
  email: string | null;
  procedimento: string | null;
  // Funil / atribuição
  status_funil: StatusFunil;
  /** Atendente dona do lead (auth.users.id). Atribuída no 1º contato. */
  responsavel_id: string | null;
  // Atribuição de anúncio (Click-to-WhatsApp) — preenchido em fase futura.
  origem_campanha: string | null;
  origem_criativo: string | null;
  origem_anuncio_id: string | null;
  // Datas
  data_primeiro_contato: string | null;
  data_ultimo_contato: string | null;
  created_at: string;
  updated_at: string;
}
