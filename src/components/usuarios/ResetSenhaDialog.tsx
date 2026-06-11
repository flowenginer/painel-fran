import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUsuariosMutations } from "@/hooks/useUsuariosMutations";
import type { UsuarioPerfil } from "@/lib/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  usuario: UsuarioPerfil | null;
}

export function ResetSenhaDialog({ open, onOpenChange, usuario }: Props) {
  const { resetarSenha } = useUsuariosMutations();
  const [password, setPassword] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPassword("");
      setErro(null);
    }
  }, [open]);

  async function salvar() {
    if (!usuario) return;
    if (password.length < 6) {
      return setErro("A senha deve ter no mínimo 6 caracteres.");
    }
    try {
      await resetarSenha.mutateAsync({ id: usuario.id, password });
      onOpenChange(false);
    } catch {
      /* toast já exibido */
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Redefinir senha</DialogTitle>
          <DialogDescription>
            Defina uma nova senha para {usuario?.nome || usuario?.email}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="reset-senha">Nova senha</Label>
          <Input
            id="reset-senha"
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mínimo 6 caracteres"
            autoComplete="new-password"
          />
          {erro && <p className="text-xs text-destructive">{erro}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => void salvar()}
            disabled={resetarSenha.isPending}
          >
            {resetarSenha.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Redefinir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
