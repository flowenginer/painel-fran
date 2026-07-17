import { LogOut } from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

function iniciais(email: string | undefined) {
  if (!email) return "?";
  return email.split("@")[0].slice(0, 2).toUpperCase();
}

export function Header() {
  const { user, perfil, isAdmin, signOut } = useAuth();
  const papel = isAdmin ? "Administradora" : perfil ? "Atendente" : "";

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur md:px-6">
      {/* Marca */}
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
          C
        </div>
        <div className="hidden sm:block">
          <p className="text-sm font-semibold leading-none">CRM Clínica</p>
          <p className="text-xs text-muted-foreground">Odontologia</p>
        </div>
      </div>

      <div className="flex-1" />

      {/* Usuário */}
      <div className="flex items-center gap-3">
        <div className="hidden text-right sm:block">
          <p className="text-sm font-medium leading-none">
            {perfil?.nome || papel || "Usuário"}
          </p>
          <p className="text-xs text-muted-foreground">{user?.email}</p>
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold">
          {iniciais(user?.email)}
        </div>
        <Button
          variant="ghost"
          size="icon"
          title="Sair"
          onClick={() => void signOut()}
        >
          <LogOut className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
}
