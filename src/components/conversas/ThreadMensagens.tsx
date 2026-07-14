import { Fragment, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  Ban,
  Check,
  ChevronDown,
  Clock,
  Inbox,
  Loader2,
  MessageSquare,
  Phone,
  ShieldCheck,
  Smartphone,
  UserRound,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  filtrarVisiveis,
  useMensagensConversa,
} from "@/hooks/useMensagensConversa";
import {
  STATUS_BLOCK_IA,
  useToggleBlockIA,
} from "@/hooks/useDevedorMutations";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useOperadores } from "@/hooks/useOperadores";
import { useCanais } from "@/hooks/useCanais";
import { useConfig } from "@/hooks/useConfig";
import { cn } from "@/lib/utils";
import { nomeOperador } from "@/lib/conversas-transfer";
import { formatTelefone } from "@/lib/formatters";
import { formatDuracaoRestante } from "@/lib/dates";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { MensagemBubble } from "./MensagemBubble";
import { Composer } from "./Composer";
import { SugestaoPanel } from "./SugestaoPanel";
import { TransferirConversaDialog } from "./TransferirConversaDialog";
import {
  VisualizadorMidia,
  type MidiaAberta,
} from "./VisualizadorMidia";
import type { ConversaItem } from "@/hooks/useConversas";

interface Props {
  conversa: ConversaItem | null;
}

