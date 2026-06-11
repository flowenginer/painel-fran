import { useState } from "react";
import {
  KeyRound,
  Loader2,
  MoreVertical,
  Pencil,
  Trash2,
  UserPlus,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUsuarios } from "@/hooks/useUsuarios";
import { useUsuariosMutations } from "@/hooks/useUsuariosMutations";
import { useAuth } from "@/hooks/useAuth";
import { UsuarioDialog } from "@/components/usuarios/UsuarioDialog";
import { ResetSenhaDialog } from "@/components/usuarios/ResetSenhaDialog";
import type { UsuarioPerfil } from "@/lib/types";

export function Usuarios() {
  const { user } = useAuth();
  const { data: usuarios, isLoading, isError, error } = useUsuarios();
  const { remover } = useUsuariosMutations();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editar, setEditar] = useState<UsuarioPerfil | null>(null);
  const [resetar, setResetar] = useState<UsuarioPerfil | null>(null);
  const [removendo, setRemovendo] = useState<UsuarioPerfil | null>(null);

  function abrirNovo() {
    setEditar(null);
    setDialogOpen(true);
  }

  function abrirEdicao(u: UsuarioPerfil) {
    setEditar(u);
    setDialogOpen(true);
  }

  async function confirmarRemocao() {
    if (!removendo) return;
    try {
      await remover.mutateAsync(removendo.id);
      setRemovendo(null);
    } catch {
      /* toast já exibido */
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Usuários</h1>
          <p className="text-sm text-muted-foreground">
            Crie acessos e defina o que cada pessoa pode ver e fazer.
          </p>
        </div>
        <Button onClick={abrirNovo}>
          <UserPlus className="mr-2 h-4 w-4" />
          Novo usuário
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Equipe</CardTitle>
          <CardDescription>
            {usuarios?.length ?? 0} usuário(s) cadastrado(s)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Carregando...
            </div>
          )}

          {isError && (
            <p className="py-6 text-center text-sm text-destructive">
              {error instanceof Error
                ? error.message
                : "Falha ao carregar usuários."}
            </p>
          )}

          {!isLoading && !isError && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>E-mail</TableHead>
                    <TableHead>Papel</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Distribuição</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usuarios?.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">
                        {u.nome || "—"}
                        {u.id === user?.id && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            (você)
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {u.email}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={u.role === "admin" ? "default" : "secondary"}
                        >
                          {u.role === "admin" ? "Administrador" : "Operador"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {u.ativo ? (
                          <Badge variant="outline">Ativo</Badge>
                        ) : (
                          <Badge variant="destructive">Inativo</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {u.recebe_distribuicao ? "Sim" : "Não"}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => abrirEdicao(u)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setResetar(u)}>
                              <KeyRound className="mr-2 h-4 w-4" />
                              Redefinir senha
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              disabled={u.id === user?.id}
                              onSelect={() => setRemovendo(u)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Remover
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                  {usuarios?.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="py-6 text-center text-sm text-muted-foreground"
                      >
                        Nenhum usuário cadastrado.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <UsuarioDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        inicial={editar}
      />

      <ResetSenhaDialog
        open={!!resetar}
        onOpenChange={(o) => !o && setResetar(null)}
        usuario={resetar}
      />

      <Dialog
        open={!!removendo}
        onOpenChange={(o) => !o && setRemovendo(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Remover usuário</DialogTitle>
            <DialogDescription>
              Esta ação exclui o acesso de {removendo?.nome || removendo?.email}{" "}
              em definitivo. Não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRemovendo(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => void confirmarRemocao()}
              disabled={remover.isPending}
            >
              {remover.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
