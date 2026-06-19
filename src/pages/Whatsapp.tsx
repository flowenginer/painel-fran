import { Inbox, Loader2, Settings2 } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useCanais } from "@/hooks/useCanais";
import { CanalConexaoCard } from "@/components/whatsapp/CanalConexaoCard";

export function Whatsapp() {
  const { data: canais, isLoading } = useCanais();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">WhatsApp</h1>
          <p className="text-sm text-muted-foreground">
            Conexão dos números (canais) com o WhatsApp via UAZAPI. Cada canal
            tem seu próprio QR Code.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to="/configuracoes">
            <Settings2 className="mr-2 h-4 w-4" />
            Gerenciar canais
          </Link>
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      )}

      {!isLoading && (canais?.length ?? 0) === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <Inbox className="mb-3 h-10 w-10 opacity-40" />
            <p className="text-sm">Nenhum canal cadastrado.</p>
            <p className="mt-1 text-xs">
              Cadastre os números em Configurações → Canais de conexão.
            </p>
            <Button variant="outline" size="sm" className="mt-4" asChild>
              <Link to="/configuracoes">Ir para Configurações</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {!isLoading && canais && canais.length > 0 && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {canais.map((c) => (
            <CanalConexaoCard key={c.id} canal={c} />
          ))}
        </div>
      )}

      {/* Como funciona */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Como funciona</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-muted-foreground">
          <p>
            Cada canal é uma <strong>instância</strong> da UAZAPI (um número /
            chip). O painel chama a Edge Function{" "}
            <code className="font-mono">uazapi-proxy</code>, que repassa a
            requisição — junto da <strong>instância</strong> — para o workflow
            no n8n. O n8n usa o IP autorizado e o token da instância para falar
            com a UAZAPI.
          </p>
          <p>
            O status atualiza automaticamente a cada{" "}
            <strong>30 segundos</strong>. Ao iniciar uma conexão, o polling
            acelera para <strong>2.5 segundos</strong> até detectar o scan do
            QR.
          </p>
          <p>
            Cada conversa responde sempre pelo{" "}
            <strong>mesmo número que o lead falou</strong>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
