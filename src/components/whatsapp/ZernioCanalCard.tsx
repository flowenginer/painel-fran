// src/components/whatsapp/ZernioCanalCard.tsx
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2, XCircle, AlertTriangle, ExternalLink,
  Phone, RefreshCw, Loader2, Wifi, Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";

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
  connected_at: string | null;
}

async function buscarStatusConta(): Promise<ZernioContaStatus> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Sessão expirou");
  const { data, error } = await supabase.functions.invoke("zernio-templates", {
    body: { acao: "status_conta" },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (error) throw new Error(error instanceof Error ? error.message : "Falha ao buscar status");
  if (data?.error) throw new Error(data.error);
  return data as ZernioContaStatus;
}

function formatarData(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
}

export function ZernioCanalCard() {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["zernio-conta-status"],
    queryFn: buscarStatusConta,
    staleTime: 60_000,
    retry: 1,
  });

  const conectado = data?.status === "connected";

  return (
    <Card className="border-green-500/20">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* Ícone WhatsApp */}
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-500/15">
              <svg className="h-5 w-5 text-green-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
            </div>
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                API Oficial WhatsApp
                <Badge variant="secondary" className="text-[10px]">Zernio</Badge>
              </CardTitle>
              <CardDescription className="text-xs">
                Meta Cloud API — templates, broadcasts e inbox unificado
              </CardDescription>
            </div>
          </div>

          {/* Badge de status */}
          {!isLoading && data && (
            conectado ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-green-500/40 bg-green-500/10 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:text-green-400 shrink-0">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Conectado
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/40 bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive shrink-0">
                <XCircle className="h-3.5 w-3.5" />
                Desconectado
              </span>
            )
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
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
            {/* Bloco principal de info */}
            <div className="rounded-md border bg-muted/20 p-4">
              <div className="flex items-center gap-3">
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${conectado ? "bg-green-500/20" : "bg-muted"}`}>
                  <Phone className={`h-5 w-5 ${conectado ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-sm">
                    {data.nome || "Layla Duarte Click"}
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Phone className="h-3 w-3" />
                    {data.numero || "+55 21 99509-2890"}
                  </p>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 border-t pt-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Wifi className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    Status:{" "}
                    <span className={`font-medium ${conectado ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
                      {conectado ? "Saudável" : "Desconectado"}
                    </span>
                  </span>
                </div>
                {data.connected_at && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5 shrink-0" />
                    <span>Conectado em {formatarData(data.connected_at)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Alerta de conta com problema */}
            {data.sending_limited && (
              <div className="flex items-start gap-2 rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-yellow-700 dark:text-yellow-400">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-medium">Envio limitado pela Meta</p>
                  <p className="text-xs mt-0.5">
                    Verifique o método de pagamento e a verificação do negócio no Meta Business Manager.
                  </p>
                </div>
              </div>
            )}

            {/* Conta conectada e saudável */}
            {conectado && !data.sending_limited && (
              <div className="rounded-md border border-green-500/30 bg-green-500/5 p-3 text-sm">
                <p className="font-medium text-green-700 dark:text-green-400">Conta ativa</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Pronta para templates e broadcasts via API oficial.
                </p>
              </div>
            )}
          </>
        )}

        {/* Ações */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            Atualizar status
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href="https://zernio.com/dashboard/connections" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              Abrir painel Zernio
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
