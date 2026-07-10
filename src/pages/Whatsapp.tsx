// src/pages/Whatsapp.tsx
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
import { ZernioCanalCard } from "@/components/whatsapp/ZernioCanalCard";

export function Whatsapp() {
  const { data: canais, isLoading } = useCanais();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">WhatsApp</h1>
          <p className="text-sm text-muted-foreground">
            Canais de mensageria: API não-oficial (UAZAPI) e API oficial (Zernio/Meta).
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to="/configuracoes">
            <Settings2 className="mr-2 h-4 w-4" />
            Gerenciar canais
          </Link>
        </Button>
      </div>

      {/* Canal Oficial — Zernio */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
          API Oficial (Meta Cloud API)
        </h2>
        <ZernioCanalCard />
      </div>

      {/* Canais UAZAPI */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
          API Não-oficial (UAZAPI)
        </h2>

        {isLoading && (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}

        {!isLoading && (canais?.length ?? 0) === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <Inbox className="mb-3 h-10 w-10 opacity-40" />
              <p className="text-sm">Nenhum canal UAZAPI cadastrado.</p>
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
      </div>

      {/* Como funciona */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Como funciona</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-muted-foreground">
          <p>
            O <strong>canal oficial (Zernio)</strong> usa a Meta Cloud API diretamente —
            suporta templates aprovados, broadcasts em massa e inbox unificado.
            Ideal para primeiro contato fora da janela de 24h.
          </p>
          <p>
            Os <strong>canais UAZAPI</strong> são instâncias não-oficiais (um número / chip).
            O painel chama a Edge Function <code className="font-mono">uazapi-proxy</code>,
            que repassa — junto da <strong>instância</strong> — para o workflow no n8n.
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
