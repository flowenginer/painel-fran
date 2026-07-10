// src/components/whatsapp/ZernioCanalCard.tsx
// Card de status do canal oficial WhatsApp Business via Zernio.
// Exibe status da conta, número conectado e link para o painel Zernio.
// Dados buscados via Edge Function zernio-templates (acao: "status_conta").

import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ExternalLink,
  Phone,
  ShieldCheck,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";

// ── tipos ──────────────────────────────────────────────────────────────────

interface ZernioContaStatus {
  numero: string;
  nome: string;
  status: "connected" | "disconnected" | "declined" | "unknown";
  healthy: boolean;
  sending_limited: boolean;
  quality_rating: string | null;
  throughput: string | null;
  verified_name: string | null;
  official_business_account: boolean;
  messaging_limit: string | null;
}

// ── busca via supabase.functions.invoke ───────────────────────────────────

async function buscarStatusConta(): Promise<ZernioContaStatus> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Sessão expirou");

  const { data, error } = await supabase.functions.invoke("zernio-templates", {
    body: { acao: "status_conta" },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (error) throw new Error(error instanceof Error ? error.message : "Falha ao buscar status");
  if (data?.error) throw new Error(data.error);
  return data as ZernioContaStatus;
}

// ── sub-componentes ────────────────────────────────────────────────────────

function StatusBadge({ status, sending_limited }: { status: string; sending_limited: boolean }) {
  if (status === "connected" && !sending_limited) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-green-500/40 bg-green-500/10 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Saudável
      </span>
    );
  }
  if (sending_limited) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-yellow-500/40 bg-yellow-500/10 px-2.5 py-0.5 text-xs font-medium text-yellow-700 dark:text-yellow-400">
        <AlertTriangle className="h-3.5 w-3.5" />
        Envio limitado
      </span>
    );
  }
  if (status === "declined") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/40 bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive">
        <XCircle className="h-3.5 w-3.5" />
        Declined
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-muted-foreground/40 bg-muted/50 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
      <XCircle className="h-3.5 w-3.5" />
      Desconectado
    </span>
  );
}

// ── card principal ─────────────────────────────────────────────────────────

export function ZernioCanalCard() {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["zernio-conta-status"],
    queryFn: buscarStatusConta,
    staleTime: 60_000,
    retry: 1,
  });

  return (
    <Card className="border-blue-500/20 bg-blue-500/5">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2">
              {/* Ícone do WhatsApp oficial */}
              <svg className="h-5 w-5 text-green-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              API Oficial WhatsApp
              <Badge variant="secondary" className="text-[10px] bg-blue-500/20 text-blue-700 dark:text-blue-300">
                Zernio
              </Badge>
            </CardTitle>
            <CardDescription>
              Canal oficial Meta Cloud API — templates, broadcasts e inbox unificado.
            </CardDescription>
          </div>

          {!isLoading && data && (
            <StatusBadge status={data.status} sending_limited={data.sending_limited} />
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Verificando status da conta...
          </div>
        )}

        {isError && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{error instanceof Error ? error.message : "Erro ao consultar o Zernio."}</p>
          </div>
        )}

        {data && (
          <>
            {/* Identificação do número */}
            <div className="flex items-center gap-4 rounded-md border bg-muted/20 p-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500/20 text-green-600 dark:text-green-400">
                <Phone className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {data.verified_name ?? data.nome ?? "—"}
                  {data.official_business_account && (
                    <Badge variant="secondary" className="ml-2 text-[10px]">
                      <ShieldCheck className="mr-1 h-3 w-3" />
                      Verificado
                    </Badge>
                  )}
                </p>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Phone className="h-3 w-3" />
                  {data.numero}
                </p>
              </div>
            </div>

            {/* Métricas da conta */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {data.quality_rating && (
                <div className="rounded-md border bg-muted/20 px-3 py-2">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Qualidade</p>
                  <p className="text-sm font-medium">{data.quality_rating}</p>
                </div>
              )}
              {data.throughput && (
                <div className="rounded-md border bg-muted/20 px-3 py-2">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Throughput</p>
                  <p className="text-sm font-medium">{data.throughput}</p>
                </div>
              )}
              {data.messaging_limit && (
                <div className="rounded-md border bg-muted/20 px-3 py-2">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Limite/dia</p>
                  <p className="text-sm font-medium">{data.messaging_limit}</p>
                </div>
              )}
            </div>

            {/* Alerta de conta Declined / Sending Limited */}
            {(data.status === "declined" || data.sending_limited) && (
              <div className="flex items-start gap-2 rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-yellow-700 dark:text-yellow-400">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-medium">
                    {data.status === "declined" ? "Conta Declined pela Meta" : "Envio limitado"}
                  </p>
                  <p className="text-xs mt-0.5">
                    Verifique o método de pagamento e a verificação do negócio no Meta Business Manager.
                    Broadcasts e templates não funcionam enquanto a conta estiver neste estado.
                  </p>
                </div>
              </div>
            )}

            {/* Conta saudável */}
            {data.healthy && !data.sending_limited && (
              <div className="rounded-md border border-green-500/30 bg-green-500/5 p-3 text-sm">
                <p className="font-medium text-green-700 dark:text-green-400">
                  Conta saudável
                </p>
                <p className="text-xs text-muted-foreground">
                  Pronta para receber e enviar mensagens via API oficial.
                </p>
              </div>
            )}
          </>
        )}

        {/* Ações */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            Atualizar status
          </Button>
          <Button
            variant="outline"
            size="sm"
            asChild
          >
            <a
              href="https://zernio.com/dashboard/connections"
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Abrir painel Zernio
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
