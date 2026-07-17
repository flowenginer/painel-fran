// Catálogo de permissões granulares que a admin (dona) atribui às atendentes.
// Fonte única usada pelo menu, pelas rotas protegidas e pelo editor de
// permissões na tela de Usuários.
//
// "paginas" → acesso às rotas/itens de menu (id = id do item de navegação).
// "acoes"   → funcionalidades específicas dentro das páginas (via temPermissao).

export interface PermissaoDef {
  id: string;
  label: string;
  descricao?: string;
}

// Páginas atribuíveis. "usuarios" é exclusiva da admin (não entra aqui).
export const PAGINAS: PermissaoDef[] = [
  { id: "dashboard", label: "Dashboard", descricao: "Visão geral e conversão" },
  { id: "pacientes", label: "Pacientes", descricao: "Leads e pacientes" },
  { id: "conversas", label: "Conversas", descricao: "Atendimento dos leads (inbox)" },
  { id: "agenda", label: "Agenda", descricao: "Agendamentos (Google Calendar)" },
  { id: "configuracoes", label: "Configurações" },
];

// Ações/funcionalidades atribuíveis (aplicadas via temPermissao("acao", id)).
export const ACOES: PermissaoDef[] = [
  { id: "adicionar_paciente", label: "Adicionar paciente/lead" },
  { id: "editar_paciente", label: "Editar cadastro do paciente" },
  { id: "remover_paciente", label: "Remover paciente" },
  { id: "agendar", label: "Agendar (criar/editar agendamentos)" },
  { id: "transferir_conversa", label: "Transferir conversa" },
  { id: "gerenciar_config", label: "Alterar configurações" },
];
