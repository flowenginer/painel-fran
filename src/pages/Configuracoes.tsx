import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function Configuracoes() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">
          API keys, webhook n8n, limites e horários de disparo.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Em breve</CardTitle>
          <CardDescription>
            Formulário de configurações será implementado na TASK-019.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Esta tela permitirá configurar a API key do Cedrus, a URL do webhook
          n8n, o limite diário de disparos e o horário permitido para envio.
        </CardContent>
      </Card>
    </div>
  );
}
