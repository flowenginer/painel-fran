import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { formatTelefone } from "@/lib/formatters";
import { diaSP, rotuloDia, duracaoRestante, janelaAberta } from "@/lib/dates";
import { listarMensagens } from "@/lib/conversas";
import { etapaFunil } from "@/lib/pacientes-funil";
import { MensagemBubble } from "./MensagemBubble";
import { Composer } from "./Composer";
import type { ConversaComPaciente, Mensagem } from "@/lib/types";

interface ThreadMensagensProps {
  conversa: ConversaComPaciente | null;
}

export function ThreadMensagens({ conversa }: ThreadMensagensProps) {
  const fimRef = useRef<HTMLDivElement>(null);

  const { data: mensagens, isLoading } = useQuery({
    queryKey: ["mensagens", conversa?.id],
    queryFn: () => listarMensagens(conversa!.id),
    enabled: !!conversa,
    staleTime: 5000,
  });

  // Rola pro fim quando chega mensagem nova.
  useEffect(() => {
    fimRef.current?.scrollIntoView({ block: "end" });
  }, [mensagens]);

  const grupos = useMemo(() => agruparPorDia(mensagens ?? []), [mensagens]);

  if (!conversa) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Selecione uma conversa para ver as mensagens.
      </div>
    );
  }

  const oficial = conversa.canal?.tipo === "zernio";
  const etapa = conversa.paciente
    ? etapaFunil(conversa.paciente.status_funil)
    : null;
  const restante = oficial ? duracaoRestante(conversa.janela_expira_at) : "";
  const janelaFechada = oficial && !janelaAberta(conversa.janela_expira_at);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            {conversa.paciente?.nome || formatTelefone(conversa.telefone)}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {formatTelefone(conversa.telefone)}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          <Badge
            variant="outline"
            className={
              oficial
                ? "border-emerald-500/40 text-emerald-600"
                : "border-pink-500/40 text-pink-600"
            }
          >
            {oficial ? "Oficial" : "Não-oficial"}
          </Badge>
          {etapa && (
            <Badge variant={etapa.variant} className={etapa.className}>
              {etapa.label}
            </Badge>
          )}
          {oficial && janelaFechada && (
            <Badge variant="secondary">Janela fechada</Badge>
          )}
          {oficial && !janelaFechada && restante && (
            <Badge variant="outline" className="border-amber-500/40 text-amber-600">
              Janela: {restante}
            </Badge>
          )}
        </div>
      </div>

      {/* Mensagens */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-muted/20 p-4">
        {isLoading && (
          <p className="text-center text-xs text-muted-foreground">
            Carregando mensagens…
          </p>
        )}
        {!isLoading && (mensagens?.length ?? 0) === 0 && (
          <p className="text-center text-xs text-muted-foreground">
            Nenhuma mensagem nesta conversa ainda.
          </p>
        )}
        {grupos.map((g) => (
          <div key={g.dia} className="space-y-3">
            <div className="flex justify-center">
              <span className="rounded-full bg-background px-3 py-1 text-[11px] text-muted-foreground shadow-sm">
                {rotuloDia(g.mensagens[0].created_at)}
              </span>
            </div>
            {g.mensagens.map((m) => (
              <MensagemBubble key={m.id} m={m} />
            ))}
          </div>
        ))}
        <div ref={fimRef} />
      </div>

      <Composer conversaId={conversa.id} janelaFechada={janelaFechada} />
    </div>
  );
}

function agruparPorDia(mensagens: Mensagem[]) {
  const grupos: { dia: string; mensagens: Mensagem[] }[] = [];
  for (const m of mensagens) {
    const dia = diaSP(m.created_at);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.dia === dia) {
      ultimo.mensagens.push(m);
    } else {
      grupos.push({ dia, mensagens: [m] });
    }
  }
  return grupos;
}
