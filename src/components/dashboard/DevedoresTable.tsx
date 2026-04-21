import { useState } from "react";
import { ChevronLeft, ChevronRight, MoreHorizontal, Inbox } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatBRL,
  formatCpfMascarado,
  formatTempoRelativo,
} from "@/lib/formatters";
import { useDevedores, PAGE_SIZE } from "@/hooks/useDevedores";
import { StatusBadge } from "./StatusBadge";

export function DevedoresTable() {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, error } = useDevedores({ page });

  const devedores = data?.devedores ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  const inicio = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const fim = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="space-y-3">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead>Nome</TableHead>
              <TableHead>CPF</TableHead>
              <TableHead>Instituição</TableHead>
              <TableHead className="text-right">Valor atualizado</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Último contato</TableHead>
              <TableHead className="w-12 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <SkeletonRows />}

            {isError && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="h-32 text-center text-sm text-destructive"
                >
                  Erro ao carregar devedores:{" "}
                  {error instanceof Error ? error.message : "desconhecido"}
                </TableCell>
              </TableRow>
            )}

            {!isLoading && !isError && devedores.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="h-48">
                  <div className="flex flex-col items-center justify-center gap-2 py-6 text-muted-foreground">
                    <Inbox className="h-8 w-8" />
                    <p className="text-sm font-medium">
                      Nenhum devedor cadastrado
                    </p>
                    <p className="text-xs">
                      Use "Adicionar Devedor" para importar do Cedrus ou
                      cadastrar manualmente.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            )}

            {!isLoading &&
              !isError &&
              devedores.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">
                    {d.nome_devedor || "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {formatCpfMascarado(d.cpf)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {d.instituicao || (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatBRL(d.valor_atualizado)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={d.status_negociacao} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatTempoRelativo(d.data_ultimo_contato)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      disabled
                      aria-label="Ações"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      {/* Paginação */}
      <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
        <p>
          {isLoading
            ? "Carregando..."
            : total === 0
              ? "Nenhum resultado"
              : `${inicio}–${fim} de ${total}`}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={isLoading || page <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline ml-1">Anterior</span>
          </Button>
          <span className="text-xs tabular-nums">
            Página {page} de {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={isLoading || page >= totalPages}
          >
            <span className="hidden sm:inline mr-1">Próxima</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell>
            <Skeleton className="h-4 w-40" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-28" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-32" />
          </TableCell>
          <TableCell className="text-right">
            <Skeleton className="ml-auto h-4 w-20" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-5 w-24 rounded-full" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-16" />
          </TableCell>
          <TableCell className="text-right">
            <Skeleton className="ml-auto h-8 w-8 rounded-md" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}
