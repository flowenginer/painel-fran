// Importação em massa de devedores via planilha CSV/TSV.
//
// Fluxo em 3 etapas:
//   1) Upload: lê o CSV e extrai os pares (cod_credor, cod_devedor).
//   2) Consulta: chama a API Cedrus em paralelo controlado (3 simultâneas)
//      para cada par, com barra de progresso e possibilidade de cancelar.
//      Os dados (valor, telefones, endereço, etc.) vêm sempre frescos da
//      API — ignoramos os do CSV porque costumam estar desatualizados.
//   3) Importar: revisa quantos foram aceitos e insere em lote no banco
//      (dedup por CPF; CPFs já cadastrados são ignorados).
import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  RotateCw,
  Search,
  Upload,
  XCircle,
} from "lucide-react";

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
import { parseCsv } from "@/lib/csv-parser";
import {
  extrairCodigosDoCsv,
  transformarRespostasCedrus,
  type CodigoExtraido,
  type LinhaInvalida,
  type CandidatoDevedor,
} from "@/lib/csv-devedores";
import {
  buscarVariosDoCedrus,
  type ResultadoBuscaIndividual,
} from "@/lib/cedrus";
import { useToast } from "@/hooks/use-toast";
import { useInstituicoes } from "@/hooks/useInstituicoes";
import {
  useImportarDevedores,
  type ImportarDevedoresResult,
} from "@/hooks/useImportarDevedores";
import { formatBRL, formatCpfMascarado } from "@/lib/formatters";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Etapa = "upload" | "buscando" | "revisao" | "concluido";

const CONCORRENCIA_PADRAO = 3;

function nomeSeparador(sep: string): string {
  if (sep === "\t") return "tab";
  if (sep === ";") return "ponto-e-vírgula";
  if (sep === ",") return "vírgula";
  return `"${sep}"`;
}

