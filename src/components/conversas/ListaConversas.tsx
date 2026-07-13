import { useMemo, useState, type ReactNode } from "react";
import { Ban, Search, UserRound } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { previewContent } from "@/lib/conversas";
import { nomeOperador, type OperadorLite } from "@/lib/conversas-transfer";
import { formatTelefone } from "@/lib/formatters";
import { STATUS_BLOCK_IA } from "@/hooks/useDevedorMutations";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import type { ConversaItem } from "@/hooks/useConversas";

interface Props {
  conversas: ConversaItem[];
  selecionada: string | null;
  onSelecionar: (telefone: string) => void;
  isLoading: boolean;
  /** Mostra o operador responsável em cada item (visão de admin). */
  mostrarResponsavel?: boolean;
  operadores?: OperadorLite[];
  /** Retorna true quando a conversa tem mensagem nova do lead (não lida). */
  naoLida?: (c: ConversaItem) => boolean;
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

/** Hora curta (HH:mm) da mensagem, no fuso de São Paulo. */
function horaCurta(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** Chip de filtro (toggle) da lista de conversas. */
function FiltroChip({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] transition-colors",
        ativo
          ? "border-primary bg-primary/10 font-medium text-primary"
          : "text-muted-foreground hover:bg-accent"
      )}
    >
      {children}
    </button>
  );
}

/** Canal oficial (Zernio) da última mensagem da conversa. */
function canalDaConversa(c: ConversaItem): "oficial" | "nao_oficial" | null {
  const canal = c.ultima_mensagem?.canal ?? null;
  if (canal == null) return null;
  return canal.startsWith("zernio:") ? "oficial" : "nao_oficial";
}

