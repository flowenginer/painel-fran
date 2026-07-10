import {
  Building2,
  LayoutDashboard,
  ListOrdered,
  FileText,
  MessageSquare,
  Settings,
  Smartphone,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  to: string;
  /** Identificador da página (casa com PAGINAS em lib/permissoes e com as permissoes do perfil). */
  id: string;
  label: string;
  icon: LucideIcon;
  /** Quando true, o item só aparece para administradores. */
  adminOnly?: boolean;
}

export const navItems: NavItem[] = [
  { to: "/dashboard", id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/fila", id: "fila", label: "Fila de Disparo", icon: ListOrdered },
  { to: "/conversas", id: "conversas", label: "Conversas", icon: MessageSquare },
  { to: "/instituicoes", id: "instituicoes", label: "Instituições", icon: Building2 },
  { to: "/whatsapp", id: "whatsapp", label: "WhatsApp", icon: Smartphone },
  { to: "/templates", id: "templates", label: "Templates WA", icon: FileText },
  { to: "/configuracoes", id: "configuracoes", label: "Configurações", icon: Settings },
  { to: "/usuarios", id: "usuarios", label: "Usuários", icon: Users, adminOnly: true },
];

/** Itens de navegação visíveis para o perfil atual. */
export function filtrarNavItems(
  isAdmin: boolean,
  temPermissao: (tipo: "pagina" | "acao", id: string) => boolean
): NavItem[] {
  return navItems.filter((item) =>
    item.adminOnly ? isAdmin : temPermissao("pagina", item.id)
  );
}
