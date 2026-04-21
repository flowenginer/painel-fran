// Tabela de resultados da busca por credor. Cada linha mostra o devedor
// normalizado e oferece o botão "Ver / Editar" para abrir a revisão.
import { ArrowLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBRL, formatCpf } from "@/lib/formatters";
import type { CedrusBuscarResponse } from "@/lib/cedrus";
import type { DevedorNormalizado, Instituicao } from "@/lib/types";

interface Props {
  resposta: CedrusBuscarResponse;
  instituicoes: Instituicao[];
  onRevisar: (d: DevedorNormalizado) => void;
  onVoltar: () => void;
  onCarregarProxima: () => void;
}

export function ResultadosTabela({
  resposta,
  instituicoes,
  onRevisar,
  onVoltar,
  onCarregarProxima,
}: Props) {
  const mapaInst = new Map(
    instituicoes.map((i) => [i.cod_credor, i.nome] as const)
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {resposta.devedores.length} devedor(es) encontrados · página{" "}
          {resposta.pagina}
        </p>
        <Button variant="ghost" size="sm" onClick={onVoltar}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Nova busca
        </Button>
      </div>

      <div className="rounded-md border max-h-[50vh] overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead>Nome</TableHead>
              <TableHead>CPF</TableHead>
              <TableHead>Instituição</TableHead>
              <TableHead className="text-right">Valor atualizado</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {resposta.devedores.map((d, i) => {
              const nomeInst = d.cod_credor
                ? mapaInst.get(d.cod_credor)
                : undefined;
              return (
                <TableRow key={`${d.cpf}-${i}`}>
                  <TableCell className="font-medium">
                    {d.nome_devedor || "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {formatCpf(d.cpf)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {nomeInst ? (
                      nomeInst
                    ) : (
                      <span className="text-yellow-600 dark:text-yellow-400 text-xs">
                        ⚠ cod_credor {d.cod_credor ?? "?"} (novo)
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatBRL(d.valor_atualizado)}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {d.telefone || (
                      <span className="text-destructive">sem celular</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRevisar(d)}
                    >
                      Revisar
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {resposta.possuiProximaPagina && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={onCarregarProxima}>
            Carregar próxima página
          </Button>
        </div>
      )}
    </div>
  );
}
