import { useState } from "react";
import { Pencil, Plus, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useInstituicoes } from "@/hooks/useInstituicoes";
import {
  useAtualizarInstituicao,
  useRemoverInstituicao,
} from "@/hooks/useInstituicoesMutations";
import { useToast } from "@/hooks/use-toast";
import { InstituicaoDialog } from "@/components/instituicoes/InstituicaoDialog";
import { ImportarCsvDialog } from "@/components/instituicoes/ImportarCsvDialog";
import type { Instituicao } from "@/lib/types";

export function Instituicoes() {
  const { data, isLoading, isError } = useInstituicoes();
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editando, setEditando] = useState<Instituicao | null>(null);
  const [removendo, setRemovendo] = useState<Instituicao | null>(null);

  const { mutateAsync: atualizar } = useAtualizarInstituicao();
  const { mutateAsync: remover, isPending: removendoMut } =
    useRemoverInstituicao();
  const { toast } = useToast();

  function abrirNova() {
    setEditando(null);
    setFormOpen(true);
  }

  function abrirEdicao(inst: Instituicao) {
    setEditando(inst);
    setFormOpen(true);
  }

  async function toggleAtivo(inst: Instituicao) {
    try {
      await atualizar({
        id: inst.id,
        input: {
          cod_credor: inst.cod_credor,
          nome: inst.nome,
          ativo: !inst.ativo,
        },
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro ao alterar status",
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
    }
  }

  async function confirmarRemover() {
    if (!removendo) return;
    try {
      await remover({ id: removendo.id, nome: removendo.nome });
      toast({ variant: "success", title: "Instituição removida" });
      setRemovendo(null);
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
          <h1 className="text-2xl font-bold tracking-tight">Instituições</h1>
          <p className="text-sm text-muted-foreground">
            Mapeamento de cod_credor → nome legível usado na importação.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Importar CSV
          </Button>
          <Button onClick={abrirNova}>
            <Plus className="mr-2 h-4 w-4" />
            Nova instituição
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lista</CardTitle>
          <CardDescription>
            {data
              ? `${data.length} instituição(ões) cadastradas`
              : "Carregando..."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead>Código</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Atualizado em</TableHead>
                  <TableHead className="w-28 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading &&
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Skeleton className="h-4 w-16" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-48" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-16 rounded-full" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-24" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="ml-auto h-8 w-20 rounded-md" />
                      </TableCell>
                    </TableRow>
                  ))}
                {isError && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="h-24 text-center text-sm text-destructive"
                    >
                      Erro ao carregar
                    </TableCell>
                  </TableRow>
                )}
                {data?.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="h-32 text-center text-sm text-muted-foreground"
                    >
                      Nenhuma instituição cadastrada. Elas são criadas
                      automaticamente na importação quando um cod_credor novo
                      aparece, ou você pode adicionar manualmente.
                    </TableCell>
                  </TableRow>
                )}
                {data?.map((inst) => (
                  <TableRow key={inst.id}>
                    <TableCell className="font-mono text-sm">
                      {inst.cod_credor}
                    </TableCell>
                    <TableCell className="font-medium">{inst.nome}</TableCell>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => toggleAtivo(inst)}
                        title={`Clique para ${inst.ativo ? "desativar" : "ativar"}`}
                      >
                        <Badge
                          variant={inst.ativo ? "default" : "secondary"}
                          className="cursor-pointer"
                        >
                          {inst.ativo ? "Ativa" : "Inativa"}
                        </Badge>
                      </button>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(inst.updated_at).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => abrirEdicao(inst)}
                          aria-label="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => setRemovendo(inst)}
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

      <InstituicaoDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        inicial={editando}
      />

      <ImportarCsvDialog open={importOpen} onOpenChange={setImportOpen} />

      <Dialog
        open={!!removendo}
        onOpenChange={(open) => !open && setRemovendo(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Remover instituição?</DialogTitle>
            <DialogDescription>
              Esta ação não pode ser desfeita. A remoção falhará se houver
              devedores vinculados a esta instituição.
            </DialogDescription>
          </DialogHeader>
          {removendo && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p>
                <strong>{removendo.nome}</strong>
              </p>
              <p className="text-xs text-muted-foreground">
                cod_credor: {removendo.cod_credor}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRemovendo(null)}
              disabled={removendoMut}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={confirmarRemover}
              disabled={removendoMut}
            >
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
