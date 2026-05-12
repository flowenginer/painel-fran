// Upload em massa de devedores via planilha CSV/TSV.
// Mapeia colunas no formato Cedrus (CREDOR, COD_DEVEDOR, NOME_DEVEDOR,
// CNPJ_CPF, CATEGORIA, EMAIL, DT_VENCIMENTO, SALDO, FONE_1..FONE_10)
// para o schema da fran_devedores.
import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Upload,
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
  mapearCsvParaCandidatos,
  type MapeamentoResultado,
} from "@/lib/csv-devedores";
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

interface Preview extends MapeamentoResultado {
  total: number;
  separador: string;
  nomeArquivo: string;
}

function nomeSeparador(sep: string): string {
  if (sep === "\t") return "tab";
  if (sep === ";") return "ponto-e-vírgula";
  if (sep === ",") return "vírgula";
  return `"${sep}"`;
}

export function ImportarDevedoresCsvDialog({ open, onOpenChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [erroLeitura, setErroLeitura] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ImportarDevedoresResult | null>(
    null
  );

  const { data: instituicoes } = useInstituicoes();
  const { mutateAsync, isPending } = useImportarDevedores();
  const { toast } = useToast();

  function reset() {
    setPreview(null);
    setErroLeitura(null);
    setResultado(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  }

  async function handleSelecionar(file: File) {
    setErroLeitura(null);
    setResultado(null);
    try {
      const texto = await file.text();
      const csv = parseCsv(texto);
      if (csv.linhas.length === 0) {
        setErroLeitura("Arquivo sem linhas de dados.");
        return;
      }
      const mapeamento = mapearCsvParaCandidatos(
        csv.linhas,
        instituicoes ?? []
      );
      setPreview({
        ...mapeamento,
        total: csv.linhas.length,
        separador: csv.separador,
        nomeArquivo: file.name,
      });
    } catch (err) {
      setErroLeitura(
        err instanceof Error ? err.message : "Falha ao ler arquivo"
      );
    }
  }

  async function confirmar() {
    if (!preview || preview.validos.length === 0) return;
    try {
      const res = await mutateAsync({ candidatos: preview.validos });
      setResultado(res);
      const partes: string[] = [];
      if (res.inseridos > 0) partes.push(`${res.inseridos} cadastrados`);
      if (res.ignorados > 0) partes.push(`${res.ignorados} CPFs já existiam`);
      if (res.duplicadosNoLote > 0)
        partes.push(`${res.duplicadosNoLote} duplicatas no CSV`);
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

  const podeConfirmar = useMemo(
    () =>
      preview !== null &&
      preview.validos.length > 0 &&
      !isPending &&
      !resultado,
    [preview, isPending, resultado]
  );

  // Agrupa motivos de inválidos por motivo (pra mostrar resumo).
  const resumoInvalidos = useMemo(() => {
    if (!preview) return [];
    const conta = new Map<string, number>();
    for (const inv of preview.invalidos) {
      for (const m of inv.motivos) {
        conta.set(m, (conta.get(m) ?? 0) + 1);
      }
    }
    return Array.from(conta.entries()).sort((a, b) => b[1] - a[1]);
  }, [preview]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Importar devedores via planilha</DialogTitle>
          <DialogDescription>
            Formato Cedrus: colunas <strong>CREDOR</strong>,{" "}
            <strong>COD_DEVEDOR</strong>, <strong>NOME_DEVEDOR</strong>,{" "}
            <strong>CNPJ_CPF</strong>, <strong>SALDO</strong>,{" "}
            <strong>DT_VENCIMENTO</strong>, <strong>EMAIL</strong>,{" "}
            <strong>FONE_1..FONE_10</strong>. CPFs já cadastrados são
            ignorados.
          </DialogDescription>
        </DialogHeader>

        {/* Upload */}
        {!resultado && (
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
            {preview?.nomeArquivo && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <FileSpreadsheet className="h-3.5 w-3.5" />
                {preview.nomeArquivo}
              </p>
            )}
          </div>
        )}

        {/* Erro de leitura */}
        {erroLeitura && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{erroLeitura}</p>
          </div>
        )}

        {/* Preview */}
        {preview && !erroLeitura && !resultado && (
          <div className="space-y-3 rounded-md border bg-muted/20 p-3 text-sm">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-muted-foreground">Separador:</span>{" "}
                <span className="font-mono">
                  {nomeSeparador(preview.separador)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Total de linhas:</span>{" "}
                <span className="font-medium">{preview.total}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-4 w-4" />
                {preview.validos.length} válidos
              </span>
              {preview.invalidos.length > 0 && (
                <span className="flex items-center gap-1.5 text-yellow-600 dark:text-yellow-400">
                  <AlertTriangle className="h-4 w-4" />
                  {preview.invalidos.length} pulados
                </span>
              )}
            </div>

            {/* Resumo de motivos de inválidos */}
            {resumoInvalidos.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  Motivos dos pulados
                </summary>
                <ul className="mt-2 space-y-1">
                  {resumoInvalidos.map(([motivo, n]) => (
                    <li key={motivo} className="flex gap-2">
                      <span className="text-muted-foreground">{n}×</span>
                      <span>{motivo}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {/* Credores não mapeados */}
            {preview.credoresNaoMapeados.length > 0 && (
              <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 p-2 text-xs">
                <p className="font-medium text-yellow-700 dark:text-yellow-400">
                  Cadastre estes credores em Instituições primeiro:
                </p>
                <p className="mt-1 font-mono text-muted-foreground">
                  {preview.credoresNaoMapeados.join(", ")}
                </p>
              </div>
            )}

            {/* Primeiros 5 válidos */}
            {preview.validos.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  Ver primeiros 5 válidos
                </summary>
                <ul className="mt-2 space-y-1">
                  {preview.validos.slice(0, 5).map((v) => (
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

            {/* Lista detalhada de inválidos */}
            {preview.invalidos.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  Ver linhas puladas em detalhe ({preview.invalidos.length})
                </summary>
                <ul className="mt-2 space-y-1 max-h-48 overflow-auto">
                  {preview.invalidos.slice(0, 100).map((inv) => (
                    <li key={inv.linha} className="flex flex-wrap gap-2">
                      <span className="text-muted-foreground">
                        L{inv.linha}
                      </span>
                      <span className="font-medium">{inv.nome}</span>
                      <span className="text-yellow-600 dark:text-yellow-400">
                        {inv.motivos.join(", ")}
                      </span>
                    </li>
                  ))}
                  {preview.invalidos.length > 100 && (
                    <li className="text-muted-foreground">
                      (mais {preview.invalidos.length - 100} linhas...)
                    </li>
                  )}
                </ul>
              </details>
            )}
          </div>
        )}

        {/* Resultado pós-importação */}
        {resultado && (
          <div className="space-y-2 rounded-md border bg-muted/20 p-3 text-sm">
            <p className="font-medium">Resumo</p>
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-4 w-4" />
                {resultado.inseridos} cadastrados
              </span>
              {resultado.ignorados > 0 && (
                <span className="text-muted-foreground">
                  {resultado.ignorados} CPFs já existiam
                </span>
              )}
              {resultado.duplicadosNoLote > 0 && (
                <span className="flex items-center gap-1.5 text-yellow-600 dark:text-yellow-400">
                  <AlertTriangle className="h-4 w-4" />
                  {resultado.duplicadosNoLote} duplicados no CSV
                </span>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleClose(false)}
            disabled={isPending}
          >
            {resultado ? "Fechar" : "Cancelar"}
          </Button>
          {!resultado && (
            <Button onClick={confirmar} disabled={!podeConfirmar}>
              {isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              Importar {preview?.validos.length ?? 0}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
