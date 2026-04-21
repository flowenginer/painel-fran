import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

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
import { useToast } from "@/hooks/use-toast";
import {
  useAtualizarInstituicao,
  useCriarInstituicao,
} from "@/hooks/useInstituicoesMutations";
import type { Instituicao } from "@/lib/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inicial?: Instituicao | null;
}

export function InstituicaoDialog({ open, onOpenChange, inicial }: Props) {
  const [codCredor, setCodCredor] = useState("");
  const [nome, setNome] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [erro, setErro] = useState<{ campo: string; msg: string } | null>(
    null
  );

  const { mutateAsync: criar, isPending: criando } = useCriarInstituicao();
  const { mutateAsync: atualizar, isPending: atualizando } =
    useAtualizarInstituicao();
  const { toast } = useToast();

  const isEdit = !!inicial;
  const loading = criando || atualizando;

  useEffect(() => {
    if (open) {
      setCodCredor(inicial?.cod_credor ?? "");
      setNome(inicial?.nome ?? "");
      setAtivo(inicial?.ativo ?? true);
      setErro(null);
    }
  }, [open, inicial]);

  async function salvar() {
    const c = codCredor.trim();
    const n = nome.trim();
    if (!c) return setErro({ campo: "cod_credor", msg: "Obrigatório" });
    if (!n) return setErro({ campo: "nome", msg: "Obrigatório" });

    try {
      if (isEdit && inicial) {
        await atualizar({
          id: inicial.id,
          input: { cod_credor: c, nome: n, ativo },
        });
        toast({ variant: "success", title: "Instituição atualizada" });
      } else {
        await criar({ cod_credor: c, nome: n, ativo });
        toast({ variant: "success", title: "Instituição criada" });
      }
      onOpenChange(false);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Editar instituição" : "Nova instituição"}
          </DialogTitle>
          <DialogDescription>
            Mapeamento cod_credor → nome usado na importação do Cedrus.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Código do credor *</Label>
            <Input
              value={codCredor}
              onChange={(e) => setCodCredor(e.target.value)}
              placeholder="2024"
              disabled={isEdit}
            />
            {erro?.campo === "cod_credor" && (
              <p className="text-xs text-destructive">{erro.msg}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Nome *</Label>
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Escola M.L. (JD. Presidente)"
            />
            {erro?.campo === "nome" && (
              <p className="text-xs text-destructive">{erro.msg}</p>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={ativo}
              onChange={(e) => setAtivo(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            Ativa
          </label>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
