import { NavLink } from "react-router-dom";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { filtrarNavItems } from "./nav-items";

interface SidebarProps {
  onNavigate?: () => void;
  /** Modo recolhido: só ícones. */
  colapsado?: boolean;
  /** Botão de recolher/expandir (só aparece no desktop). */
  onToggle?: () => void;
}

export function Sidebar({ onNavigate, colapsado, onToggle }: SidebarProps) {
  const { isAdmin, temPermissao } = useAuth();
  const itens = filtrarNavItems(isAdmin, temPermissao);

  return (
    <nav className="flex h-full flex-col gap-1 p-2">
      {onToggle && (
        <button
          type="button"
          onClick={onToggle}
          title={colapsado ? "Expandir menu" : "Recolher menu"}
          className={cn(
            "mb-1 flex items-center rounded-md px-2 py-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            colapsado ? "justify-center" : "justify-end"
          )}
        >
          {colapsado ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>
      )}

      {itens.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          title={colapsado ? item.label : undefined}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              colapsado && "justify-center px-2",
              isActive
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )
          }
        >
          <item.icon className="h-4 w-4 shrink-0" />
          {!colapsado && item.label}
        </NavLink>
      ))}
    </nav>
  );
}
