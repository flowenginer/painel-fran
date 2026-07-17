import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listarUnidades } from "@/lib/pacientes";
import { criarUsuario, atualizarUsuario } from "@/lib/usuarios";
import { PAGINAS, ACOES } from "@/lib/permissoes";
import type { UsuarioPerfil } from "@/lib/types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  inicial: UsuarioPerfil | null;
}

export function UsuarioDialog({ open, onOpenChange, inicial }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const editando = !!inicial;

  const { data: unidades } = useQuery({
    queryKey: ["unidades"],
    queryFn: listarUnidades,
    enabled: open,
    staleTime: 1000 * 60 * 5,
  });

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nome, setNome] = useState("");
  const [role, setRole] = useState<"admin" | "atendente">("atendente");
  const [unidadeId, setUnidadeId] = useState("");
  const [paginas, setPaginas] = useState<string[]>([]);
  const [acoes, setAcoes] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEmail(inicial?.email ?? "");
    setPassword("");
    setNome(inicial?.nome ?? "");
    setRole(inicial?.role ?? "atendente");
    setUnidadeId(inicial?.unidade_id ? String(inicial.unidade_id) : "");
    setPaginas(inicial?.permissoes?.paginas ?? []);
    setAcoes(inicial?.permissoes?.acoes ?? []);
  }, [open, inicial]);

  function toggle(lista: string[], set: (v: string[]) => void, id: string) {
    set(lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]);
  }

  async function salvar() {
    if (!editando && (!email.trim() || password.length < 6)) {
      toast({
        variant: "destructive",
        title: "Dados incompletos",
        description: "E-mail e senha (mín. 6 caracteres) são obrigatórios.",
      });
      return;
    }
    if (role === "atendente" && !unidadeId) {
      toast({ variant: "destructive", title: "Selecione a unidade da atendente" });
      return;
    }
    setSalvando(true);
    try {
      const permissoes = { paginas, acoes };
      const unidade = role === "admin" ? null : Number(unidadeId);
      if (editando && inicial) {
        await atualizarUsuario({
          id: inicial.id,
          nome,
          role,
          unidade_id: unidade,
          permissoes,
        });
      } else {
        await criarUsuario({
          email,
          password,
          nome,
          role,
          unidade_id: unidade,
          permissoes,
        });
      }
      await queryClient.invalidateQueries({ queryKey: ["usuarios"] });
      toast({ title: editando ? "Usuário atualizado" : "Usuário criado" });
      onOpenChange(false);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
    } finally {
      setSalvando(false);
    }
  }

  const ehAtendente = role === "atendente";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editando ? "Editar usuário" : "Novo usuário"}</DialogTitle>
          <DialogDescription>
            {editando
              ? "Papel, unidade e permissões. (Para trocar a senha, use o menu da lista.)"
              : "Crie o acesso da atendente e defina o que ela pode ver e fazer."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Papel</Label>
              <Select
                value={role}
                onValueChange={(v) => setRole(v as "admin" | "atendente")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="atendente">Atendente</SelectItem>
                  <SelectItem value="admin">Administradora</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {!editando && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>E-mail</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Senha</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="mín. 6 caracteres"
                />
              </div>
            </div>
          )}

          {ehAtendente && (
            <div className="space-y-2">
              <Label>Unidade</Label>
              <Select value={unidadeId} onValueChange={setUnidadeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a unidade" />
                </SelectTrigger>
                <SelectContent>
                  {(unidades ?? []).map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>
                      {u.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {ehAtendente ? (
            <div className="space-y-3">
              <div>
                <p className="mb-1.5 text-sm font-medium">Páginas que pode ver</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {PAGINAS.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={paginas.includes(p.id)}
                        onChange={() => toggle(paginas, setPaginas, p.id)}
                      />
                      {p.label}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-sm font-medium">Ações permitidas</p>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {ACOES.map((a) => (
                    <label key={a.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={acoes.includes(a.id)}
                        onChange={() => toggle(acoes, setAcoes, a.id)}
                      />
                      {a.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <p className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
              Administradoras têm acesso total a todas as unidades e páginas.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={salvando}
          >
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={salvando}>
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