export function ImportarDevedoresCsvDialog({ open, onOpenChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Etapa
  const [etapa, setEtapa] = useState<Etapa>("upload");

  // Upload + extração
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null);
  const [separador, setSeparador] = useState<string>(",");
  const [codigos, setCodigos] = useState<CodigoExtraido[]>([]);
  const [invalidosCsv, setInvalidosCsv] = useState<LinhaInvalida[]>([]);
  const [erroLeitura, setErroLeitura] = useState<string | null>(null);

  // Busca Cedrus
  const abortRef = useRef<AbortController | null>(null);
  const [progresso, setProgresso] = useState({ done: 0, total: 0 });
  const [resultadosCedrus, setResultadosCedrus] = useState<
    ResultadoBuscaIndividual[]
  >([]);
  // Re-tentativa dos itens que falharam com status="erro"
  const [retentando, setRetentando] = useState(false);
  const [progressoRetry, setProgressoRetry] = useState({ done: 0, total: 0 });

  // Revisão (após Cedrus)
  const [candidatos, setCandidatos] = useState<CandidatoDevedor[]>([]);
  const [invalidosTransform, setInvalidosTransform] = useState<
    { cod_credor: string; cod_devedor: string; nome: string; motivos: string[] }[]
  >([]);

  // Resultado final
  const [resultadoFinal, setResultadoFinal] =
    useState<ImportarDevedoresResult | null>(null);

  const { data: instituicoes } = useInstituicoes();
  const { mutateAsync: importar, isPending: importando } =
    useImportarDevedores();
  const { toast } = useToast();

  function reset() {
    setEtapa("upload");
    setNomeArquivo(null);
    setSeparador(",");
    setCodigos([]);
    setInvalidosCsv([]);
    setErroLeitura(null);
    setProgresso({ done: 0, total: 0 });
    setProgressoRetry({ done: 0, total: 0 });
    setRetentando(false);
    setResultadosCedrus([]);
    setCandidatos([]);
    setInvalidosTransform([]);
    setResultadoFinal(null);
    abortRef.current?.abort();
    abortRef.current = null;
    if (inputRef.current) inputRef.current.value = "";
  }

  // Recalcula candidatos + bloqueados a partir do array completo de
  // resultados da Cedrus. Usado depois da busca inicial e depois do retry.
  function recalcularRevisao(resultados: ResultadoBuscaIndividual[]) {
    const encontradosComCsv = resultados
      .map((r, idx) => ({ r, csv: codigos[idx] }))
      .filter(
        (x): x is { r: ResultadoBuscaIndividual; csv: CodigoExtraido } =>
          x.r.status === "encontrado" && Boolean(x.r.devedor)
      )
      .map(({ r, csv }) => ({
        cod_credor: csv.cod_credor,
        cod_devedor: csv.cod_devedor,
        categoria_csv: csv.categoria_csv,
        devedor: r.devedor!,
      }));
    const transform = transformarRespostasCedrus(
      encontradosComCsv,
      instituicoes ?? []
    );
    setCandidatos(transform.validos);
    setInvalidosTransform(transform.invalidos);
  }

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  }

  async function handleSelecionar(file: File) {
    setErroLeitura(null);
    setNomeArquivo(file.name);
    try {
      const texto = await file.text();
      const csv = parseCsv(texto);
      if (csv.linhas.length === 0) {
        setErroLeitura("Arquivo sem linhas de dados.");
        return;
      }
      const { codigos: cods, invalidos } = extrairCodigosDoCsv(csv.linhas);
      setSeparador(csv.separador);
      setCodigos(cods);
      setInvalidosCsv(invalidos);
    } catch (err) {
      setErroLeitura(
        err instanceof Error ? err.message : "Falha ao ler arquivo"
      );
    }
  }

  async function iniciarBusca() {
    if (codigos.length === 0) return;
    setEtapa("buscando");
    setProgresso({ done: 0, total: codigos.length });
    setResultadosCedrus([]);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const resultados = await buscarVariosDoCedrus(
        codigos.map((c) => ({
          cod_credor: c.cod_credor,
          cod_devedor: c.cod_devedor,
          linha: c.linha,
        })),
        {
          concorrencia: CONCORRENCIA_PADRAO,
          signal: ctrl.signal,
          onProgress: (done, total) => setProgresso({ done, total }),
        }
      );

      if (ctrl.signal.aborted) {
        setEtapa("upload");
        return;
      }

      setResultadosCedrus(resultados);
      recalcularRevisao(resultados);
      setEtapa("revisao");
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro durante consulta",
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
      setEtapa("upload");
    }
  }

  function cancelarBusca() {
    abortRef.current?.abort();
  }

  // Re-tenta apenas os itens cujo status atual é "erro" (falhas de rede,
  // timeouts da Cedrus, 502/504). Não toca em "nao_encontrado" — esses
  // a Cedrus retornou explicitamente que não existem.
  async function tentarNovamenteErros() {
    const indicesErro = resultadosCedrus
      .map((r, idx) => (r.status === "erro" ? idx : -1))
      .filter((i) => i >= 0);
    if (indicesErro.length === 0) return;

    setRetentando(true);
    setProgressoRetry({ done: 0, total: indicesErro.length });

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const novos = await buscarVariosDoCedrus(
        indicesErro.map((i) => ({
          cod_credor: codigos[i].cod_credor,
          cod_devedor: codigos[i].cod_devedor,
          linha: codigos[i].linha,
        })),
        {
          concorrencia: CONCORRENCIA_PADRAO,
          signal: ctrl.signal,
          onProgress: (done, total) =>
            setProgressoRetry({ done, total }),
        }
      );

      // Mescla os novos resultados nos índices originais
      const merged = resultadosCedrus.slice();
      indicesErro.forEach((idxOriginal, k) => {
        merged[idxOriginal] = novos[k];
      });

      setResultadosCedrus(merged);
      recalcularRevisao(merged);

      const aindaErros = novos.filter((r) => r.status === "erro").length;
      const recuperados = novos.length - aindaErros;
      toast({
        variant: recuperados > 0 ? "success" : "destructive",
        title: "Re-tentativa concluída",
        description:
          aindaErros === 0
            ? `${recuperados} recuperados, sem novos erros`
            : `${recuperados} recuperados, ${aindaErros} ainda com erro`,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro durante re-tentativa",
        description:
          err instanceof Error ? err.message : "Erro desconhecido",
      });
    } finally {
      setRetentando(false);
    }
  }

  async function confirmarImportacao() {
    if (candidatos.length === 0) return;
    try {
      const res = await importar({ candidatos });
      setResultadoFinal(res);
      setEtapa("concluido");
      const partes: string[] = [];
      if (res.inseridos > 0) partes.push(`${res.inseridos} cadastrados`);
      if (res.ignorados > 0) partes.push(`${res.ignorados} já existiam`);
      toast({
        variant: "success",
        title: "Importação concluída",
        description: partes.join(", "),
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro ao importar",
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
    }
  }

  // Stats da busca Cedrus
  const statsBusca = useMemo(() => {
    const encontrados = resultadosCedrus.filter(
      (r) => r.status === "encontrado"
    ).length;
    const naoEncontrados = resultadosCedrus.filter(
      (r) => r.status === "nao_encontrado"
    ).length;
    const erros = resultadosCedrus.filter((r) => r.status === "erro").length;
    return { encontrados, naoEncontrados, erros };
  }, [resultadosCedrus]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Importar devedores via planilha</DialogTitle>
          <DialogDescription>
            O sistema lê os códigos do CSV e busca os dados frescos na API
            Cedrus para cada devedor. CPFs já cadastrados são ignorados.
          </DialogDescription>
        </DialogHeader>

        {/* ====== ETAPA 1: UPLOAD ====== */}
        {etapa === "upload" && (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label className="text-xs">Arquivo CSV ou TSV</Label>
              <Input
                ref={inputRef}
                type="file"
                accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleSelecionar(f);
                }}
              />
              {nomeArquivo && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  {nomeArquivo}
                </p>
              )}
            </div>

            {erroLeitura && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{erroLeitura}</p>
              </div>
            )}

            {codigos.length > 0 && (
              <div className="space-y-2 rounded-md border bg-muted/20 p-3 text-sm">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-muted-foreground">Separador:</span>{" "}
                    <span className="font-mono">
                      {nomeSeparador(separador)}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">
                      Códigos extraídos:
                    </span>{" "}
                    <span className="font-medium">{codigos.length}</span>
                  </div>
                </div>

                {invalidosCsv.length > 0 && (
                  <div className="flex items-center gap-1.5 text-xs text-yellow-600 dark:text-yellow-400">
                    <AlertTriangle className="h-4 w-4" />
                    {invalidosCsv.length} linhas pulam por falta de CREDOR
                    ou COD_DEVEDOR
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  No próximo passo o sistema fará {codigos.length} consulta
                  {codigos.length !== 1 ? "s" : ""} à API Cedrus em
                  paralelo controlado ({CONCORRENCIA_PADRAO} por vez).
                  Estimativa: ~{Math.ceil(codigos.length * 0.7)}s.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ====== ETAPA 2: BUSCA EM ANDAMENTO ====== */}
        {etapa === "buscando" && (
          <div className="space-y-3">
            <div className="rounded-md border bg-muted/20 p-3">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 font-medium">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Consultando Cedrus...
                </span>
                <span className="tabular-nums">
                  {progresso.done}/{progresso.total}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
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
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {statsBusca.encontrados} encontrados
                </span>
                <span className="flex items-center gap-1 text-muted-foreground">
                  {statsBusca.naoEncontrados} não encontrados
                </span>
                <span className="flex items-center gap-1 text-destructive">
                  <XCircle className="h-3.5 w-3.5" />
                  {statsBusca.erros} erros
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ====== ETAPA 3: REVISÃO ====== */}
        {etapa === "revisao" && (
          <div className="space-y-3">
            <div className="rounded-md border bg-muted/20 p-3 text-sm">
              <p className="mb-2 font-medium">Resumo da consulta</p>
              <div className="flex flex-wrap items-center gap-4 text-xs">
                <span className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
                  <CheckCircle2 className="h-4 w-4" />
                  {statsBusca.encontrados} encontrados no Cedrus
                </span>
                {statsBusca.naoEncontrados > 0 && (
                  <span className="text-muted-foreground">
                    {statsBusca.naoEncontrados} não encontrados
                  </span>
                )}
                {statsBusca.erros > 0 && (
                  <span className="flex items-center gap-1.5 text-destructive">
                    <XCircle className="h-4 w-4" />
                    {statsBusca.erros} erros
                  </span>
                )}
              </div>

              {/* Botão de re-tentativa + barra de progresso */}
              {statsBusca.erros > 0 && !retentando && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                  <p className="text-xs text-muted-foreground">
                    Erros costumam ser transientes (timeout, 502). Vale
                    tentar de novo.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void tentarNovamenteErros()}
                  >
                    <RotateCw className="mr-2 h-4 w-4" />
                    Tentar novamente os {statsBusca.erros} erros
                  </Button>
                </div>
              )}

              {retentando && (
                <div className="mt-3 space-y-2 border-t pt-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Re-tentando erros...
                    </span>
                    <span className="tabular-nums">
                      {progressoRetry.done}/{progressoRetry.total}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{
                        width: `${
                          progressoRetry.total > 0
                            ? (progressoRetry.done / progressoRetry.total) *
                              100
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-md border bg-muted/20 p-3 text-sm">
              <p className="mb-2 font-medium">Após validar dados:</p>
              <div className="flex flex-wrap items-center gap-4 text-xs">
                <span className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
                  <CheckCircle2 className="h-4 w-4" />
                  {candidatos.length} prontos para importar
                </span>
                {invalidosTransform.length > 0 && (
                  <span className="flex items-center gap-1.5 text-yellow-600 dark:text-yellow-400">
                    <AlertTriangle className="h-4 w-4" />
                    {invalidosTransform.length} bloqueados
                  </span>
                )}
              </div>
            </div>

            {invalidosTransform.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  Ver bloqueados ({invalidosTransform.length})
                </summary>
                <ul className="mt-2 max-h-48 space-y-1 overflow-auto">
                  {invalidosTransform.slice(0, 100).map((it, i) => (
                    <li key={i} className="flex flex-wrap gap-2">
                      <span className="font-medium">{it.nome}</span>
                      <span className="font-mono text-muted-foreground">
                        cod_credor {it.cod_credor}/cod_devedor{" "}
                        {it.cod_devedor}
                      </span>
                      <span className="text-yellow-600 dark:text-yellow-400">
                        {it.motivos.join(", ")}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {candidatos.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  Ver primeiros 5 prontos
                </summary>
                <ul className="mt-2 space-y-1">
                  {candidatos.slice(0, 5).map((v) => (
                    <li key={v.cpf} className="flex flex-wrap gap-2">
                      <span className="font-medium">{v.nome_devedor}</span>
                      <span className="font-mono text-muted-foreground">
                        {formatCpfMascarado(v.cpf)}
                      </span>
                      <span className="text-muted-foreground">
                        · {v.instituicao}
                      </span>
                      <span className="font-mono text-muted-foreground">
                        · {formatBRL(v.valor_atualizado)}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        {/* ====== ETAPA 4: CONCLUÍDO ====== */}
        {etapa === "concluido" && resultadoFinal && (
          <div className="rounded-md border bg-muted/20 p-3 text-sm">
            <p className="mb-2 font-medium">Resumo final</p>
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-4 w-4" />
                {resultadoFinal.inseridos} cadastrados
              </span>
              {resultadoFinal.ignorados > 0 && (
                <span className="text-muted-foreground">
                  {resultadoFinal.ignorados} CPFs já existiam
                </span>
              )}
              {resultadoFinal.duplicadosNoLote > 0 && (
                <span className="flex items-center gap-1.5 text-yellow-600 dark:text-yellow-400">
                  <AlertTriangle className="h-4 w-4" />
                  {resultadoFinal.duplicadosNoLote} duplicados no CSV
                </span>
              )}
            </div>
          </div>
        )}

        {/* ====== FOOTER ====== */}
        <DialogFooter>
          {etapa === "upload" && (
            <>
              <Button
                variant="outline"
                onClick={() => handleClose(false)}
              >
                Cancelar
              </Button>
              <Button
                onClick={iniciarBusca}
                disabled={codigos.length === 0}
              >
                <Search className="mr-2 h-4 w-4" />
                Buscar {codigos.length} no Cedrus
              </Button>
            </>
          )}

          {etapa === "buscando" && (
            <Button variant="outline" onClick={cancelarBusca}>
              Cancelar consulta
            </Button>
          )}

          {etapa === "revisao" && (
            <>
              <Button
                variant="outline"
                onClick={() => handleClose(false)}
                disabled={importando}
              >
                Cancelar
              </Button>
              <Button
                onClick={confirmarImportacao}
                disabled={
                  candidatos.length === 0 || importando || retentando
                }
              >
                {importando ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                Importar {candidatos.length}
              </Button>
            </>
          )}

          {etapa === "concluido" && (
            <Button variant="outline" onClick={() => handleClose(false)}>
              Fechar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
