import { Building2, LayoutDashboard, Settings, Smartphone } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export const navItems: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/instituicoes", label: "Instituições", icon: Building2 },
  { to: "/whatsapp", label: "WhatsApp", icon: Smartphone },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
];
