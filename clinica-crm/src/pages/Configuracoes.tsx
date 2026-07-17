import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { listarCanais, removerCanal } from "@/lib/canais";
import { formatTelefone } from "@/lib/formatters";
import { CanalDialog } from "@/components/config/CanalDialog";
import type { Canal } from "@/lib/types";

export function Configuracoes() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formOpen, setFormOpen] = useState(false);
  const [editando, setEditando] = useState<Canal | null>(null);
  const [removendo, setRemovendo] = useState<Canal | null>(null);

  const { data: canais, isLoading } = useQuery({
    queryKey: ["canais"],
    queryFn: listarCanais,
    enabled: isAdmin,
  });

  if (!isAdmin) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Área restrita a administradores.
        </div>
      </div>
    );
  }

  async function confirmarRemover() {
    if (!removendo) return;
    try {
      await removerCanal(removendo.id);
      toast({ title: "Canal removido" });
      setRemovendo(null);
      await queryClient.invalidateQueries({ queryKey: ["canais"] });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Não foi possível remover",
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
          <p className="text-sm text-muted-foreground">
            Canais de WhatsApp (oficial e não-oficial) por unidade.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditando(null);
            setFormOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          Novo canal
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Canais</CardTitle>
          <CardDescription>
            {isLoading ? "Carregando..." : `${canais?.length ?? 0} canal(is)`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead>Nome</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Instância / accountId</TableHead>
                  <TableHead>Número</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!isLoading && (canais?.length ?? 0) === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="h-32 text-center text-sm text-muted-foreground"
                    >
                      Nenhum canal cadastrado. Clique em "Novo canal".
                    </TableCell>
                  </TableRow>
                )}
                {canais?.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.nome}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          c.tipo === "zernio"
                            ? "border-emerald-500/40 text-emerald-600"
                            : "border-pink-500/40 text-pink-600"
                        }
                      >
                        {c.tipo === "zernio" ? "Oficial" : "Não-oficial"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {c.tipo === "zernio" ? c.zernio_account_id : c.instancia}
                    </TableCell>
                    <TableCell className="text-sm">
                      {c.numero ? formatTelefone(c.numero) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={c.ativo ? "default" : "secondary"}>
                        {c.ativo ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => {
                            setEditando(c);
                            setFormOpen(true);
                          }}
                          aria-label="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => setRemovendo(c)}
                          aria-label="Remover"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <CanalDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        inicial={editando}
      />

      <Dialog
        open={!!removendo}
        onOpenChange={(open) => !open && setRemovendo(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Remover canal?</DialogTitle>
            <DialogDescription>
              As conversas ligadas a ele ficam sem canal até serem reatribuídas.
            </DialogDescription>
          </DialogHeader>
          {removendo && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p className="font-medium">{removendo.nome}</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemovendo(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmarRemover}>
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
