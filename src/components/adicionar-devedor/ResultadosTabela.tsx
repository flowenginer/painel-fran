// Tabela de resultados da busca por credor. Suporta seleção múltipla e
// salvamento em lote (TASK-015) ou revisão individual (TASK-013/014).
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Loader2,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { formatBRL, formatCpf } from "@/lib/formatters";
import type { CedrusBuscarResponse } from "@/lib/cedrus";
import type { DevedorNormalizado, Instituicao } from "@/lib/types";
import { processarLote, type ResumoLote } from "./salvar-lote";

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
  const mapaInst = useMemo(
    () => new Map(instituicoes.map((i) => [i.cod_credor, i.nome] as const)),
    [instituicoes]
  );

  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [salvando, setSalvando] = useState(false);
  const [progresso, setProgresso] = useState({ done: 0, total: 0 });
  const [resumo, setResumo] = useState<ResumoLote | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Reseta seleção ao carregar nova página
  useEffect(() => {
    setSelecionados(new Set());
    setResumo(null);
  }, [resposta]);

  const todosSelecionados =
    resposta.devedores.length > 0 &&
    selecionados.size === resposta.devedores.length;

  function toggleTodos() {
    if (todosSelecionados) {
      setSelecionados(new Set());
    } else {
      setSelecionados(new Set(resposta.devedores.map((_, i) => i)));
    }
  }

  function toggleUm(idx: number) {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  async function handleSalvarSelecionados() {
    const lista = Array.from(selecionados)
      .sort((a, b) => a - b)
      .map((i) => resposta.devedores[i]);

    if (lista.length === 0) return;

    setSalvando(true);
    setProgresso({ done: 0, total: lista.length });
    setResumo(null);

    try {
      const resultado = await processarLote(lista, instituicoes, (done, total) =>
        setProgresso({ done, total })
      );
      setResumo(resultado);
      queryClient.invalidateQueries({ queryKey: ["devedores"] });
      queryClient.invalidateQueries({ queryKey: ["kpis"] });

      const partes = [];
      if (resultado.salvos > 0) partes.push(`${resultado.salvos} salvos`);
      if (resultado.revisao > 0)
        partes.push(`${resultado.revisao} para revisão`);
      if (resultado.erros > 0) partes.push(`${resultado.erros} erros`);
      toast({
        variant: resultado.erros > 0 ? "destructive" : "success",
        title: "Salvamento em lote concluído",
        description: partes.join(", "),
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro ao salvar lote",
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {resposta.devedores.length} devedor(es) · página {resposta.pagina}
          {selecionados.size > 0 && (
            <span className="ml-2 font-medium text-foreground">
              ({selecionados.size} selecionado
              {selecionados.size !== 1 ? "s" : ""})
            </span>
          )}
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onVoltar}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Nova busca
          </Button>
          <Button
            size="sm"
            onClick={handleSalvarSelecionados}
            disabled={selecionados.size === 0 || salvando}
          >
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar selecionados ({selecionados.size})
          </Button>
        </div>
      </div>

      {/* Barra de progresso */}
      {salvando && (
        <div className="rounded-md border bg-muted/20 p-3">
          <p className="mb-2 text-sm">
            Salvando {progresso.done}/{progresso.total}...
          </p>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{
                width: `${
                  progresso.total > 0
                    ? (progresso.done / progresso.total) * 100
                    : 0
                }%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Resumo do lote */}
      {resumo && (
        <ResumoLoteCard resumo={resumo} />
      )}

      <div className="rounded-md border max-h-[50vh] overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="w-10">
                <Checkbox
                  checked={todosSelecionados}
                  onCheckedChange={toggleTodos}
                  aria-label="Selecionar todos"
                />
              </TableHead>
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
                  <TableCell>
                    <Checkbox
                      checked={selecionados.has(i)}
                      onCheckedChange={() => toggleUm(i)}
                      aria-label={`Selecionar ${d.nome_devedor}`}
                    />
                  </TableCell>
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

      {resposta.possuiProximaPagina && !salvando && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={onCarregarProxima}>
            Carregar próxima página
          </Button>
        </div>
      )}
    </div>
  );
}

function ResumoLoteCard({ resumo }: { resumo: ResumoLote }) {
  const revisao = resumo.items.filter((i) => i.status === "revisao");
  const erros = resumo.items.filter((i) => i.status === "erro");

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-4 text-sm">
        {resumo.salvos > 0 && (
          <span className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
            <CheckCircle2 className="h-4 w-4" />
            {resumo.salvos} salvos
          </span>
        )}
        {resumo.revisao > 0 && (
          <span className="flex items-center gap-1.5 text-yellow-600 dark:text-yellow-400">
            <AlertTriangle className="h-4 w-4" />
            {resumo.revisao} requerem revisão manual
          </span>
        )}
        {resumo.erros > 0 && (
          <span className="flex items-center gap-1.5 text-destructive">
            <XCircle className="h-4 w-4" />
            {resumo.erros} erros
          </span>
        )}
      </div>

      {(revisao.length > 0 || erros.length > 0) && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Ver detalhes
          </summary>
          <ul className="mt-2 space-y-1">
            {revisao.map((it, idx) => (
              <li key={`r-${idx}`} className="flex gap-2">
                <span className="text-yellow-600 dark:text-yellow-400">⚠</span>
                <span className="font-medium">{it.nome}</span>
                <span className="text-muted-foreground">
                  — {"motivo" in it ? it.motivo : ""}
                </span>
              </li>
            ))}
            {erros.map((it, idx) => (
              <li key={`e-${idx}`} className="flex gap-2">
                <span className="text-destructive">✕</span>
                <span className="font-medium">{it.nome}</span>
                <span className="text-muted-foreground">
                  — {"erro" in it ? it.erro : ""}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
