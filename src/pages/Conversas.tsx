import { MessageSquare } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Página de conversas (preview tipo CRM).
 *
 * Estado atual: esqueleto. Será preenchido em seguida quando o schema
 * da fran_memory estiver mapeado.
 */
export function Conversas() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Conversas</h1>
        <p className="text-sm text-muted-foreground">
          Histórico das conversas entre a Fran e os devedores. Somente
          leitura.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Em construção
          </CardTitle>
          <CardDescription>
            A página de conversas está sendo implementada. Será exibida
            uma lista de leads na lateral esquerda e a thread completa de
            mensagens da conversa selecionada à direita, com atualização
            em tempo real.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-[300px_1fr]">
          {/* Lista de devedores — placeholder */}
          <div className="rounded-md border bg-muted/20 p-3">
            <p className="mb-3 text-xs font-medium text-muted-foreground">
              Lista de leads (preview)
            </p>
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-md bg-background/50 p-2 text-xs text-muted-foreground"
                >
                  <div className="h-8 w-8 shrink-0 rounded-full bg-muted" />
                  <div className="min-w-0 flex-1">
                    <div className="h-3 w-2/3 rounded bg-muted" />
                    <div className="mt-1 h-2 w-1/2 rounded bg-muted/60" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Thread — placeholder */}
          <div className="flex min-h-[300px] flex-col items-center justify-center rounded-md border bg-muted/10 text-sm text-muted-foreground">
            <MessageSquare className="mb-2 h-8 w-8 opacity-40" />
            <p>Selecione um lead para ver as mensagens</p>
            <p className="mt-1 text-xs">
              Aguardando schema da tabela `fran_memory` para concluir a
              implementação.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
