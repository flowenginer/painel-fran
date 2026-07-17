import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { cn } from "@/lib/utils";
import { formatTelefone, formatTempoRelativo } from "@/lib/formatters";
import { ETAPAS_FUNIL, etapaFunil } from "@/lib/pacientes-funil";
import { listarPacientes, removerPaciente } from "@/lib/pacientes";
import { PacienteDialog } from "@/components/pacientes/PacienteDialog";
import type { Paciente, StatusFunil } from "@/lib/types";

export function Pacientes() {
  const { temPermissao, isAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [status, setStatus] = useState<StatusFunil | null>(null);
  const [busca, setBusca] = useState("");
  const [buscaAtiva, setBuscaAtiva] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editando, setEditando] = useState<Paciente | null>(null);
  const [removendo, setRemovendo] = useState<Paciente | null>(null);
  const [removendoLoading, setRemovendoLoading] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["pacientes", status, buscaAtiva],
    queryFn: () => listarPacientes({ status, busca: buscaAtiva }),
  });

  const podeAdicionar = temPermissao("acao", "adicionar_paciente");
  const podeEditar = temPermissao("acao", "editar_paciente");
  const podeRemover = temPermissao("acao", "remover_paciente");

  const total = data?.length ?? 0;

  const etapasOrdenadas = useMemo(
    () => [...ETAPAS_FUNIL].sort((a, b) => a.ordem - b.ordem),
    [],
  );

  function abrirNovo() {
    setEditando(null);
    setFormOpen(true);
  }

  function abrirEdicao(p: Paciente) {
    setEditando(p);
    setFormOpen(true);
  }

  function aplicarBusca() {
    setBuscaAtiva(busca);
  }

  async function confirmarRemover() {
    if (!removendo) return;
    setRemovendoLoading(true);
    try {
      await removerPaciente(removendo.id);
      toast({ title: "Paciente removido" });
      setRemovendo(null);
      await queryClient.invalidateQueries({ queryKey: ["pacientes"] });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Não foi possível remover",
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
    } finally {
      setRemovendoLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pacientes</h1>
          <p className="text-sm text-muted-foreground">
            Leads e pacientes da clínica (pré-cadastro → cadastro completo).
          </p>
        </div>
        {podeAdicionar && (
          <Button onClick={abrirNovo}>
            <Plus className="mr-2 h-4 w-4" />
            Novo paciente
          </Button>
        )}
      </div>

      {/* Filtro por etapa do funil */}
      <div className="flex flex-wrap gap-2">
        <FiltroChip
          ativo={status === null}
          onClick={() => setStatus(null)}
          label="Todos"
        />
        {etapasOrdenadas.map((e) => (
          <FiltroChip
            key={e.id}
            ativo={status === e.id}
            onClick={() => setStatus(e.id)}
            label={e.label}
          />
        ))}
      </div>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Lista</CardTitle>
              <CardDescription>
                {isLoading ? "Carregando..." : `${total} paciente(s)`}
              </CardDescription>
            </div>
            <div className="flex w-full max-w-xs items-center gap-2">
              <Input
                placeholder="Buscar por nome ou telefone"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && aplicarBusca()}
              />
              <Button variant="outline" size="icon" onClick={aplicarBusca}>
                <Search className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead>Paciente</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Etapa</TableHead>
                  {isAdmin && <TableHead>Unidade</TableHead>}
                  <TableHead>Atualizado</TableHead>
                  <TableHead className="w-24 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading &&
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Skeleton className="h-4 w-40" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-28" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-20 rounded-full" />
                      </TableCell>
                      {isAdmin && (
                        <TableCell>
                          <Skeleton className="h-4 w-16" />
                        </TableCell>
                      )}
                      <TableCell>
                        <Skeleton className="h-4 w-16" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="ml-auto h-8 w-16 rounded-md" />
                      </TableCell>
                    </TableRow>
                  ))}

                {isError && (
                  <TableRow>
                    <TableCell
                      colSpan={isAdmin ? 6 : 5}
                      className="h-24 text-center text-sm text-destructive"
                    >
                      Erro ao carregar pacientes
                    </TableCell>
                  </TableRow>
                )}

                {!isLoading && !isError && total === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={isAdmin ? 6 : 5}
                      className="h-32 text-center text-sm text-muted-foreground"
                    >
                      Nenhum paciente encontrado.
                      {podeAdicionar &&
                        ' Clique em "Novo paciente" para começar um pré-cadastro.'}
                    </TableCell>
                  </TableRow>
                )}

                {data?.map((p) => {
                  const etapa = etapaFunil(p.status_funil);
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">
                        {p.nome ? (
                          p.nome
                        ) : (
                          <span className="text-muted-foreground italic">
                            Pré-cadastro
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {formatTelefone(p.telefone)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={etapa.variant} className={etapa.className}>
                          {etapa.label}
                        </Badge>
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="text-sm text-muted-foreground">
                          #{p.unidade_id}
                        </TableCell>
                      )}
                      <TableCell className="text-xs text-muted-foreground">
                        {formatTempoRelativo(p.updated_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex gap-1">
                          {podeEditar && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => abrirEdicao(p)}
                              aria-label="Editar"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {podeRemover && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => setRemovendo(p)}
                              aria-label="Remover"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <PacienteDialog
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
            <DialogTitle>Remover paciente?</DialogTitle>
            <DialogDescription>
              Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          {removendo && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p className="font-medium">
                {removendo.nome || "Pré-cadastro"}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatTelefone(removendo.telefone)}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRemovendo(null)}
              disabled={removendoLoading}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={confirmarRemover}
              disabled={removendoLoading}
            >
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FiltroChip({
  ativo,
  onClick,
  label,
}: {
  ativo: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-sm transition-colors",
        ativo
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input bg-background text-muted-foreground hover:bg-muted",
      )}
    >
      {label}
    </button>
  );
}
