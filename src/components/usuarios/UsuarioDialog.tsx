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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PermissoesEditor } from "./PermissoesEditor";
import { useUsuariosMutations } from "@/hooks/useUsuariosMutations";
import type { UsuarioPerfil, UsuarioPermissoes, UsuarioRole } from "@/lib/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Quando presente, o diálogo edita; senão, cria. */
  inicial?: UsuarioPerfil | null;
}

const PERMISSOES_VAZIAS: UsuarioPermissoes = { paginas: [], acoes: [] };

export function UsuarioDialog({ open, onOpenChange, inicial }: Props) {
  const isEdit = !!inicial;
  const { criar, atualizar } = useUsuariosMutations();

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UsuarioRole>("operador");
  const [ativo, setAtivo] = useState(true);
  const [recebeDistribuicao, setRecebeDistribuicao] = useState(true);
  const [permissoes, setPermissoes] =
    useState<UsuarioPermissoes>(PERMISSOES_VAZIAS);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setNome(inicial?.nome ?? "");
    setEmail(inicial?.email ?? "");
    setPassword("");
    setRole(inicial?.role ?? "operador");
    setAtivo(inicial?.ativo ?? true);
    setRecebeDistribuicao(inicial?.recebe_distribuicao ?? true);
    setPermissoes(inicial?.permissoes ?? PERMISSOES_VAZIAS);
    setErro(null);
  }, [open, inicial]);

  const salvando = criar.isPending || atualizar.isPending;
  const ehAdmin = role === "admin";

  async function salvar() {
    setErro(null);
    const nomeTrim = nome.trim();
    const emailTrim = email.trim();

    if (!isEdit) {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailTrim)) {
        return setErro("Informe um e-mail válido.");
      }
      if (password.length < 6) {
        return setErro("A senha deve ter no mínimo 6 caracteres.");
      }
    }

    try {
      if (isEdit && inicial) {
        await atualizar.mutateAsync({
          id: inicial.id,
          nome: nomeTrim || null,
          role,
          ativo,
          recebe_distribuicao: recebeDistribuicao,
          permissoes,
        });
      } else {
        await criar.mutateAsync({
          email: emailTrim,
          password,
          nome: nomeTrim || null,
          role,
          recebe_distribuicao: recebeDistribuicao,
          permissoes,
        });
      }
      onOpenChange(false);
    } catch {
      /* o toast de erro já é exibido pela mutation */
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar usuário" : "Novo usuário"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Atualize o papel, o status e as permissões deste usuário."
              : "Crie o acesso e defina o que este usuário poderá ver e fazer."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="u-nome">Nome</Label>
              <Input
                id="u-nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome do usuário"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="u-email">E-mail</Label>
              <Input
                id="u-email"
                type="email"
                value={email}
                disabled={isEdit}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@email.com"
              />
              {isEdit && (
                <p className="text-xs text-muted-foreground">
                  O e-mail não pode ser alterado por aqui.
                </p>
              )}
            </div>
          </div>

          {!isEdit && (
            <div className="space-y-2">
              <Label htmlFor="u-senha">Senha inicial</Label>
              <Input
                id="u-senha"
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                autoComplete="new-password"
              />
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Papel</Label>
              <Select
                value={role}
                onValueChange={(v) => setRole(v as UsuarioRole)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="operador">Operador</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col justify-end gap-3 pb-1">
              {isEdit && (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={ativo}
                    onCheckedChange={(c) => setAtivo(c === true)}
                  />
                  Usuário ativo
                </label>
              )}
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={recebeDistribuicao}
                  onCheckedChange={(c) => setRecebeDistribuicao(c === true)}
                />
                Recebe leads na distribuição
              </label>
            </div>
          </div>

          <div className="rounded-md border p-3">
            <PermissoesEditor
              value={permissoes}
              onChange={setPermissoes}
              disabled={ehAdmin}
            />
          </div>

          {erro && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2">
              <p className="text-xs text-destructive">{erro}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void salvar()} disabled={salvando}>
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? "Salvar" : "Criar usuário"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
