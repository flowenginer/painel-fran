import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function Instituicoes() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Instituições</h1>
        <p className="text-sm text-muted-foreground">
          Gestão do mapeamento cod_credor → nome de instituição.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Em breve</CardTitle>
          <CardDescription>
            CRUD de instituições será implementado na TASK-018.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Esta tela listará o mapeamento de códigos de credor para nomes
          legíveis, permitindo criar, editar, ativar/desativar e remover
          instituições.
        </CardContent>
      </Card>
    </div>
  );
}
