import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Pencil, Plus, Trash2 } from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { listarUnidades } from "@/lib/pacientes";
import {
  listarUsuarios,
  atualizarUsuario,
  resetarSenha,
  removerUsuario,
} from "@/lib/usuarios";
import { UsuarioDialog } from "@/components/usuarios/UsuarioDialog";
import type { UsuarioPerfil } from "@/lib/types";

export function Usuarios() {
  const { isAdmin, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formOpen, setFormOpen] = useState(false);
  const [editando, setEditando] = useState<UsuarioPerfil | null>(null);
  const [resetando, setResetando] = useState<UsuarioPerfil | null>(null);
  const [novaSenha, setNovaSenha] = useState("");
  const [removendo, setRemovendo] = useState<UsuarioPerfil | null>(null);
  const [carregando, setCarregando] = useState(false);

  const { data: usuarios, isLoading } = useQuery({
    queryKey: ["usuarios"],
    queryFn: listarUsuarios,
    enabled: isAdmin,
  });
  const { data: unidades } = useQuery({
    queryKey: ["unidades"],
    queryFn: listarUnidades,
    enabled: isAdmin,
  });

  const nomeUnidade = useMemo(() => {
    const m = new Map<number, string>();
    (unidades ?? []).forEach((u) => m.set(u.id, u.nome));
    return m;
  }, [unidades]);

  if (!isAdmin) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Usuários</h1>
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Área restrita a administradores.
        </div>
      </div>
    );
  }

  async function toggleAtivo(u: UsuarioPerfil) {
    try {
      await atualizarUsuario({ id: u.id, ativo: !u.ativo });
      await queryClient.invalidateQueries({ queryKey: ["usuarios"] });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro ao alterar status",
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
    }
  }

  async function confirmarReset() {
    if (!resetando) return;
    if (novaSenha.length < 6) {
      toast({ variant: "destructive", title: "Senha muito curta (mín. 6)" });
      return;
    }
    setCarregando(true);
    try {
      await resetarSenha(resetando.id, novaSenha);
      toast({ title: "Senha redefinida" });
      setResetando(null);
      setNovaSenha("");
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro ao redefinir",
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
    } finally {
      setCarregando(false);
    }
  }

  async function confirmarRemover() {
    if (!removendo) return;
    setCarregando(true);
    try {
      await removerUsuario(removendo.id);
      toast({ title: "Usuário removido" });
      setRemovendo(null);
      await queryClient.invalidateQueries({ queryKey: ["usuarios"] });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Não foi possível remover",
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Usuários</h1>
          <p className="text-sm text-muted-foreground">
            Atendentes e administradoras, por unidade e permissões.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditando(null);
            setFormOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          Novo usuário
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Equipe</CardTitle>
          <CardDescription>
            {isLoading ? "Carregando..." : `${usuarios?.length ?? 0} usuário(s)`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead>Nome</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Papel</TableHead>
                  <TableHead>Unidade</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-32 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usuarios?.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.nome || "—"}</TableCell>
                    <TableCell className="text-sm">{u.email}</TableCell>
                    <TableCell>
                      <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                        {u.role === "admin" ? "Admin" : "Atendente"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {u.role === "admin"
                        ? "Todas"
                        : (u.unidade_id != null &&
                            nomeUnidade.get(u.unidade_id)) ||
                          "—"}
                    </TableCell>
                    <TableCell>
                      <button type="button" onClick={() => toggleAtivo(u)}>
                        <Badge
                          variant={u.ativo ? "default" : "secondary"}
                          className="cursor-pointer"
                        >
                          {u.ativo ? "Ativo" : "Inativo"}
                        </Badge>
                      </button>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => {
                            setEditando(u);
                            setFormOpen(true);
                          }}
                          aria-label="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => {
                            setResetando(u);
                            setNovaSenha("");
                          }}
                          aria-label="Redefinir senha"
                        >
                          <KeyRound className="h-4 w-4" />
                        </Button>
                        {u.id !== user?.id && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => setRemovendo(u)}
                            aria-label="Remover"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {!isLoading && (usuarios?.length ?? 0) === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="h-24 text-center text-sm text-muted-foreground"
                    >
                      Nenhum usuário.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <UsuarioDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        inicial={editando}
      />

      {/* Reset de senha */}
      <Dialog
        open={!!resetando}
        onOpenChange={(o) => !o && setResetando(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Redefinir senha</DialogTitle>
            <DialogDescription>
              Nova senha para {resetando?.nome || resetando?.email}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Nova senha</Label>
            <Input
              type="password"
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              placeholder="mín. 6 caracteres"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setResetando(null)}
              disabled={carregando}
            >
              Cancelar
            </Button>
            <Button onClick={confirmarReset} disabled={carregando}>
              Redefinir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remover */}
      <Dialog open={!!removendo} onOpenChange={(o) => !o && setRemovendo(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Remover usuário?</DialogTitle>
            <DialogDescription>
              Esta ação exclui o acesso de {removendo?.nome || removendo?.email} e
              não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRemovendo(null)}
              disabled={carregando}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={confirmarRemover}
              disabled={carregando}
            >
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
