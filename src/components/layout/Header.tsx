import { useState } from "react";
import { Bell, BellOff, LogOut, Menu, User as UserIcon } from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Sidebar } from "./Sidebar";

function iniciais(email: string | undefined) {
  if (!email) return "?";
  const nome = email.split("@")[0];
  return nome.slice(0, 2).toUpperCase();
}

/** Sino para ativar as notificações de desktop (Notification API). */
function BotaoNotificacao() {
  const suportado =
    typeof window !== "undefined" && "Notification" in window;
  const [perm, setPerm] = useState<NotificationPermission>(
    suportado ? Notification.permission : "denied"
  );
  if (!suportado) return null;

  if (perm === "granted") {
    return (
      <Button
        variant="ghost"
        size="icon"
        disabled
        title="Notificações ativadas"
      >
        <Bell className="h-5 w-5 text-primary" />
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      title={
        perm === "denied"
          ? "Notificações bloqueadas pelo navegador"
          : "Ativar notificações de novas mensagens"
      }
      onClick={() => void Notification.requestPermission().then(setPerm)}
    >
      <BellOff className="h-5 w-5 text-muted-foreground" />
    </Button>
  );
}

export function Header() {
  const { user, perfil, isAdmin, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const papelLabel = isAdmin
    ? "Administrador"
    : perfil
      ? "Operador"
      : "";

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:px-6">
      {/* Hamburger (mobile only) */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <SheetHeader className="border-b">
            <SheetTitle>Painel Fran</SheetTitle>
          </SheetHeader>
          <Sidebar onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Logo/brand */}
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-bold">
          F
        </div>
        <div className="hidden sm:block">
          <p className="text-sm font-semibold leading-none">Painel Fran</p>
          <p className="text-xs text-muted-foreground">Stival Advogados</p>
        </div>
      </div>

      <div className="flex-1" />

      <BotaoNotificacao />

      {/* User menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="gap-2 px-2">
            <Avatar className="h-8 w-8">
              <AvatarFallback>{iniciais(user?.email)}</AvatarFallback>
            </Avatar>
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {user?.email}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <div className="flex flex-col">
              <span className="text-sm font-medium">
                {perfil?.nome || papelLabel || "Usuário"}
              </span>
              <span className="text-xs font-normal text-muted-foreground truncate">
                {user?.email}
              </span>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled>
            <UserIcon className="mr-2 h-4 w-4" />
            Perfil
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void signOut()}>
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
