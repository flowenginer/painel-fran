import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useInstituicoes } from "@/hooks/useInstituicoes";
import {
  garantirInstituicao,
  useUpsertDevedor,
} from "@/hooks/useUpsertDevedor";
import { formatBRL } from "@/lib/formatters";
import {
  extrairPrimeiroNome,
  validarForm,
  type DevedorReviewForm as ReviewFormType,
} from "./review-helpers";

interface Props {
  inicial: ReviewFormType;
  // Flags para destacar campos que precisam de atenção (vazios/não detectados).
  destaques?: Partial<Record<keyof ReviewFormType, boolean>>;
  onSuccess: () => void;
  onCancel: () => void;
}

export function DevedorReviewForm({
  inicial,
  destaques,
  onSuccess,
  onCancel,
}: Props) {
  const [form, setForm] = useState<ReviewFormType>(inicial);
  const [erros, setErros] = useState<
    Partial<Record<keyof ReviewFormType, string>>
  >({});
  const [novaInstituicao, setNovaInstituicao] = useState(false);

  const { data: instituicoes } = useInstituicoes();
  const { mutateAsync, isPending } = useUpsertDevedor();
  const { toast } = useToast();

  // Sincroniza form com mudanças de prop (trocar de devedor selecionado).
  useEffect(() => {
    setForm(inicial);
    setErros({});
    setNovaInstituicao(false);
  }, [inicial]);

  // Detecta se o cod_credor já está mapeado em fran_instituicoes.
  const codCredor = form.cod_credor;
  const instMapping = codCredor
    ? instituicoes?.find((i) => i.cod_credor === codCredor)
    : undefined;

  // Sugere nome mapeado automaticamente se existir e ainda não foi preenchido.
  useEffect(() => {
    if (instMapping && !form.instituicao) {
      setForm((prev) => ({ ...prev, instituicao: instMapping.nome }));
    }
    // Se tem cod_credor e não está mapeado, marca como "nova".
    if (codCredor && instituicoes && !instMapping && !form.instituicao) {
      setNovaInstituicao(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instMapping, instituicoes, codCredor]);

  function set<K extends keyof ReviewFormType>(
    key: K,
    value: ReviewFormType[K]
  ) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      // Atualiza primeiro_nome automaticamente se nome mudar.
      if (key === "nome_devedor" && typeof value === "string") {
        next.primeiro_nome = extrairPrimeiroNome(value);
      }
      return next;
    });
    // Remove erro do campo ao editar
    if (erros[key]) {
      setErros((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }

  async function handleSalvar() {
    const { valido, erros: novosErros } = validarForm(form);
    setErros(novosErros);
    if (!valido) {
      toast({
        variant: "destructive",
        title: "Preencha os campos obrigatórios",
        description: "Nome, CPF, telefone e instituição são obrigatórios.",
      });
      return;
    }

    try {
      // Se cod_credor está preenchido e instituição ainda não existe, cria.
      if (codCredor && !instMapping) {
        await garantirInstituicao(codCredor, form.instituicao.trim());
      }

      await mutateAsync({
        id_devedor: form.id_devedor ?? undefined,
        cod_credor: form.cod_credor ?? undefined,
        cod_devedor: form.cod_devedor ?? undefined,
        cpf: form.cpf,
        nome_devedor: form.nome_devedor.trim(),
        primeiro_nome: form.primeiro_nome.trim() || null,
        tratamento: form.tratamento,
        email: form.email.trim() || null,
        telefone: form.telefone.replace(/\D/g, ""),
        telefone_2: form.telefone_2.replace(/\D/g, "") || null,
        telefone_3: form.telefone_3.replace(/\D/g, "") || null,
        endereco: form.endereco.trim() || null,
        bairro: form.bairro.trim() || null,
        cidade: form.cidade.trim() || null,
        estado: form.estado.trim() || null,
        cep: form.cep.replace(/\D/g, "") || null,
        instituicao: form.instituicao.trim(),
        nome_aluno: form.nome_aluno.trim() || null,
        valor_original: form.valor_original,
        valor_atualizado: form.valor_atualizado,
        qtd_parcelas_aberto: form.qtd_parcelas_aberto,
        ano_inicial_dividas: form.ano_inicial_dividas,
        ano_final_dividas: form.ano_final_dividas,
        acordo_anterior: form.acordo_anterior,
        dado_adicional: form.dado_adicional.trim() || null,
      });

      toast({
        variant: "success",
        title: "Devedor salvo",
        description: form.nome_devedor,
      });
      onSuccess();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
    }
  }

  const highlight = (campo: keyof ReviewFormType) =>
    destaques?.[campo]
      ? "border-yellow-500/50 focus-visible:ring-yellow-500/50"
      : "";

  const errorMsg = (campo: keyof ReviewFormType) => erros[campo];

  return (
    <div className="space-y-4">
      {/* Aviso categoria especial (ex. COBRANÇA ARQUIVADA) */}
      {form.categoria && (
        <div className="flex items-start gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-yellow-600 dark:text-yellow-400">
              Categoria: {form.categoria}
            </p>
            <p className="text-xs text-muted-foreground">
              Verifique se faz sentido disparar a Fran para este devedor.
            </p>
          </div>
        </div>
      )}

      {/* Identificação Cedrus (read-only) */}
      {(form.id_devedor || form.cod_credor || form.cod_devedor) && (
        <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
          <p className="font-medium text-foreground mb-1">Identificação Cedrus</p>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
            {form.id_devedor && (
              <span>
                id_devedor: <code className="font-mono">{form.id_devedor}</code>
              </span>
            )}
            {form.cod_credor && (
              <span>
                cod_credor: <code className="font-mono">{form.cod_credor}</code>
              </span>
            )}
            {form.cod_devedor && (
              <span>
                cod_devedor: <code className="font-mono">{form.cod_devedor}</code>
              </span>
            )}
          </div>
        </div>
      )}

      {/* Identificação */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo
          label="CPF *"
          error={errorMsg("cpf")}
          className="sm:col-span-1"
        >
          <Input
            value={form.cpf}
            onChange={(e) => set("cpf", e.target.value)}
            placeholder="12345678900"
            className={cn(highlight("cpf"))}
          />
        </Campo>

        <Campo label="Tratamento" className="sm:col-span-1">
          <Select
            value={form.tratamento}
            onValueChange={(v) => set("tratamento", v as "Sr." | "Sra.")}
          >
            <SelectTrigger className={cn(highlight("tratamento"))}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Sr.">Sr.</SelectItem>
              <SelectItem value="Sra.">Sra.</SelectItem>
            </SelectContent>
          </Select>
        </Campo>

        <Campo
          label="Nome completo *"
          error={errorMsg("nome_devedor")}
          className="sm:col-span-2"
        >
          <Input
            value={form.nome_devedor}
            onChange={(e) => set("nome_devedor", e.target.value)}
            placeholder="Claydson Silva Rodrigues"
            className={cn(highlight("nome_devedor"))}
          />
        </Campo>

        <Campo label="Primeiro nome" className="sm:col-span-1">
          <Input
            value={form.primeiro_nome}
            onChange={(e) => set("primeiro_nome", e.target.value)}
            placeholder="Claydson"
          />
        </Campo>

        <Campo label="Email" className="sm:col-span-1">
          <Input
            type="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
          />
        </Campo>
      </section>

      {/* Telefones */}
      <section className="space-y-3">
        <h3 className="text-sm font-medium">
          Telefones{" "}
          <span className="text-xs font-normal text-muted-foreground">
            (1º é o destino do WhatsApp)
          </span>
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Campo label="Principal *" error={errorMsg("telefone")}>
            <Input
              value={form.telefone}
              onChange={(e) => set("telefone", e.target.value)}
              placeholder="5562991357861"
              className={cn(highlight("telefone"))}
            />
          </Campo>
          <Campo label="Alternativo 1">
            <Input
              value={form.telefone_2}
              onChange={(e) => set("telefone_2", e.target.value)}
            />
          </Campo>
          <Campo label="Alternativo 2">
            <Input
              value={form.telefone_3}
              onChange={(e) => set("telefone_3", e.target.value)}
            />
          </Campo>
        </div>
      </section>

      {/* Instituição */}
      <section className="space-y-2">
        <h3 className="text-sm font-medium">Instituição</h3>
        {codCredor && (
          <p className="text-xs text-muted-foreground">
            cod_credor:{" "}
            <code className="font-mono">{codCredor}</code>
            {instMapping ? (
              <span className="text-green-600 dark:text-green-400">
                {" "}
                · mapeado
              </span>
            ) : (
              <span className="text-yellow-600 dark:text-yellow-400">
                {" "}
                · novo (será cadastrado)
              </span>
            )}
          </p>
        )}
        <Campo label="Nome da instituição *" error={errorMsg("instituicao")}>
          <Input
            value={form.instituicao}
            onChange={(e) => {
              set("instituicao", e.target.value);
              if (codCredor && !instMapping) setNovaInstituicao(true);
            }}
            placeholder="Escola M.L. (JD. Presidente)"
            className={cn(
              highlight("instituicao"),
              novaInstituicao && !instMapping && "border-yellow-500/50"
            )}
          />
        </Campo>
      </section>

      {/* Informações do aluno/dívida */}
      <section className="space-y-3">
        <h3 className="text-sm font-medium">Dívida</h3>
        <Campo label="Aluno(s)">
          <Input
            value={form.nome_aluno}
            onChange={(e) => set("nome_aluno", e.target.value)}
            placeholder="Abraão; Calebe"
          />
        </Campo>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Campo label="Valor original">
            <Input
              readOnly
              value={formatBRL(form.valor_original)}
              className="bg-muted/30"
            />
          </Campo>
          <Campo label="Valor atualizado">
            <Input
              readOnly
              value={formatBRL(form.valor_atualizado)}
              className="bg-muted/30"
            />
          </Campo>
          <Campo label="Parcelas em aberto">
            <Input
              readOnly
              value={form.qtd_parcelas_aberto ?? "—"}
              className="bg-muted/30"
            />
          </Campo>
          <Campo label="Período">
            <Input
              readOnly
              value={
                form.ano_inicial_dividas && form.ano_final_dividas
                  ? `${form.ano_inicial_dividas}–${form.ano_final_dividas}`
                  : "—"
              }
              className="bg-muted/30"
            />
          </Campo>
        </div>

        <Campo label="Acordo anterior">
          <Select
            value={form.acordo_anterior}
            onValueChange={(v) => set("acordo_anterior", v as "sim" | "nao")}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sim">Sim</SelectItem>
              <SelectItem value="nao">Não</SelectItem>
            </SelectContent>
          </Select>
        </Campo>
      </section>

      {/* Endereço */}
      <section className="space-y-3">
        <h3 className="text-sm font-medium">Endereço</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo label="Logradouro" className="sm:col-span-2">
            <Input
              value={form.endereco}
              onChange={(e) => set("endereco", e.target.value)}
            />
          </Campo>
          <Campo label="Bairro">
            <Input
              value={form.bairro}
              onChange={(e) => set("bairro", e.target.value)}
            />
          </Campo>
          <Campo label="Cidade">
            <Input
              value={form.cidade}
              onChange={(e) => set("cidade", e.target.value)}
            />
          </Campo>
          <Campo label="UF">
            <Input
              value={form.estado}
              onChange={(e) => set("estado", e.target.value)}
              maxLength={2}
            />
          </Campo>
          <Campo label="CEP">
            <Input
              value={form.cep}
              onChange={(e) => set("cep", e.target.value)}
            />
          </Campo>
        </div>
      </section>

      {/* Dado adicional (nota livre) */}
      <section>
        <Campo label="Observação / dado adicional">
          <Textarea
            value={form.dado_adicional}
            onChange={(e) => set("dado_adicional", e.target.value)}
            rows={2}
          />
        </Campo>
      </section>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onCancel} disabled={isPending}>
          Cancelar
        </Button>
        <Button onClick={handleSalvar} disabled={isPending}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar devedor
        </Button>
      </div>
    </div>
  );
}

function Campo({
  label,
  error,
  className,
  children,
}: {
  label: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <Label className="text-xs">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
