import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useConfig } from "@/hooks/useConfig";
import { useSaveConfig } from "@/hooks/useSaveConfig";
import { useDistribuicao, useSetDistribuicao } from "@/hooks/useDistribuicao";
import { useToast } from "@/hooks/use-toast";
import type { DistribuicaoMetodo } from "@/lib/distribuicao";

export function DistribuicaoCard() {
  const { data: config } = useConfig();
  const { mutateAsync: salvarConfig, isPending: salvandoMetodo } =
    useSaveConfig();
  const { data: usuarios, isLoading } = useDistribuicao();
  const { mutate: salvarLinha } = useSetDistribuicao();
  const { toast } = useToast();

  const metodo = (config?.distribuicao_metodo as DistribuicaoMetodo) ||
    "round_robin";
  const ponderado = metodo === "ponderado";

  // Peso editável localmente (string para permitir digitação); ressincroniza
  // quando os dados do servidor mudam.
  const [pesos, setPesos] = useState<Record<string, string>>({});
  useEffect(() => {
    if (usuarios) {
      setPesos(
        Object.fromEntries(usuarios.map((u) => [u.id, String(u.peso)]))
      );
    }
  }, [usuarios]);

  async function trocarMetodo(novo: DistribuicaoMetodo) {
    try {
      await salvarConfig([{ chave: "distribuicao_metodo", valor: novo }]);
      toast({ variant: "success", title: "Método de distribuição atualizado" });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Erro ao salvar método",
        description: e instanceof Error ? e.message : "Falhou",
      });
    }
  }

  // Soma dos pesos dos participantes ativos — base do cálculo de %.
  const somaPeso = useMemo(() => {
    if (!usuarios) return 0;
    return usuarios
      .filter((u) => u.ativo && u.recebe_distribuicao)
      .reduce((acc, u) => acc + Math.max(u.peso, 1), 0);
  }, [usuarios]);

  function toggleParticipa(id: string, recebe: boolean) {
    const peso = Math.max(Number(pesos[id]) || 1, 1);
    salvarLinha({ userId: id, recebe, peso });
  }

  function salvarPeso(id: string, recebeAtual: boolean) {
    const novo = Math.max(Math.floor(Number(pesos[id]) || 1), 1);
    salvarLinha({ userId: id, recebe: recebeAtual, peso: novo });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Distribuição de leads</CardTitle>
        <CardDescription>
          Defina quem recebe os leads disparados e como o rodízio é feito.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <Label className="text-xs">Método</Label>
          <Select
            value={metodo}
            onValueChange={(v) => void trocarMetodo(v as DistribuicaoMetodo)}
            disabled={salvandoMetodo}
          >
            <SelectTrigger className="w-full sm:w-[280px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="round_robin">
                Round-robin igual (reveza na ordem)
              </SelectItem>
              <SelectItem value="ponderado">
                Ponderado por peso (proporcional)
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {ponderado
              ? "Cada operador recebe proporcionalmente ao seu peso."
              : "Todos os participantes recebem na mesma proporção, em rodízio."}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-2">Operador</th>
                <th className="px-2 py-2 text-center">Participa</th>
                <th className="px-2 py-2 text-center">Peso</th>
                <th className="px-2 py-2 text-right">% dos leads</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-muted-foreground">
                    <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                  </td>
                </tr>
              )}

              {!isLoading &&
                usuarios?.map((u) => {
                  const participa = u.recebe_distribuicao && u.ativo;
                  const pct =
                    ponderado && participa && somaPeso > 0
                      ? Math.round((Math.max(u.peso, 1) / somaPeso) * 100)
                      : participa && somaPeso === 0
                        ? 0
                        : null;
                  return (
                    <tr key={u.id} className="border-b last:border-0">
                      <td className="py-2 pr-2">
                        <div className="font-medium">
                          {u.nome || u.email || u.id}
                          {u.role === "admin" && (
                            <span className="ml-1 text-xs text-muted-foreground">
                              (admin)
                            </span>
                          )}
                        </div>
                        {!u.ativo && (
                          <div className="text-xs text-destructive">inativo</div>
                        )}
                      </td>
                      <td className="px-2 py-2 text-center">
                        <Checkbox
                          checked={u.recebe_distribuicao}
                          disabled={!u.ativo}
                          onCheckedChange={(c) =>
                            toggleParticipa(u.id, c === true)
                          }
                        />
                      </td>
                      <td className="px-2 py-2 text-center">
                        <Input
                          type="number"
                          min={1}
                          className="mx-auto h-8 w-20 text-center"
                          value={pesos[u.id] ?? String(u.peso)}
                          disabled={!ponderado || !participa}
                          onChange={(e) =>
                            setPesos((p) => ({ ...p, [u.id]: e.target.value }))
                          }
                          onBlur={() =>
                            salvarPeso(u.id, u.recebe_distribuicao)
                          }
                        />
                      </td>
                      <td className="px-2 py-2 text-right text-muted-foreground">
                        {pct === null ? "—" : `${pct}%`}
                      </td>
                    </tr>
                  );
                })}

              {!isLoading && (usuarios?.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-muted-foreground">
                    Nenhum usuário cadastrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-muted-foreground">
          Admins não participam por padrão — marque "Participa" para incluí-los.
          Alterações são salvas automaticamente.
        </p>
      </CardContent>
    </Card>
  );
}
