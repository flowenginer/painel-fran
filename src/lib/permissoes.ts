// Catálogo de permissões granulares que o admin atribui aos operadores.
// Fonte única usada pelo filtro do menu, pelas rotas protegidas e pelo
// editor de permissões na tela de Usuários.
//
// "paginas" → controlam acesso às rotas/itens de menu (id = mesmo id do
//             item de navegação). "acoes" → controlam funcionalidades
//             específicas dentro das páginas (checadas via temPermissao).

export interface PermissaoDef {
  id: string;
  label: string;
  descricao?: string;
}

// Páginas atribuíveis a um operador. A página "usuarios" é exclusiva do
// admin e por isso NÃO entra aqui (não é delegável).
export const PAGINAS: PermissaoDef[] = [
  { id: "dashboard", label: "Dashboard", descricao: "Visão geral e devedores" },
  { id: "fila", label: "Fila de Disparo", descricao: "Fila de distribuição" },
  { id: "conversas", label: "Conversas", descricao: "Atendimento dos leads" },
  { id: "instituicoes", label: "Instituições" },
  { id: "whatsapp", label: "WhatsApp", descricao: "Conexão do número" },
  { id: "templates", label: "Templates WA", descricao: "Templates WhatsApp Business (Zernio)" },
  { id: "broadcasts", label: "Broadcasts", descricao: "Disparo em massa via template oficial" },
  { id: "configuracoes", label: "Configurações" },
];

// Ações/funcionalidades atribuíveis. São aplicadas nos componentes via
// temPermissao("acao", id). O enforcement de cada botão é feito de forma
// incremental conforme as fases avançam.
export const ACOES: PermissaoDef[] = [
  { id: "disparar", label: "Disparar mensagens", descricao: "Enviar disparos manuais" },
  { id: "adicionar_devedor", label: "Adicionar devedor" },
  { id: "editar_devedor", label: "Editar devedor" },
  { id: "remover_devedor", label: "Remover devedor" },
  { id: "gerenciar_fila", label: "Gerenciar fila", descricao: "Configurar e processar a fila" },
  { id: "gerenciar_broadcasts", label: "Gerenciar broadcasts", descricao: "Criar e disparar broadcasts" },
  { id: "gerenciar_instituicoes", label: "Gerenciar instituições" },
  { id: "gerenciar_whatsapp", label: "Gerenciar conexão WhatsApp" },
  { id: "gerenciar_config", label: "Alterar configurações" },
  { id: "transferir_conversa", label: "Transferir conversa" },
];