/** Dia (YYYY-MM-DD) no fuso de São Paulo, para comparar/agrupar por data. */
function diaSP(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Rótulo amigável do dia: Hoje, Ontem ou "sáb, 28/06/2026". */
function rotuloDia(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const dia = diaSP(iso);
  const hoje = diaSP(new Date().toISOString());
  const ontem = diaSP(new Date(Date.now() - 86_400_000).toISOString());
  if (dia === hoje) return "Hoje";
  if (dia === ontem) return "Ontem";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

function iniciais(nome: string | null | undefined): string {
  if (!nome) return "?";
  return nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

export function ThreadMensagens({ conversa }: Props) {
  const telefone = conversa?.telefone_normalizado ?? null;
  const { data, isLoading, isError, error } =
    useMensagensConversa(telefone);

  const scrollRef = useRef<HTMLDivElement>(null);
  const visiveis = filtrarVisiveis(data ?? []);

  const [confirmandoToggle, setConfirmandoToggle] = useState(false);
  const [transferindo, setTransferindo] = useState(false);
  const [midiaAberta, setMidiaAberta] = useState<MidiaAberta | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // Canal de envio escolhido manualmente no menu (sobrescreve o "grudado").
  const [canalManual, setCanalManual] = useState<string | null>(null);
  const { mutateAsync: toggleBlock, isPending: alterandoBlock } =
    useToggleBlockIA();
  const { toast } = useToast();
  const { isAdmin, temPermissao } = useAuth();
  const { data: operadores } = useOperadores();
  const { data: canais } = useCanais();
  const { data: config } = useConfig();

  // Canal "grudado" da conversa = instância da última mensagem com canal.
  const canalInstancia = conversa?.ultima_mensagem?.canal ?? null;
  // Reseta a escolha manual ao trocar de conversa.
  useEffect(() => {
    setCanalManual(null);
  }, [telefone]);
  // Canal de envio efetivo = escolha manual (menu) ou o grudado.
  const canalSelecionado = canalManual ?? canalInstancia;

  // Valor do canal oficial (Zernio) = "zernio:<accountId>" da config.
  const zernioAccountId = config?.zernio_account_id ?? "";
  const canalOficialValor = zernioAccountId ? `zernio:${zernioAccountId}` : null;
  // Números UAZAPI ativos, para o menu de canal de envio.
  const canaisUazapi = (canais ?? []).filter((c) => c.ativo);

  const canalNome = canalSelecionado
    ? canais?.find((c) => c.instancia === canalSelecionado)?.nome ?? canalSelecionado
    : null;
  // Canal oficial = Meta Cloud API (Zernio); os demais são UAZAPI (não-oficial).
  const ehCanalOficial = canalSelecionado?.startsWith("zernio:") ?? false;
  // Só mostra o nome amigável do número quando resolvido (nunca o ID cru).
  const canalNomeAmigavel =
    canalNome && canalNome !== canalSelecionado ? canalNome : null;

  // Janela de 24h (só canal oficial): no WhatsApp Business só se pode enviar
  // texto livre até 24h após a última mensagem do lead (type "human"). Fora
  // disso, apenas template. Computamos no cliente para travar o composer.
  const WINDOW_MS = 24 * 60 * 60 * 1000;
  const ultimoInboundMs = ehCanalOficial
    ? (data ?? []).reduce<number | null>((max, m) => {
        if (m.type !== "human" || !m.created_at) return max;
        const t = new Date(m.created_at).getTime();
        if (isNaN(t)) return max;
        return max === null || t > max ? t : max;
      }, null)
    : null;
  const expiraMs = ultimoInboundMs !== null ? ultimoInboundMs + WINDOW_MS : null;
  const janelaAberta = expiraMs !== null && now < expiraMs;
  const restanteMs = expiraMs !== null ? expiraMs - now : 0;
  // UAZAPI nunca trava; oficial trava quando a janela não está aberta.
  const janelaFechada = ehCanalOficial && !janelaAberta;

  // Atualiza o "agora" a cada 30s para o timer decrementar e a janela virar
  // "fechada" ao vivo. Só liga no canal oficial.
  useEffect(() => {
    if (!ehCanalOficial) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [ehCanalOficial]);

  const iaBloqueada = conversa?.devedor?.status === STATUS_BLOCK_IA;
  const responsavelId = conversa?.devedor?.responsavel_id ?? null;
  const responsavelNome = nomeOperador(operadores, responsavelId);
  const podeTransferir =
    !!conversa?.devedor &&
    (isAdmin || temPermissao("acao", "transferir_conversa"));

  async function confirmarToggle() {
    if (!conversa?.devedor) return;
    try {
      await toggleBlock({
        id: conversa.devedor.id,
        bloquear: !iaBloqueada,
      });
      toast({
        variant: "success",
        title: iaBloqueada ? "IA desbloqueada" : "IA bloqueada",
        description: iaBloqueada
          ? `${conversa.devedor.nome_devedor} voltará a receber respostas da Fran.`
          : `${conversa.devedor.nome_devedor} não receberá mais respostas automáticas.`,
      });
      setConfirmandoToggle(false);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro ao atualizar",
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
    }
  }

  // Auto-scroll para o final ao receber mensagens novas
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [visiveis.length]);

  if (!conversa) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-muted/5 p-8 text-center text-muted-foreground">
        <MessageSquare className="mb-3 h-12 w-12 opacity-40" />
        <p className="text-sm">Selecione uma conversa à esquerda</p>
        <p className="mt-1 text-xs">
          O histórico de mensagens entre a Fran e o lead aparecerá aqui.
        </p>
      </div>
    );
  }

  const nomeExibido =
    conversa.devedor?.nome_devedor ??
    (conversa.telefone_normalizado
      ? `+${conversa.telefone_normalizado}`
      : "(sem identificação)");

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-start gap-3 border-b bg-background px-4 py-3">
        <Avatar className="h-10 w-10 shrink-0">
          <AvatarFallback>{iniciais(nomeExibido)}</AvatarFallback>
        </Avatar>

        {/* Identificação + metadados (ocupam a coluna esquerda, sem colidir) */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{nomeExibido}</p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Phone className="h-3 w-3 shrink-0" />
            <span className="truncate">
              {conversa.devedor
                ? formatTelefone(conversa.devedor.telefone)
                : conversa.session_id_exibicao}
              {conversa.devedor?.instituicao && ` · ${conversa.devedor.instituicao}`}
            </span>
          </p>

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {conversa.devedor && (
              <Badge
                variant="outline"
                className="gap-1 text-[10px]"
                title="Operador responsável por esta conversa"
              >
                <UserRound className="h-3 w-3" />
                {responsavelNome ?? "Sem responsável"}
              </Badge>
            )}
            {canalSelecionado &&
              (ehCanalOficial ? (
                <Badge
                  variant="outline"
                  className="gap-1 border-green-500/40 bg-green-500/10 text-[10px] text-green-700 dark:text-green-400"
                  title="Canal oficial — API do WhatsApp Business (Meta Cloud API via Zernio)"
                >
                  <ShieldCheck className="h-3 w-3" />
                  Oficial
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="gap-1 text-[10px]"
                  title="Canal não-oficial (UAZAPI)"
                >
                  <Smartphone className="h-3 w-3" />
                  Não-oficial{canalNomeAmigavel ? ` · ${canalNomeAmigavel}` : ""}
                </Badge>
              ))}
            {ehCanalOficial &&
              (janelaAberta ? (
                <Badge
                  variant="outline"
                  className={`gap-1 text-[10px] ${
                    restanteMs < 60 * 60 * 1000
                      ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                      : "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400"
                  }`}
                  title="Tempo restante da janela de 24h para mensagem livre (WhatsApp oficial). Depois disso, só template."
                >
                  <Clock className="h-3 w-3" />
                  Janela: {formatDuracaoRestante(restanteMs)}
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="gap-1 border-muted-foreground/30 bg-muted text-[10px] text-muted-foreground"
                  title="A janela de 24h fechou. Só é possível enviar um template aprovado; o texto livre reabre quando o lead responder."
                >
                  <Clock className="h-3 w-3" />
                  Janela fechada
                </Badge>
              ))}
            {conversa.devedor?.status_negociacao && (
              <StatusBadge status={conversa.devedor.status_negociacao} />
            )}
            {iaBloqueada && (
              <Badge className="gap-1 bg-destructive text-[10px] text-destructive-foreground hover:bg-destructive">
                <Ban className="h-3 w-3" />
                IA bloqueada
              </Badge>
            )}
          </div>
        </div>

        {/* Ações — fixas à direita, só ícone em telas estreitas */}
        <div className="flex shrink-0 items-center gap-2">
          {/* Canal de envio — escolhe por qual número as mensagens saem */}
          {(canalOficialValor || canaisUazapi.length > 0) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" title="Canal de envio">
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      ehCanalOficial
                        ? "bg-green-500"
                        : canalSelecionado
                          ? "bg-rose-500"
                          : "bg-muted-foreground"
                    )}
                  />
                  <span className="mx-1.5 hidden max-w-[120px] truncate sm:inline">
                    {ehCanalOficial ? "Oficial" : canalNomeAmigavel ?? "Canal"}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Canal de envio</DropdownMenuLabel>
                {canalOficialValor && (
                  <DropdownMenuItem
                    className="gap-2"
                    onClick={() => setCanalManual(canalOficialValor)}
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full bg-green-500" />
                    Oficial (WhatsApp Business)
                    {canalSelecionado === canalOficialValor && (
                      <Check className="ml-auto h-4 w-4" />
                    )}
                  </DropdownMenuItem>
                )}
                {canaisUazapi.map((c) => (
                  <DropdownMenuItem
                    key={c.id}
                    className="gap-2"
                    onClick={() => setCanalManual(c.instancia)}
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full bg-rose-500" />
                    <span className="truncate">{c.nome}</span>
                    {canalSelecionado === c.instancia && (
                      <Check className="ml-auto h-4 w-4" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {podeTransferir && conversa.devedor && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTransferindo(true)}
              title="Transferir esta conversa para outro operador"
            >
              <ArrowLeftRight className="h-3.5 w-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">Transferir</span>
            </Button>
          )}
          {conversa.devedor && (
            <Button
              variant={iaBloqueada ? "outline" : "destructive"}
              size="sm"
              onClick={() => setConfirmandoToggle(true)}
              disabled={alterandoBlock}
              title={
                iaBloqueada
                  ? "Permite que a Fran volte a responder este devedor"
                  : "Impede a Fran de responder este devedor"
              }
            >
              {alterandoBlock ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin sm:mr-1.5" />
              ) : iaBloqueada ? (
                <ShieldCheck className="h-3.5 w-3.5 sm:mr-1.5" />
              ) : (
                <Ban className="h-3.5 w-3.5 sm:mr-1.5" />
              )}
              <span className="hidden sm:inline">
                {iaBloqueada ? "Desbloquear IA" : "Bloquear IA"}
              </span>
            </Button>
          )}
        </div>
      </div>

      {/* Mensagens */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-muted/5 p-4"
      >
        {isLoading && (
          <>
            <Skeleton className="ml-0 h-12 w-2/3" />
            <Skeleton className="ml-auto h-12 w-1/2" />
            <Skeleton className="ml-0 h-16 w-3/4" />
          </>
        )}

        {isError && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              {error instanceof Error
                ? error.message
                : "Erro ao carregar mensagens"}
            </p>
          </div>
        )}

        {!isLoading && !isError && visiveis.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <Inbox className="mb-2 h-8 w-8 opacity-40" />
            <p className="text-sm">Sem mensagens nesta conversa</p>
            <p className="mt-1 text-xs">
              Quando a Fran enviar ou receber a primeira mensagem, ela
              aparece aqui automaticamente.
            </p>
          </div>
        )}

        {!isLoading &&
          !isError &&
          visiveis.map((m, i) => {
            const anterior = visiveis[i - 1];
            const label =
              m.created_at && diaSP(anterior?.created_at) !== diaSP(m.created_at)
                ? rotuloDia(m.created_at)
                : "";
            return (
              <Fragment key={m.id}>
                {label && (
                  <div className="flex justify-center py-2">
                    <span className="rounded-full bg-muted px-3 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {label}
                    </span>
                  </div>
                )}
                <MensagemBubble
                  mensagem={m}
                  autorNome={nomeOperador(operadores, m.enviado_por)}
                  onAbrirMidia={setMidiaAberta}
                />
              </Fragment>
            );
          })}
      </div>

      {/* Aviso quando a IA ainda está ativa */}
      {!iaBloqueada && conversa.devedor && (
        <div className="shrink-0 border-t bg-yellow-500/10 px-4 py-1.5 text-center text-[11px] text-yellow-700 dark:text-yellow-400">
          A IA ainda está ativa nesta conversa. Bloqueie a IA para assumir o
          atendimento manualmente sem respostas automáticas.
        </div>
      )}

      {/* Aviso de janela de 24h fechada (só canal oficial) */}
      {janelaFechada && !isLoading && (
        <div className="shrink-0 border-t bg-muted px-4 py-1.5 text-center text-[11px] text-muted-foreground">
          Janela de 24h fechada. Mensagens livres ficam bloqueadas até o lead
          responder — para reabrir agora, envie um{" "}
          <a href="/templates" className="font-medium underline">
            template aprovado
          </a>
          .
        </div>
      )}

      {/* Composer (roteia UAZAPI/Zernio pelo canal selecionado) */}
      <Composer
        telefoneNormalizado={telefone}
        canal={canalSelecionado}
        disabled={!telefone}
        janelaFechada={janelaFechada}
      />

      {/* Modal de confirmação Bloquear/Desbloquear IA */}
      <Dialog open={confirmandoToggle} onOpenChange={setConfirmandoToggle}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {iaBloqueada
                ? "Desbloquear IA para este devedor?"
                : "Bloquear IA para este devedor?"}
            </DialogTitle>
            <DialogDescription>
              {iaBloqueada ? (
                <>
                  A Fran voltará a responder mensagens recebidas deste número
                  automaticamente.
                </>
              ) : (
                <>
                  A Fran <strong>não responderá mais</strong> as mensagens
                  recebidas deste número. Use quando o gestor precisar assumir
                  o atendimento manualmente. O bloqueio pode ser revertido
                  depois.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {conversa?.devedor && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p className="font-medium">{conversa.devedor.nome_devedor}</p>
              <p className="text-xs text-muted-foreground">
                {formatTelefone(conversa.devedor.telefone)}
                {conversa.devedor.instituicao &&
                  ` · ${conversa.devedor.instituicao}`}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmandoToggle(false)}
              disabled={alterandoBlock}
            >
              Cancelar
            </Button>
            <Button
              variant={iaBloqueada ? "default" : "destructive"}
              onClick={confirmarToggle}
              disabled={alterandoBlock}
            >
              {alterandoBlock ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : iaBloqueada ? (
                <ShieldCheck className="mr-2 h-4 w-4" />
              ) : (
                <Ban className="mr-2 h-4 w-4" />
              )}
              {iaBloqueada ? "Desbloquear" : "Bloquear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de transferência de conversa */}
      {conversa.devedor && (
        <TransferirConversaDialog
          open={transferindo}
          onOpenChange={setTransferindo}
          devedorId={conversa.devedor.id}
          devedorNome={conversa.devedor.nome_devedor}
          responsavelAtualId={responsavelId}
          operadores={operadores ?? []}
        />
      )}

      {/* Visualizador de mídia (imagem/PDF) dentro do sistema */}
      <VisualizadorMidia midia={midiaAberta} onClose={() => setMidiaAberta(null)} />

      {/* Assistente de sugestão de resposta (IA) — botão flutuante */}
      <SugestaoPanel telefone={telefone} />
    </div>
  );
}
