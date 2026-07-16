// Página de Broadcasts — disparo em massa via template oficial (Zernio).
// Fluxo: nomear a campanha → escolher template aprovado → mapear variáveis →
// selecionar público (devedores filtrados) → preview → criar (enfileira).
// O ENVIO respeitando limites é feito pela Edge Function `zernio-broadcast`
// (fase 2, agendada no cron como o processar-fila).
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Info,
  Loader2,
  Megaphone,
  MoreVertical,
  Pause,
  Play,
  Send,
  Users,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useDevedores, fetchDevedoresIds } from "@/hooks/useDevedores";
import { useDevedoresFilters } from "@/hooks/useDevedoresFilters";
import { useSelecaoDevedores } from "@/hooks/useSelecaoDevedores";
import { useBroadcasts } from "@/hooks/useBroadcasts";
import { FiltrosBar } from "@/components/dashboard/FiltrosBar";
import { zernio } from "@/lib/zernio";
import {
  CAMPOS_DEVEDOR,
  cancelarBroadcast,
  criarBroadcast,
  extrairVariaveis,
  pausarBroadcast,
  renderPreview,
  retomarBroadcast,
} from "@/lib/broadcasts";
import { formatBRL, formatTelefone } from "@/lib/formatters";

export function Broadcasts() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { isAdmin, temPermissao } = useAuth();
  const podeGerenciar = isAdmin || temPermissao("acao", "gerenciar_broadcasts");

  const { data: broadcasts = [] } = useBroadcasts();

  const [nome, setNome] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [variaveis, setVariaveis] = useState<Record<string, string>>({});
  const [criando, setCriando] = useState(false);
  const [carregandoTodos, setCarregandoTodos] = useState(false);
  // Ritmo de envio da campanha (mensagens/hora).
  const [ritmo, setRitmo] = useState("60");
  // Ação de status em andamento (id do broadcast) + confirmação de cancelamento.
  const [acaoId, setAcaoId] = useState<number | null>(null);
  const [cancelando, setCancelando] = useState<{ id: number; nome: string } | null>(null);

  async function mudarStatus(
    id: number,
    fn: (id: number) => Promise<void>,
    titulo: string,
  ) {
    setAcaoId(id);
    try {
      await fn(id);
      toast({ variant: "success", title: titulo });
      qc.invalidateQueries({ queryKey: ["broadcasts"] });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Não foi possível atualizar",
        description: e instanceof Error ? e.message : "Falha desconhecida",
      });
    } finally {
      setAcaoId(null);
    }
  }

  async function confirmarCancelamento() {
    if (!cancelando) return;
    await mudarStatus(cancelando.id, cancelarBroadcast, "Broadcast cancelado");
    setCancelando(null);
  }

  const { selecionados, toggle, togglePagina, selecionarTodos, limpar } =
    useSelecaoDevedores();
  const { state, setFilters, clear, setPage, hasFiltersAtivos } =
    useDevedoresFilters();

  // Templates aprovados (só APPROVED podem ser disparados).
  const { data: templates = [], isLoading: loadingTemplates } = useQuery({
    queryKey: ["zernio-templates"],
    queryFn: () => zernio.templates.list(),
    staleTime: 60_000,
  });
  const aprovados = useMemo(
    () => templates.filter((t) => t.status === "APPROVED"),
    [templates],
  );
  const template = aprovados.find((t) => t.name === templateName) ?? null;
  const bodyText =
    template?.components.find((c) => c.type === "BODY")?.text ?? "";
  const vars = useMemo(() => extrairVariaveis(bodyText), [bodyText]);

  // Público (devedores filtrados, paginados).
  const { data: pagina, isLoading: loadingDevedores } = useDevedores({
    page: state.page,
    filters: state.filters,
    sortField: state.sortField,
    sortDirection: state.sortDirection,
  });
  const devedores = pagina?.devedores ?? [];
  const idsPagina = devedores.map((d) => d.id);
  const todosDaPaginaSelecionados =
    idsPagina.length > 0 && idsPagina.every((id) => selecionados.has(id));

  const amostra = devedores.find((d) => selecionados.has(d.id)) ?? devedores[0] ?? null;
  const varsMapeadas = vars.every((v) => variaveis[v]);
  const podeCriar =
    podeGerenciar &&
    !!template &&
    nome.trim().length > 0 &&
    varsMapeadas &&
    selecionados.size > 0 &&
    !criando;

  async function selecionarTodosDoFiltro() {
    setCarregandoTodos(true);
    try {
      // Modo "reenvio": respeita o filtro e exclui quem está em negociação
      // ativa ou com acordo fechado (não faz sentido fazer cold-broadcast).
      const ids = await fetchDevedoresIds(state.filters, "reenvio");
      selecionarTodos(ids);
      toast({ title: `${ids.length} devedor(es) selecionado(s) do filtro` });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Erro ao selecionar",
        description: e instanceof Error ? e.message : "Falha ao carregar IDs",
      });
    } finally {
      setCarregandoTodos(false);
    }
  }

  async function handleCriar() {
    if (!template) return;
    setCriando(true);
    try {
      const res = await criarBroadcast({
        nome,
        template_name: template.name,
        template_language: template.language,
        template_body: bodyText,
        por_hora: Math.max(1, Number(ritmo) || 60),
        variaveis,
        devedor_ids: Array.from(selecionados),
      });

      // Dispara o primeiro lote na hora; o resto sai sozinho no ritmo.
      let aviso = "";
      try {
        const r = await zernio.broadcast.processar();
        if (r.ativo === false) {
          aviso =
            " Envio automático está DESLIGADO — ligue a chave zernio_broadcast_ativo (fran_config).";
        }
      } catch {
        aviso = " (o primeiro lote sairá no próximo ciclo do processador)";
      }

      toast({
        variant: "success",
        title: "Broadcast criado e enviando",
        description: `${res.total_alvos} alvo(s) na fila.${
          res.sem_telefone > 0
            ? ` ${res.sem_telefone} sem telefone ignorados.`
            : ""
        }${aviso}`,
      });
      setNome("");
      setVariaveis({});
      limpar();
      qc.invalidateQueries({ queryKey: ["broadcasts"] });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Erro ao criar broadcast",
        description: e instanceof Error ? e.message : "Falha desconhecida",
      });
    } finally {
      setCriando(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
          <Megaphone className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Broadcasts</h1>
          <p className="text-sm text-muted-foreground">
            Disparo em massa via template oficial (WhatsApp Business / Zernio).
          </p>
        </div>
      </div>

      {/* Como funciona o envio */}
      <div className="flex items-start gap-2 rounded-md border border-blue-500/30 bg-blue-500/10 p-3 text-sm text-blue-700 dark:text-blue-300">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Ao criar, o envio <strong>começa sozinho</strong> e goteja no{" "}
          <strong>ritmo escolhido</strong> (para proteger o número oficial na
          Meta). Acompanhe pela barra de progresso abaixo. Requer um template{" "}
          <strong>aprovado pela Meta</strong>.
        </p>
      </div>

      {/* Histórico de campanhas */}
      {broadcasts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Histórico de broadcasts</CardTitle>
            <CardDescription className="text-xs">
              O envio começa sozinho ao criar e goteja no ritmo escolhido. A
              barra mostra o progresso ao vivo.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campanha</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead className="text-right">Alvos</TableHead>
                  <TableHead className="text-right">Enviados</TableHead>
                  <TableHead className="text-right">Na fila</TableHead>
                  <TableHead className="text-right">Erros</TableHead>
                  <TableHead className="min-w-[160px]">Progresso</TableHead>
                  <TableHead>Criado</TableHead>
                  {podeGerenciar && <TableHead className="w-10" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {broadcasts.map((b) => {
                  const naFila = Math.max(
                    0,
                    b.total_alvos - b.total_enviados - b.total_erros,
                  );
                  return (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium">{b.nome}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {b.template_name}
                      </TableCell>
                      <TableCell className="text-right">{b.total_alvos}</TableCell>
                      <TableCell className="text-right text-green-600 dark:text-green-400">
                        {b.total_enviados}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {naFila}
                      </TableCell>
                      <TableCell className="text-right text-destructive">
                        {b.total_erros}
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const feitos = b.total_enviados + b.total_erros;
                          const pct =
                            b.total_alvos > 0
                              ? Math.round((feitos / b.total_alvos) * 100)
                              : 0;
                          const enviando = b.status === "ativo" && naFila > 0;
                          return (
                            <div className="space-y-1">
                              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    b.status === "concluido"
                                      ? "bg-green-500"
                                      : "bg-primary"
                                  }`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                {enviando && (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                )}
                                <span>
                                  {pct}%
                                  {enviando
                                    ? " · enviando"
                                    : b.status === "concluido"
                                      ? " · concluído"
                                      : b.status === "pausado"
                                        ? " · pausado"
                                        : ""}
                                </span>
                              </div>
                            </div>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Intl.DateTimeFormat("pt-BR", {
                          timeZone: "America/Sao_Paulo",
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        }).format(new Date(b.created_at))}
                      </TableCell>
                      {podeGerenciar && (
                        <TableCell className="text-right">
                          {["ativo", "pausado", "rascunho"].includes(b.status) && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  disabled={acaoId === b.id}
                                >
                                  {acaoId === b.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <MoreVertical className="h-4 w-4" />
                                  )}
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {b.status === "pausado" ? (
                                  <DropdownMenuItem
                                    onClick={() =>
                                      mudarStatus(b.id, retomarBroadcast, "Broadcast retomado")
                                    }
                                  >
                                    <Play className="mr-2 h-4 w-4" />
                                    Retomar
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem
                                    onClick={() =>
                                      mudarStatus(b.id, pausarBroadcast, "Broadcast pausado")
                                    }
                                  >
                                    <Pause className="mr-2 h-4 w-4" />
                                    Pausar
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => setCancelando({ id: b.id, nome: b.nome })}
                                >
                                  <XCircle className="mr-2 h-4 w-4" />
                                  Cancelar
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Sem templates aprovados */}
      {!loadingTemplates && aprovados.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <AlertTriangle className="mb-3 h-10 w-10 opacity-40" />
            <p className="text-sm font-medium">Nenhum template aprovado ainda</p>
            <p className="mt-1 max-w-md text-xs">
              Broadcasts só funcionam com um template aprovado pela Meta. Crie um
              em <strong>Templates WA</strong> e aguarde a aprovação (de minutos
              a 24h). Ele aparecerá aqui automaticamente.
            </p>
            <Button variant="outline" size="sm" className="mt-4" asChild>
              <a href="/templates">Ir para Templates</a>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Coluna esquerda: campanha + template + variáveis + preview */}
          <div className="space-y-6 lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">1. Campanha</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="bc-nome">Nome da campanha</Label>
                  <Input
                    id="bc-nome"
                    placeholder="Ex: Cobrança Colégio X — Julho"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Template aprovado</Label>
                  <Select
                    value={templateName}
                    onValueChange={(v) => {
                      setTemplateName(v);
                      setVariaveis({});
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um template" />
                    </SelectTrigger>
                    <SelectContent>
                      {aprovados.map((t) => (
                        <SelectItem key={t.name} value={t.name}>
                          {t.name} ({t.language})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {template && (
                  <div className="rounded-md border bg-muted/30 p-3 text-xs whitespace-pre-wrap">
                    {bodyText || "(template sem corpo de texto)"}
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label>Ritmo de envio</Label>
                  <Select value={ritmo} onValueChange={setRitmo}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30">Devagar — 30/hora</SelectItem>
                      <SelectItem value="60">Normal — 60/hora</SelectItem>
                      <SelectItem value="120">Rápido — 120/hora</SelectItem>
                      <SelectItem value="240">Muito rápido — 240/hora</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    Gotejamento para proteger o número oficial. Um ritmo alto
                    demais pode fazer a Meta restringir o número.
                  </p>
                </div>
              </CardContent>
            </Card>

            {template && vars.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">2. Variáveis</CardTitle>
                  <CardDescription className="text-xs">
                    Mapeie cada <code className="font-mono">{"{{n}}"}</code> para
                    um campo do devedor.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {vars.map((v) => (
                    <div key={v} className="space-y-1.5">
                      <Label className="font-mono text-xs">{`{{${v}}}`}</Label>
                      <Select
                        value={variaveis[v] ?? ""}
                        onValueChange={(campo) =>
                          setVariaveis((prev) => ({ ...prev, [v]: campo }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Campo do devedor" />
                        </SelectTrigger>
                        <SelectContent>
                          {CAMPOS_DEVEDOR.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {template && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">3. Preview</CardTitle>
                  <CardDescription className="text-xs">
                    {amostra
                      ? `Como chega para ${amostra.nome_devedor}.`
                      : "Selecione ao menos um devedor para ver o preview."}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="rounded-lg rounded-tl-sm bg-muted p-3 text-sm whitespace-pre-wrap">
                    {amostra
                      ? renderPreview(bodyText, variaveis, amostra)
                      : bodyText}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Coluna direita: público */}
          <div className="lg:col-span-2">
            <Card className="flex h-full flex-col">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="h-4 w-4" />
                  4. Público
                  <Badge variant="secondary" className="ml-1">
                    {selecionados.size} selecionado(s)
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs">
                  Filtre e selecione os devedores. "Selecionar todos do filtro"
                  exclui quem está em negociação ativa ou com acordo fechado.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-3">
                <FiltrosBar
                  filters={state.filters}
                  onChange={setFilters}
                  onClear={clear}
                  hasFiltersAtivos={hasFiltersAtivos}
                />

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={selecionarTodosDoFiltro}
                    disabled={carregandoTodos}
                  >
                    {carregandoTodos && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Selecionar todos do filtro
                  </Button>
                  {selecionados.size > 0 && (
                    <Button variant="ghost" size="sm" onClick={limpar}>
                      Limpar seleção
                    </Button>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {pagina?.total ?? 0} no filtro atual
                  </span>
                </div>

                <div className="min-h-0 flex-1 overflow-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">
                          <Checkbox
                            checked={todosDaPaginaSelecionados}
                            onCheckedChange={() => togglePagina(idsPagina)}
                            aria-label="Selecionar página"
                          />
                        </TableHead>
                        <TableHead>Nome</TableHead>
                        <TableHead>Telefone</TableHead>
                        <TableHead>Instituição</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadingDevedores ? (
                        <TableRow>
                          <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                            <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                          </TableCell>
                        </TableRow>
                      ) : devedores.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                            Nenhum devedor no filtro.
                          </TableCell>
                        </TableRow>
                      ) : (
                        devedores.map((d) => (
                          <TableRow
                            key={d.id}
                            className="cursor-pointer"
                            onClick={() => toggle(d.id)}
                          >
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={selecionados.has(d.id)}
                                onCheckedChange={() => toggle(d.id)}
                                aria-label={`Selecionar ${d.nome_devedor}`}
                              />
                            </TableCell>
                            <TableCell className="font-medium">{d.nome_devedor}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {formatTelefone(d.telefone)}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {d.instituicao}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatBRL(d.valor_atualizado)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Paginação */}
                {(pagina?.totalPages ?? 1) > 1 && (
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      Página {pagina?.page} de {pagina?.totalPages}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={(pagina?.page ?? 1) <= 1}
                        onClick={() => setPage((pagina?.page ?? 1) - 1)}
                      >
                        Anterior
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={(pagina?.page ?? 1) >= (pagina?.totalPages ?? 1)}
                        onClick={() => setPage((pagina?.page ?? 1) + 1)}
                      >
                        Próxima
                      </Button>
                    </div>
                  </div>
                )}

                {/* Ação final */}
                <div className="flex items-center justify-end gap-3 border-t pt-3">
                  {!podeGerenciar && (
                    <span className="text-xs text-muted-foreground">
                      Você não tem permissão para criar broadcasts.
                    </span>
                  )}
                  <Button onClick={handleCriar} disabled={!podeCriar}>
                    {criando ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="mr-2 h-4 w-4" />
                    )}
                    Criar broadcast ({selecionados.size})
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Confirmação de cancelamento */}
      <Dialog open={!!cancelando} onOpenChange={(v) => { if (!v) setCancelando(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar broadcast?</DialogTitle>
            <DialogDescription>
              A campanha <strong>{cancelando?.nome}</strong> vai parar de enviar e os
              alvos que ainda estão na fila serão descartados. Isto não pode ser
              desfeito (os já enviados permanecem).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCancelando(null)}
              disabled={acaoId === cancelando?.id}
            >
              Voltar
            </Button>
            <Button
              variant="destructive"
              onClick={confirmarCancelamento}
              disabled={acaoId === cancelando?.id}
            >
              {acaoId === cancelando?.id ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="mr-2 h-4 w-4" />
              )}
              Cancelar broadcast
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
