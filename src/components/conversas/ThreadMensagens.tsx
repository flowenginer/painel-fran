import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  Ban,
  Inbox,
  Loader2,
  MessageSquare,
  Phone,
  ShieldCheck,
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
import { nomeOperador } from "@/lib/conversas-transfer";
import { formatTelefone } from "@/lib/formatters";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { MensagemBubble } from "./MensagemBubble";
import { Composer } from "./Composer";
import { TransferirConversaDialog } from "./TransferirConversaDialog";
import type { ConversaItem } from "@/hooks/useConversas";

interface Props {
  conversa: ConversaItem | null;
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
  const { mutateAsync: toggleBlock, isPending: alterandoBlock } =
    useToggleBlockIA();
  const { toast } = useToast();
  const { isAdmin, temPermissao } = useAuth();
  const { data: operadores } = useOperadores();

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
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b bg-background px-4 py-3">
        <Avatar className="h-10 w-10">
          <AvatarFallback>{iniciais(nomeExibido)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{nomeExibido}</p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Phone className="h-3 w-3" />
            {conversa.devedor
              ? formatTelefone(conversa.devedor.telefone)
              : conversa.session_id_exibicao}
            {conversa.devedor?.instituicao && (
              <span className="ml-2 truncate">
                · {conversa.devedor.instituicao}
              </span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
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
          {podeTransferir && conversa.devedor && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTransferindo(true)}
              title="Transferir esta conversa para outro operador"
            >
              <ArrowLeftRight className="mr-1.5 h-3.5 w-3.5" />
              Transferir
            </Button>
          )}
          {conversa.devedor?.status_negociacao && (
            <StatusBadge status={conversa.devedor.status_negociacao} />
          )}
          {iaBloqueada && (
            <Badge
              variant="outline"
              className="gap-1 border-destructive/40 bg-destructive/10 text-[10px] text-destructive"
            >
              <Ban className="h-3 w-3" />
              IA bloqueada
            </Badge>
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
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : iaBloqueada ? (
                <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
              ) : (
                <Ban className="mr-1.5 h-3.5 w-3.5" />
              )}
              {iaBloqueada ? "Desbloquear IA" : "Bloquear IA"}
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
          visiveis.map((m) => (
            <MensagemBubble
              key={m.id}
              mensagem={m}
              autorNome={nomeOperador(operadores, m.enviado_por)}
            />
          ))}
      </div>

      {/* Aviso quando a IA ainda está ativa */}
      {!iaBloqueada && conversa.devedor && (
        <div className="shrink-0 border-t bg-yellow-500/10 px-4 py-1.5 text-center text-[11px] text-yellow-700 dark:text-yellow-400">
          A IA ainda está ativa nesta conversa. Bloqueie a IA para assumir o
          atendimento manualmente sem respostas automáticas.
        </div>
      )}

      {/* Composer (envio de mensagem via n8n → UAZAPI) */}
      <Composer telefoneNormalizado={telefone} disabled={!telefone} />

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
    </div>
  );
}
