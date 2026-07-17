import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listarCanais } from "@/lib/canais";
import {
  listarLembretesConfig,
  atualizarLembreteConfig,
} from "@/lib/lembretes";
import type { Canal, LembreteConfig } from "@/lib/types";

export function LembretesCard() {
  const { data: regras, refetch } = useQuery({
    queryKey: ["lembretes_config"],
    queryFn: listarLembretesConfig,
  });
  const { data: canais } = useQuery({
    queryKey: ["canais"],
    queryFn: listarCanais,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lembretes automáticos</CardTitle>
        <CardDescription>
          Enviados sozinhos após o paciente comparecer. Use <code>{"{nome}"}</code>{" "}
          na mensagem para inserir o primeiro nome.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {(regras ?? []).map((r) => (
          <RegraForm
            key={r.id}
            regra={r}
            canais={canais ?? []}
            onSaved={() => void refetch()}
          />
        ))}
        {regras && regras.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nenhuma regra. Rode a migração 0006 para criar as padrão.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function RegraForm({
  regra,
  canais,
  onSaved,
}: {
  regra: LembreteConfig;
  canais: Canal[];
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [canalId, setCanalId] = useState<string>(
    regra.canal_id ? String(regra.canal_id) : "nenhum",
  );
  const [mensagem, setMensagem] = useState(regra.mensagem);
  const [ativo, setAtivo] = useState(regra.ativo);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    setCanalId(regra.canal_id ? String(regra.canal_id) : "nenhum");
    setMensagem(regra.mensagem);
    setAtivo(regra.ativo);
  }, [regra]);

  async function salvar() {
    setSalvando(true);
    try {
      await atualizarLembreteConfig(regra.id, {
        canal_id: canalId === "nenhum" ? null : Number(canalId),
        mensagem,
        ativo,
      });
      toast({ title: "Regra salva" });
      onSaved();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{regra.nome}</p>
          <p className="text-xs text-muted-foreground">
            A cada {regra.meses} {regra.meses === 1 ? "mês" : "meses"} após comparecer
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={ativo}
            onChange={(e) => setAtivo(e.target.checked)}
            className="h-4 w-4"
          />
          Ativa
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-[220px_1fr]">
        <div className="space-y-1.5">
          <Label className="text-xs">Canal de envio</Label>
          <Select value={canalId} onValueChange={setCanalId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="nenhum">Nenhum</SelectItem>
              {canais.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.nome} ({c.tipo === "zernio" ? "oficial" : "não-oficial"})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Mensagem</Label>
          <Textarea
            rows={2}
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={salvar} disabled={salvando}>
          {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar
        </Button>
      </div>
    </div>
  );
}
