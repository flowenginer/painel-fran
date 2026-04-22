// Dialog de adicionar devedor com 3 abas: Por Credor (lista ou devedor
// específico via cod_devedor), Por CPF, Manual.
import { useState } from "react";
import { Loader2, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  buscarNoCedrus,
  type CedrusBuscarParams,
  type CedrusBuscarResponse,
} from "@/lib/cedrus";
import { useToast } from "@/hooks/use-toast";
import type { DevedorNormalizado } from "@/lib/types";
import { DevedorReviewForm } from "./DevedorReviewForm";
import { ResultadosTabela } from "./ResultadosTabela";
import {
  formFromNormalizado,
  formVazio,
  type DevedorReviewForm as ReviewFormType,
} from "./review-helpers";
import { useInstituicoes } from "@/hooks/useInstituicoes";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Aba = "credor" | "cpf" | "manual";
type Vista = "busca" | "resultado" | "revisao";

export function AdicionarDevedorDialog({ open, onOpenChange }: Props) {
  const [aba, setAba] = useState<Aba>("credor");
  const [vista, setVista] = useState<Vista>("busca");

  // Estado das buscas
  const [codCredor, setCodCredor] = useState("");
  const [codDevedor, setCodDevedor] = useState("");
  const [status, setStatus] = useState<"A" | "P" | "C" | "S">("A");
  const [paginaCedrus, setPaginaCedrus] = useState(1);
  const [cpfBusca, setCpfBusca] = useState("");

  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<CedrusBuscarResponse | null>(null);

  // Estado do modal de revisão
  const [formInicial, setFormInicial] = useState<ReviewFormType | null>(null);
  const [destaques, setDestaques] = useState<
    Partial<Record<keyof ReviewFormType, boolean>> | undefined
  >(undefined);

  const { toast } = useToast();
  const { data: instituicoes } = useInstituicoes();

  function reset() {
    setAba("credor");
    setVista("busca");
    setCodCredor("");
    setCodDevedor("");
    setStatus("A");
    setPaginaCedrus(1);
    setCpfBusca("");
    setResultado(null);
    setFormInicial(null);
    setDestaques(undefined);
    setLoading(false);
  }

  function handleClose(open: boolean) {
    if (!open) reset();
    onOpenChange(open);
  }

  async function executarBusca(
    params: CedrusBuscarParams
  ): Promise<CedrusBuscarResponse | null> {
    setLoading(true);
    try {
      const resp = await buscarNoCedrus(params);
      setResultado(resp);
      if (resp.devedores.length === 0) {
        toast({
          title: "Nenhum devedor encontrado",
          description: resp.message ?? "Ajuste os filtros e tente novamente.",
        });
      }
      setVista("resultado");
      return resp;
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro ao buscar no Cedrus",
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
      return null;
    } finally {
      setLoading(false);
    }
  }

  function abrirRevisao(d: DevedorNormalizado) {
    // Se cod_credor existe em fran_instituicoes, pré-preenche.
    const inst = d.cod_credor
      ? instituicoes?.find((i) => i.cod_credor === d.cod_credor)
      : undefined;

    const form = formFromNormalizado(d, inst?.nome);
    setFormInicial(form);
    setDestaques({
      nome_devedor: !form.nome_devedor,
      telefone: !form.telefone,
      instituicao: !form.instituicao,
      tratamento: !d.nome_devedor,
    });
    setVista("revisao");
  }

  function abrirRevisaoManual() {
    setFormInicial(formVazio());
    setDestaques({
      nome_devedor: true,
      cpf: true,
      telefone: true,
      instituicao: true,
    });
    setVista("revisao");
  }

  async function handleBuscarCredor() {
    const codCredorLimpo = codCredor.trim() || undefined;
    const codDevedorLimpo = codDevedor.trim() || undefined;

    if (!codCredorLimpo && !codDevedorLimpo) {
      toast({
        variant: "destructive",
        title: "Informe ao menos um código",
        description: "Preencha o código do credor, do devedor, ou ambos.",
      });
      return;
    }

    const resp = await executarBusca({
      cod_credor: codCredorLimpo,
      cod_devedor: codDevedorLimpo,
      status,
      num_pagina: paginaCedrus,
    });

    // Se o operador informou código específico e veio 1 resultado, abre
    // direto a revisão (mesmo padrão da busca por CPF).
    if (codDevedorLimpo && resp?.devedores.length === 1) {
      abrirRevisao(resp.devedores[0]);
    }
  }

  async function handleBuscarCpf() {
    const digitos = cpfBusca.replace(/\D/g, "");
    if (digitos.length !== 11) {
      toast({
        variant: "destructive",
        title: "CPF inválido",
        description: "Informe um CPF com 11 dígitos.",
      });
      return;
    }
    setLoading(true);
    try {
      const resp = await buscarNoCedrus({ cnpj_cpf: digitos });
      if (resp.devedores.length === 0) {
        toast({
          title: "Nenhum devedor encontrado",
          description: "Tente por credor ou use o cadastro manual.",
        });
        return;
      }
      // Abre direto a revisão do primeiro (busca por CPF retorna 1 resultado)
      abrirRevisao(resp.devedores[0]);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro ao buscar no Cedrus",
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
    } finally {
      setLoading(false);
    }
  }

  function voltarParaBusca() {
    setVista(aba === "cpf" ? "busca" : "resultado");
    setFormInicial(null);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {vista === "revisao"
              ? "Revisar devedor"
              : "Adicionar devedor"}
          </DialogTitle>
          <DialogDescription>
            {vista === "revisao"
              ? "Confira os dados antes de salvar. Campos marcados são obrigatórios."
              : "Busque no Cedrus por credor ou CPF, ou cadastre manualmente."}
          </DialogDescription>
        </DialogHeader>

        {vista !== "revisao" && (
          <Tabs value={aba} onValueChange={(v) => setAba(v as Aba)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="credor">Por credor</TabsTrigger>
              <TabsTrigger value="cpf">Por CPF</TabsTrigger>
              <TabsTrigger value="manual">Manual</TabsTrigger>
            </TabsList>

            <TabsContent value="credor" className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="space-y-1">
                  <Label className="text-xs">Código do credor</Label>
                  <Input
                    value={codCredor}
                    onChange={(e) => setCodCredor(e.target.value)}
                    placeholder="2024"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Código do devedor</Label>
                  <Input
                    value={codDevedor}
                    onChange={(e) => setCodDevedor(e.target.value)}
                    placeholder="opcional"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Status</Label>
                  <Select
                    value={status}
                    onValueChange={(v) =>
                      setStatus(v as "A" | "P" | "C" | "S")
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="A">A — Aberto</SelectItem>
                      <SelectItem value="P">P — Pago</SelectItem>
                      <SelectItem value="C">C — Cancelado</SelectItem>
                      <SelectItem value="S">S — Suspenso</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Página</Label>
                  <Input
                    type="number"
                    min={1}
                    value={paginaCedrus}
                    onChange={(e) =>
                      setPaginaCedrus(Math.max(1, Number(e.target.value)))
                    }
                    disabled={!!codDevedor.trim()}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Informe ao menos um dos códigos. Com os dois preenchidos,
                busca um devedor específico do credor; só com o credor,
                lista todos em lote.
              </p>
              <Button onClick={handleBuscarCredor} disabled={loading}>
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Search className="mr-2 h-4 w-4" />
                )}
                Buscar
              </Button>
            </TabsContent>

            <TabsContent value="cpf" className="space-y-4">
              <div className="space-y-1">
                <Label className="text-xs">CPF</Label>
                <Input
                  value={cpfBusca}
                  onChange={(e) => setCpfBusca(e.target.value)}
                  placeholder="517.978.361-53"
                />
              </div>
              <Button onClick={handleBuscarCpf} disabled={loading}>
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Search className="mr-2 h-4 w-4" />
                )}
                Buscar no Cedrus
              </Button>
            </TabsContent>

            <TabsContent value="manual" className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Cadastre um devedor sem consultar a API Cedrus. Preencha
                os campos obrigatórios na tela de revisão.
              </p>
              <Button onClick={abrirRevisaoManual}>
                Abrir formulário
              </Button>
            </TabsContent>
          </Tabs>
        )}

        {/* Resultados da busca por credor */}
        {vista === "resultado" && aba === "credor" && resultado && (
          <ResultadosTabela
            resposta={resultado}
            instituicoes={instituicoes ?? []}
            onRevisar={abrirRevisao}
            onVoltar={() => setVista("busca")}
            onCarregarProxima={async () => {
              const proxima = paginaCedrus + 1;
              setPaginaCedrus(proxima);
              await executarBusca({
                cod_credor: codCredor.trim(),
                cod_devedor: codDevedor.trim() || undefined,
                status,
                num_pagina: proxima,
              });
            }}
          />
        )}

        {/* Modal de revisão */}
        {vista === "revisao" && formInicial && (
          <DevedorReviewForm
            // Key única força remount completo quando mudamos de devedor
            // (evita reaproveitar state de buscas anteriores).
            key={`${formInicial.cpf}-${formInicial.cod_devedor ?? "novo"}`}
            inicial={formInicial}
            destaques={destaques}
            onCancel={voltarParaBusca}
            onSuccess={() => {
              // Se veio de lista, volta pra lista; senão fecha.
              if (aba === "credor" && resultado) {
                setVista("resultado");
                setFormInicial(null);
              } else {
                handleClose(false);
              }
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
