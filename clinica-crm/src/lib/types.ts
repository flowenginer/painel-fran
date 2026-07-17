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

// ---------------------------------------------------------------------------
// Inbox (fase 3): canais, conversas, mensagens
// ---------------------------------------------------------------------------

// Provedor do canal de WhatsApp.
//  - uazapi: não-oficial (via n8n) — atendimento
//  - zernio: oficial (Meta Cloud API) — captação + atribuição de anúncio
export type CanalTipo = "uazapi" | "zernio";

export interface Canal {
  id: number;
  unidade_id: number;
  nome: string;
  tipo: CanalTipo;
  instancia: string;
  numero: string | null;
  zernio_account_id: string | null;
  ativo: boolean;
  conectado: boolean;
  status_em: string | null;
  created_at: string;
  updated_at: string;
}

export type StatusConversa = "aberta" | "resolvida";
export type DirecaoMensagem = "in" | "out";
export type TipoMensagem =
  | "texto"
  | "imagem"
  | "audio"
  | "video"
  | "documento";

export interface Conversa {
  id: number;
  unidade_id: number;
  paciente_id: number | null;
  canal_id: number | null;
  telefone: string;
  responsavel_id: string | null;
  status: StatusConversa;
  ultima_mensagem_at: string | null;
  ultima_mensagem_preview: string | null;
  ultima_direcao: DirecaoMensagem | null;
  nao_lida: boolean;
  janela_expira_at: string | null;
  created_at: string;
  updated_at: string;
}

// Conversa + dados do paciente/canal para exibição na lista.
export interface ConversaComPaciente extends Conversa {
  paciente: Pick<Paciente, "id" | "nome" | "status_funil"> | null;
  canal: Pick<Canal, "id" | "nome" | "tipo"> | null;
}

export interface Mensagem {
  id: number;
  conversa_id: number;
  unidade_id: number;
  direcao: DirecaoMensagem;
  tipo: TipoMensagem;
  conteudo: string | null;
  media_url: string | null;
  media_mime: string | null;
  enviado_por: string | null;
  provider_msg_id: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Agenda (fase 5)
// ---------------------------------------------------------------------------

export interface AgendaCategoria {
  id: number;
  unidade_id: number;
  nome: string;
  google_color_id: number;
  ativo: boolean;
  created_at: string;
}

export type StatusAgendamento =
  | "agendado"
  | "confirmado"
  | "compareceu"
  | "faltou"
  | "cancelado";

export interface Agendamento {
  id: number;
  unidade_id: number;
  paciente_id: number | null;
  categoria_id: number | null;
  titulo: string;
  descricao: string | null;
  inicio: string;
  fim: string;
  status: StatusAgendamento;
  responsavel_id: string | null;
  criado_por: string | null;
  google_event_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgendamentoComRelacoes extends Agendamento {
  paciente: Pick<Paciente, "id" | "nome" | "telefone"> | null;
  categoria: Pick<AgendaCategoria, "id" | "nome" | "google_color_id"> | null;
}
