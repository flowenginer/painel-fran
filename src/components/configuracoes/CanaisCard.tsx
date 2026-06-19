import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  useAtualizarCanal,
  useCanais,
  useCanalTokens,
  useCriarCanal,
  useRemoverCanal,
  useSalvarCanalToken,
} from "@/hooks/useCanais";

interface Edit {
  nome: string;
  instancia: string;
  numero: string;
  peso: string;
}

export function CanaisCard() {
  const { data: canais, isLoading } = useCanais();
  const { data: tokensServidor } = useCanalTokens();
  const { mutate: criar, isPending: criando } = useCriarCanal();
  const { mutate: atualizar } = useAtualizarCanal();
  const { mutate: remover } = useRemoverCanal();
  const { mutate: salvarToken } = useSalvarCanalToken();

  // Campos de texto editáveis localmente; ressincroniza com o servidor.
  const [edits, setEdits] = useState<Record<number, Edit>>({});
  const [tokens, setTokens] = useState<Record<number, string>>({});
  useEffect(() => {
    if (canais) {
      setEdits(
        Object.fromEntries(
          canais.map((c) => [
            c.id,
            {
              nome: c.nome,
              instancia: c.instancia,
              numero: c.numero ?? "",
              peso: String(c.peso),
            },
          ])
        )
      );
    }
  }, [canais]);
  useEffect(() => {
    if (tokensServidor) setTokens(tokensServidor);
  }, [tokensServidor]);

  function campo(id: number, key: keyof Edit, value: string) {
    setEdits((p) => ({ ...p, [id]: { ...p[id], [key]: value } }));
  }

  function salvarCampo(id: number) {
    const e = edits[id];
    if (!e) return;
    atualizar({
      id,
      patch: {
        nome: e.nome.trim() || "Canal",
        instancia: e.instancia.trim(),
        numero: e.numero.trim() || null,
        peso: Math.max(Math.floor(Number(e.peso) || 1), 1),
      },
    });
  }

  function salvarTokenCampo(id: number) {
    salvarToken({ canalId: id, token: (tokens[id] ?? "").trim() });
  }

  function adicionar() {
    const n = (canais?.length ?? 0) + 1;
    criar({ nome: `Canal ${n}`, instancia: "", peso: 1, ordem: n - 1 });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Canais de conexão (WhatsApp)</CardTitle>
        <CardDescription>
          Vários números para distribuir o volume (anti-bloqueio). O n8n roteia
          pela <strong>instância</strong>, que vai no payload do envio. A
          resposta de uma conversa sai sempre pelo mesmo número que o lead
          falou.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-2">Nome</th>
                <th className="px-2 py-2">Instância (n8n)</th>
                <th className="px-2 py-2">Token (disparo)</th>
                <th className="px-2 py-2">Número</th>
                <th className="px-2 py-2 text-center">Peso</th>
                <th className="px-2 py-2 text-center">Disparo</th>
                <th className="px-2 py-2 text-center">Ativo</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td
                    colSpan={8}
                    className="py-6 text-center text-muted-foreground"
                  >
                    <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                  </td>
                </tr>
              )}

              {!isLoading &&
                canais?.map((c) => {
                  const e = edits[c.id];
                  return (
                    <tr key={c.id} className="border-b last:border-0">
                      <td className="py-2 pr-2">
                        <Input
                          className="h-8 w-32"
                          value={e?.nome ?? ""}
                          onChange={(ev) => campo(c.id, "nome", ev.target.value)}
                          onBlur={() => salvarCampo(c.id)}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          className="h-8 w-44"
                          placeholder="instância UAZAPI"
                          value={e?.instancia ?? ""}
                          onChange={(ev) =>
                            campo(c.id, "instancia", ev.target.value)
                          }
                          onBlur={() => salvarCampo(c.id)}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          type="password"
                          className="h-8 w-44 font-mono"
                          placeholder="token da instância"
                          value={tokens[c.id] ?? ""}
                          onChange={(ev) =>
                            setTokens((p) => ({
                              ...p,
                              [c.id]: ev.target.value,
                            }))
                          }
                          onBlur={() => salvarTokenCampo(c.id)}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          className="h-8 w-36"
                          placeholder="55 11 9..."
                          value={e?.numero ?? ""}
                          onChange={(ev) =>
                            campo(c.id, "numero", ev.target.value)
                          }
                          onBlur={() => salvarCampo(c.id)}
                        />
                      </td>
                      <td className="px-2 py-2 text-center">
                        <Input
                          type="number"
                          min={1}
                          className="mx-auto h-8 w-16 text-center"
                          value={e?.peso ?? "1"}
                          onChange={(ev) => campo(c.id, "peso", ev.target.value)}
                          onBlur={() => salvarCampo(c.id)}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center justify-center gap-1.5">
                          <Checkbox
                            checked={c.usar_no_disparo}
                            onCheckedChange={(v) =>
                              atualizar({
                                id: c.id,
                                patch: { usar_no_disparo: v === true },
                              })
                            }
                          />
                          <span
                            className={
                              "h-2 w-2 rounded-full " +
                              (c.conectado ? "bg-green-500" : "bg-muted-foreground/30")
                            }
                            title={
                              c.conectado
                                ? "Conectado (último disparo)"
                                : "Sem conexão confirmada — não recebe disparos"
                            }
                          />
                        </div>
                      </td>
                      <td className="px-2 py-2 text-center">
                        <Checkbox
                          checked={c.ativo}
                          onCheckedChange={(v) =>
                            atualizar({
                              id: c.id,
                              patch: { ativo: v === true },
                            })
                          }
                        />
                      </td>
                      <td className="px-2 py-2 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-destructive hover:text-destructive"
                          onClick={() => remover(c.id)}
                          title="Remover canal"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}

              {!isLoading && (canais?.length ?? 0) === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="py-6 text-center text-muted-foreground"
                  >
                    Nenhum canal cadastrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="max-w-2xl text-xs text-muted-foreground">
            <strong>Disparo</strong>: marca quais números entram no rodízio da
            1ª mensagem — a bolinha verde indica conexão (só números conectados
            recebem disparos; os offline são pulados automaticamente).{" "}
            <strong>Peso</strong>: fatia de cada número (maior = mais disparos).{" "}
            <strong>Token</strong>: usado só no disparo e visível apenas para
            admin. Alterações salvam automaticamente.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={adicionar}
            disabled={criando}
          >
            {criando ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Adicionar canal
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
