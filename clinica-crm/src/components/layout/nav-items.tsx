import {
  CalendarDays,
  LayoutDashboard,
  MessageSquare,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  to: string;
  /** id da página (casa com PAGINAS em lib/permissoes e com as permissoes do perfil). */
  id: string;
  label: string;
  icon: LucideIcon;
  /** Quando true, o item só aparece para administradores. */
  adminOnly?: boolean;
}

export const navItems: NavItem[] = [
  { to: "/dashboard", id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/pacientes", id: "pacientes", label: "Pacientes", icon: Users },
  { to: "/conversas", id: "conversas", label: "Conversas", icon: MessageSquare },
  { to: "/agenda", id: "agenda", label: "Agenda", icon: CalendarDays },
  { to: "/configuracoes", id: "configuracoes", label: "Configurações", icon: Settings },
  { to: "/usuarios", id: "usuarios", label: "Usuários", icon: ShieldCheck, adminOnly: true },
];

/** Itens de navegação visíveis para o perfil atual. */
export function filtrarNavItems(
  isAdmin: boolean,
  temPermissao: (tipo: "pagina" | "acao", id: string) => boolean,
): NavItem[] {
  return navItems.filter((item) =>
    item.adminOnly ? isAdmin : temPermissao("pagina", item.id),
  );
}
