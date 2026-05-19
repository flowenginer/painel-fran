import { useEffect, useRef } from "react";
import {
  AlertTriangle,
  Inbox,
  Lock,
  MessageSquare,
  Phone,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  filtrarVisiveis,
  useMensagensConversa,
} from "@/hooks/useMensagensConversa";
import { formatTelefone } from "@/lib/formatters";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { MensagemBubble } from "./MensagemBubble";
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
        <div className="flex shrink-0 items-center gap-2">
          {conversa.devedor?.status_negociacao && (
            <StatusBadge status={conversa.devedor.status_negociacao} />
          )}
          <Badge
            variant="outline"
            className="hidden gap-1 text-[10px] sm:inline-flex"
            title="Esta visualização é somente leitura"
          >
            <Lock className="h-3 w-3" />
            Somente leitura
          </Badge>
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
            <MensagemBubble key={m.id} mensagem={m} />
          ))}
      </div>

      {/* Rodapé indicando read-only */}
      <div className="flex shrink-0 items-center justify-center gap-2 border-t bg-muted/20 px-4 py-2 text-xs text-muted-foreground">
        <Lock className="h-3 w-3" />
        <span>Histórico em tempo real · sem envio de mensagens</span>
      </div>
    </div>
  );
}