export function ListaConversas({
  conversas,
  selecionada,
  onSelecionar,
  isLoading,
  mostrarResponsavel = false,
  operadores,
  naoLida,
}: Props) {
  const [busca, setBusca] = useState("");
  const [canalFiltro, setCanalFiltro] = useState<"todos" | "oficial" | "nao_oficial">("todos");
  const [semResposta, setSemResposta] = useState(false);
  const [soNaoLidas, setSoNaoLidas] = useState(false);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qDigitos = q.replace(/\D/g, "");
    return conversas.filter((c) => {
      // Busca por nome/telefone.
      if (q) {
        const nome = c.devedor?.nome_devedor?.toLowerCase() ?? "";
        const tel = c.telefone_normalizado;
        // Só casa por telefone quando há dígitos na busca — senão tel.includes("")
        // seria sempre true e o filtro deixaria tudo passar.
        const casa =
          nome.includes(q) || (qDigitos.length > 0 && tel.includes(qDigitos));
        if (!casa) return false;
      }
      // Canal (oficial / não-oficial).
      if (canalFiltro !== "todos" && canalDaConversa(c) !== canalFiltro) {
        return false;
      }
      // Sem resposta = a última mensagem foi nossa (type "ai").
      if (semResposta && c.ultima_mensagem?.type !== "ai") return false;
      // Não lidas (usa o marcador vindo do pai).
      if (soNaoLidas && !(naoLida?.(c) ?? false)) return false;
      return true;
    });
  }, [conversas, busca, canalFiltro, semResposta, soNaoLidas, naoLida]);

  const temFiltroAtivo =
    canalFiltro !== "todos" || semResposta || soNaoLidas || busca.trim() !== "";

  return (
    <div className="flex h-full min-h-0 flex-col border-r bg-muted/10">
      <div className="shrink-0 border-b p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar nome ou telefone..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="h-9 pl-8"
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <FiltroChip
            ativo={canalFiltro === "oficial"}
            onClick={() =>
              setCanalFiltro((v) => (v === "oficial" ? "todos" : "oficial"))
            }
          >
            <span className="h-2 w-2 rounded-full bg-green-500" />
            Oficial
          </FiltroChip>
          <FiltroChip
            ativo={canalFiltro === "nao_oficial"}
            onClick={() =>
              setCanalFiltro((v) => (v === "nao_oficial" ? "todos" : "nao_oficial"))
            }
          >
            <span className="h-2 w-2 rounded-full bg-rose-500" />
            Não-oficial
          </FiltroChip>
          <FiltroChip ativo={semResposta} onClick={() => setSemResposta((v) => !v)}>
            Sem resposta
          </FiltroChip>
          {naoLida && (
            <FiltroChip ativo={soNaoLidas} onClick={() => setSoNaoLidas((v) => !v)}>
              Não lidas
            </FiltroChip>
          )}
        </div>

        {!isLoading && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            {filtradas.length} conversa{filtradas.length !== 1 ? "s" : ""}
            {temFiltroAtivo && ` · de ${conversas.length} totais`}
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading && (
          <div className="space-y-1 p-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-2">
                <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-3 w-2/3" />
                  <Skeleton className="h-2 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && filtradas.length === 0 && (
          <p className="p-6 text-center text-sm text-muted-foreground">
            Nenhuma conversa encontrada.
          </p>
        )}

        <ul className="divide-y">
          {filtradas.map((c) => {
            const ativo = c.telefone_normalizado === selecionada;
            const nova = naoLida?.(c) ?? false;
            const nomeExibido =
              c.devedor?.nome_devedor ??
              (c.telefone_normalizado
                ? `+${c.telefone_normalizado}`
                : "(sem identificação)");
            return (
              <li key={c.telefone_normalizado}>
                <button
                  type="button"
                  onClick={() => onSelecionar(c.telefone_normalizado)}
                  className={cn(
                    "flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent",
                    ativo && "bg-accent",
                    nova && !ativo && "bg-green-500/10"
                  )}
                >
                  <div
                    className="relative shrink-0"
                    title={
                      canalDaConversa(c) === "oficial"
                        ? "Canal oficial (WhatsApp Business / Zernio)"
                        : canalDaConversa(c) === "nao_oficial"
                          ? "Canal não-oficial (UAZAPI)"
                          : undefined
                    }
                  >
                    <Avatar
                      className={cn(
                        "h-10 w-10",
                        canalDaConversa(c) === "oficial" &&
                          "ring-2 ring-green-500 ring-offset-2 ring-offset-background",
                        canalDaConversa(c) === "nao_oficial" &&
                          "ring-2 ring-rose-500 ring-offset-2 ring-offset-background"
                      )}
                    >
                      <AvatarFallback>{iniciais(nomeExibido)}</AvatarFallback>
                    </Avatar>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          "truncate text-sm",
                          nova ? "font-bold text-foreground" : "font-medium"
                        )}
                      >
                        {nomeExibido}
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        {nova && (
                          <span
                            className="h-2.5 w-2.5 rounded-full bg-green-500 shadow-[0_0_0_3px_rgba(34,197,94,0.2)]"
                            title="Mensagem nova"
                          />
                        )}
                        {c.ultima_mensagem?.created_at && (
                          <span className="text-[10px] text-muted-foreground">
                            {horaCurta(c.ultima_mensagem.created_at)}
                          </span>
                        )}
                      </span>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.devedor
                        ? formatTelefone(c.devedor.telefone)
                        : `+${c.telefone_normalizado}`}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {mostrarResponsavel && c.devedor && (
                        <span
                          className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground"
                          title="Operador responsável"
                        >
                          <UserRound className="h-3 w-3" />
                          {nomeOperador(operadores, c.devedor.responsavel_id) ??
                            "sem responsável"}
                        </span>
                      )}
                      {c.devedor?.status_negociacao && (
                        <StatusBadge
                          status={c.devedor.status_negociacao}
                        />
                      )}
                      {c.devedor?.status === STATUS_BLOCK_IA && (
                        <span
                          className="inline-flex items-center gap-1 rounded-full bg-destructive px-2 py-0.5 text-[10px] font-medium text-destructive-foreground"
                          title="IA bloqueada para este devedor"
                        >
                          <Ban className="h-3 w-3" />
                          IA bloqueada
                        </span>
                      )}
                    </div>
                    {c.ultima_mensagem ? (
                      <p
                        className={cn(
                          "mt-1 truncate text-xs",
                          nova
                            ? "font-medium text-foreground"
                            : "text-muted-foreground"
                        )}
                      >
                        <span
                          className={cn(
                            "font-medium",
                            c.ultima_mensagem.type === "ai"
                              ? "text-primary"
                              : "text-foreground"
                          )}
                        >
                          {c.ultima_mensagem.type === "ai"
                            ? "Fran: "
                            : "Devedor: "}
                        </span>
                        {previewContent(c.ultima_mensagem.content)}
                      </p>
                    ) : (
                      <p className="mt-1 truncate text-xs italic text-muted-foreground">
                        sem mensagens
                      </p>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
