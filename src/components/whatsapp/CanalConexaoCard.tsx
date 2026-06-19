import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Phone,
  PowerOff,
  QrCode,
  Settings2,
  Smartphone,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useWhatsappStatus } from "@/hooks/useWhatsappStatus";
import {
  useConectarWhatsapp,
  useDesconectarWhatsapp,
} from "@/hooks/useWhatsappMutations";
import { formatTelefone, formatTempoRelativo } from "@/lib/formatters";
import type { Canal } from "@/lib/canais";

function StatusBadge({ estado }: { estado: string | undefined }) {
  if (estado === "connected") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-green-500/40 bg-green-500/10 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Conectado
      </span>
    );
  }
  if (estado === "connecting") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/40 bg-blue-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Conectando
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/40 bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive">
      <XCircle className="h-3.5 w-3.5" />
      Desconectado
    </span>
  );
}

interface Props {
  canal: Canal;
}

export function CanalConexaoCard({ canal }: Props) {
  const instancia = canal.instancia.trim() || null;
  const { data, isLoading, isError, error } = useWhatsappStatus(instancia);
  const { mutateAsync: conectar, isPending: conectando } =
    useConectarWhatsapp(instancia);
  const { mutateAsync: desconectar, isPending: desconectando } =
    useDesconectarWhatsapp(instancia);
  const { toast } = useToast();
  const [confirmandoDisconnect, setConfirmandoDisconnect] = useState(false);

  async function handleConectar() {
    try {
      await conectar();
      toast({
        variant: "success",
        title: "Solicitação enviada",
        description: "Aguarde o QR Code aparecer e escaneie com o WhatsApp.",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Falha ao conectar",
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
    }
  }

  async function handleDesconectar() {
    try {
      await desconectar();
      toast({
        variant: "success",
        title: "Desconectado",
        description: "O WhatsApp foi deslogado.",
      });
      setConfirmandoDisconnect(false);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Falha ao desconectar",
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
    }
  }

  const estado = data?.estado;
  const conectado = estado === "connected";
  const conectandoNow = estado === "connecting";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5" />
              {canal.nome}
              {!canal.ativo && (
                <Badge variant="outline" className="text-[10px]">
                  inativo
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              {instancia ? (
                <>
                  instância{" "}
                  <span className="font-mono">{instancia}</span>
                </>
              ) : (
                "Sem instância definida"
              )}
            </CardDescription>
          </div>
          {instancia && !isLoading && !isError && (
            <StatusBadge estado={estado} />
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!instancia && (
          <div className="flex items-start gap-2 rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-yellow-700 dark:text-yellow-400">
            <Settings2 className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Defina o identificador da instância em{" "}
              <strong>Configurações → Canais de conexão</strong> para gerenciar
              a conexão deste número.
            </p>
          </div>
        )}

        {instancia && isLoading && (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-8 w-2/3" />
          </div>
        )}

        {instancia && isError && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              {error instanceof Error
                ? error.message
                : "Erro ao consultar a UAZAPI. Verifique o webhook do n8n."}
            </p>
          </div>
        )}

        {instancia && !isLoading && !isError && data && (
          <>
            {/* Identificação */}
            <div className="flex items-center gap-4 rounded-md border bg-muted/20 p-3">
              <Avatar className="h-14 w-14">
                {data.foto_perfil && (
                  <AvatarImage
                    src={data.foto_perfil}
                    alt={data.nome_perfil ?? "Perfil"}
                  />
                )}
                <AvatarFallback>
                  {(data.nome_perfil ?? canal.nome ?? "?")
                    .slice(0, 2)
                    .toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {data.nome_perfil ?? "—"}
                  {data.is_business && (
                    <Badge variant="secondary" className="ml-2">
                      Business
                    </Badge>
                  )}
                </p>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Phone className="h-3 w-3" />
                  {formatTelefone(data.telefone ?? canal.numero)}
                </p>
              </div>
            </div>

            {conectado && (
              <div className="rounded-md border border-green-500/30 bg-green-500/5 p-3 text-sm">
                <p className="font-medium text-green-700 dark:text-green-400">
                  Conexão ativa
                </p>
                <p className="text-xs text-muted-foreground">
                  Este número está pronto para receber e enviar mensagens.
                </p>
              </div>
            )}

            {conectandoNow && data.qrcode && (
              <div className="space-y-2 rounded-md border border-blue-500/30 bg-blue-500/5 p-4 text-center">
                <div className="flex items-center justify-center gap-2 text-sm font-medium text-blue-700 dark:text-blue-400">
                  <QrCode className="h-4 w-4" />
                  Escaneie com o WhatsApp do celular
                </div>
                <img
                  src={data.qrcode}
                  alt="QR Code para conectar o WhatsApp"
                  className="mx-auto h-64 w-64 rounded-md bg-white p-2"
                />
                <p className="text-xs text-muted-foreground">
                  No celular: <strong>WhatsApp → Configurações → Aparelhos
                  Conectados → Conectar um aparelho</strong>
                </p>
                <p className="text-[11px] text-muted-foreground">
                  O QR expira em ~60s. Se sumir, clique em "Conectar" de novo.
                </p>
              </div>
            )}

            {!conectado && !conectandoNow && (
              <div className="rounded-md border bg-muted/20 p-3 text-sm">
                <p className="font-medium">WhatsApp desconectado</p>
                {data.ultima_desconexao && (
                  <p className="text-xs text-muted-foreground">
                    Última conexão{" "}
                    {formatTempoRelativo(data.ultima_desconexao)}
                    {data.motivo_desconexao && (
                      <>
                        {" "}
                        · motivo:{" "}
                        <span className="text-foreground">
                          {data.motivo_desconexao}
                        </span>
                      </>
                    )}
                  </p>
                )}
              </div>
            )}

            {/* Ações */}
            <div className="flex flex-wrap items-center gap-2">
              {(!conectado || conectandoNow) && (
                <Button onClick={handleConectar} disabled={conectando}>
                  {conectando ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <QrCode className="mr-2 h-4 w-4" />
                  )}
                  {conectandoNow ? "Gerar novo QR Code" : "Conectar WhatsApp"}
                </Button>
              )}
              {conectado && (
                <Button
                  variant="destructive"
                  onClick={() => setConfirmandoDisconnect(true)}
                >
                  <PowerOff className="mr-2 h-4 w-4" />
                  Desconectar
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>

      <Dialog
        open={confirmandoDisconnect}
        onOpenChange={setConfirmandoDisconnect}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Desconectar {canal.nome}?</DialogTitle>
            <DialogDescription>
              Este número{" "}
              <strong>não conseguirá enviar nem receber mensagens</strong> até
              você conectar de novo via QR Code. Conversas grudadas nele ficam
              sem resposta enquanto estiver desconectado.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmandoDisconnect(false)}
              disabled={desconectando}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDesconectar}
              disabled={desconectando}
            >
              {desconectando ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <PowerOff className="mr-2 h-4 w-4" />
              )}
              Desconectar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
