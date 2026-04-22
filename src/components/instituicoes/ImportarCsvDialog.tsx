// Upload em massa de instituições via arquivo CSV/TSV.
// Mapeamento mínimo: COD_CREDOR e NOME_CREDOR do arquivo.
// Cod_credor já existente é ignorado; novos são inseridos com ativo=true.
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
import { useToast } from "@/hooks/use-toast";
import {
  useImportarInstituicoes,
  type ImportarEmLoteResult,
} from "@/hooks/useInstituicoesMutations";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Preview {
  total: number;
  validos: { cod_credor: string; nome: string }[];
  invalidos: number;
  colunas: string[];
  colunaCodCredor: string | null;
  colunaNome: string | null;
  separador: string;
}

// Nomes aceitos para os campos obrigatórios (case-insensitive).
const NOMES_COD = ["cod_credor", "codigo_credor", "codigo", "cod"];
const NOMES_NOME = ["nome_credor", "nome", "credor", "instituicao"];

function extrairPreview(texto: string): Preview {
  const { headers, linhas, separador } = parseCsv(texto);
  const colunaCodCredor =
    headers.find((h) => NOMES_COD.includes(h)) ?? null;
  const colunaNome =
    headers.find((h) => NOMES_NOME.includes(h)) ?? null;

  const validos: Preview["validos"] = [];
  let invalidos = 0;

  if (colunaCodCredor && colunaNome) {
    for (const linha of linhas) {
      const cod = (linha[colunaCodCredor] ?? "").trim();
      const nome = (linha[colunaNome] ?? "").trim();
      if (cod && nome) validos.push({ cod_credor: cod, nome });
      else invalidos++;
    }
  }

  return {
    total: linhas.length,
    validos,
    invalidos,
    colunas: headers,
    colunaCodCredor,
    colunaNome,
    separador,
  };
}

function nomeSeparador(sep: string): string {
  if (sep === "\t") return "tab";
  if (sep === ";") return "ponto-e-vírgula";
  if (sep === ",") return "vírgula";
  return `"${sep}"`;
}

export function ImportarCsvDialog({ open, onOpenChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [erroLeitura, setErroLeitura] = useState<string | null>(null);
  const [resultado, setResultado] =
    useState<ImportarEmLoteResult | null>(null);

  const { mutateAsync, isPending } = useImportarInstituicoes();
  const { toast } = useToast();

  function reset() {
    setNomeArquivo(null);
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
    setNomeArquivo(file.name);
    try {
      const texto = await file.text();
      const p = extrairPreview(texto);
      setPreview(p);
      if (!p.colunaCodCredor || !p.colunaNome) {
        setErroLeitura(
          "Não encontrei colunas 'COD_CREDOR' e 'NOME_CREDOR' no arquivo. Verifique o cabeçalho."
        );
      }
    } catch (err) {
      setPreview(null);
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
      if (res.ignorados > 0) partes.push(`${res.ignorados} já existiam`);
      if (res.invalidos > 0) partes.push(`${res.invalidos} inválidos`);
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

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar instituições via CSV</DialogTitle>
          <DialogDescription>
            O arquivo precisa ter colunas <strong>COD_CREDOR</strong> e{" "}
            <strong>NOME_CREDOR</strong>. Instituições com cod_credor já
            cadastrado são ignoradas. Outros campos da planilha (CNPJ,
            endereço, etc.) não são importados por ora.
          </DialogDescription>
        </DialogHeader>

        {/* Upload */}
        {!resultado && (
          <div className="space-y-2">
            <Label className="text-xs">Arquivo CSV ou TSV</Label>
            <div className="flex items-center gap-2">
              <Input
                ref={inputRef}
                type="file"
                accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleSelecionar(f);
                }}
                className="flex-1"
              />
            </div>
            {nomeArquivo && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <FileSpreadsheet className="h-3.5 w-3.5" />
                {nomeArquivo}
              </p>
            )}
          </div>
        )}

        {/* Erro de leitura */}
        {erroLeitura && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <p>{erroLeitura}</p>
          </div>
        )}

        {/* Preview */}
        {preview && !erroLeitura && !resultado && (
          <div className="rounded-md border bg-muted/20 p-3 space-y-3 text-sm">
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
              <div>
                <span className="text-muted-foreground">
                  Coluna cod_credor:
                </span>{" "}
                <code className="font-mono">{preview.colunaCodCredor}</code>
              </div>
              <div>
                <span className="text-muted-foreground">Coluna nome:</span>{" "}
                <code className="font-mono">{preview.colunaNome}</code>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-4 w-4" />
                {preview.validos.length} válidos
              </span>
              {preview.invalidos > 0 && (
                <span className="flex items-center gap-1.5 text-yellow-600 dark:text-yellow-400">
                  <AlertTriangle className="h-4 w-4" />
                  {preview.invalidos} sem cod_credor ou nome (serão ignorados)
                </span>
              )}
            </div>

            {preview.validos.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  Ver primeiros 5
                </summary>
                <ul className="mt-2 space-y-1 font-mono">
                  {preview.validos.slice(0, 5).map((v) => (
                    <li key={v.cod_credor} className="flex gap-2">
                      <span className="text-muted-foreground">
                        {v.cod_credor}
                      </span>
                      <span>{v.nome}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        {/* Resultado pós-importação */}
        {resultado && (
          <div className="rounded-md border bg-muted/20 p-3 space-y-2 text-sm">
            <p className="font-medium">Resumo</p>
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-4 w-4" />
                {resultado.inseridos} cadastrados
              </span>
              {resultado.ignorados > 0 && (
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  {resultado.ignorados} já existiam
                </span>
              )}
              {resultado.invalidos > 0 && (
                <span className="flex items-center gap-1.5 text-yellow-600 dark:text-yellow-400">
                  <AlertTriangle className="h-4 w-4" />
                  {resultado.invalidos} inválidos
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
