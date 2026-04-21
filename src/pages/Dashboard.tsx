import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface CheckResult {
  tabela: string;
  ok: boolean;
  erro?: string;
}

export function Dashboard() {
  const { user, signOut } = useAuth();
  const [checks, setChecks] = useState<CheckResult[]>([]);

  useEffect(() => {
    async function checkTables() {
      const tables = [
        "fran_devedores",
        "fran_instituicoes",
        "fran_config",
        "fran_disparos",
      ];

      const results: CheckResult[] = [];
      for (const tabela of tables) {
        try {
          const { error } = await supabase
            .from(tabela)
            .select("*", { count: "exact", head: true });

          results.push(
            error
              ? { tabela, ok: false, erro: error.message }
              : { tabela, ok: true }
          );
        } catch (e) {
          results.push({
            tabela,
            ok: false,
            erro: e instanceof Error ? e.message : "Erro",
          });
        }
      }
      setChecks(results);
    }

    checkTables();
  }, []);

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Painel Fran</h1>
            <p className="text-sm text-muted-foreground">
              Logado como {user?.email}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={signOut}>
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </Button>
        </div>

        {/* Placeholder */}
        <Card>
          <CardHeader>
            <CardTitle>Dashboard</CardTitle>
            <CardDescription>
              Autenticação funcionando. A lista de devedores, KPIs e ações de
              importação/disparo serão implementados nas próximas tasks
              (008–011).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-sm font-medium mb-2">
                Verificação das tabelas:
              </p>
              {checks.length === 0 && (
                <p className="text-sm text-muted-foreground">Verificando...</p>
              )}
              {checks.map((check) => (
                <div
                  key={check.tabela}
                  className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/30 text-sm"
                >
                  <span className="font-mono">{check.tabela}</span>
                  {check.ok ? (
                    <span className="text-green-500">✓ ok</span>
                  ) : (
                    <span className="text-destructive text-xs truncate max-w-xs">
                      ✕ {check.erro}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="text-center text-xs text-muted-foreground">
          v0.2.0 — TASK-006 concluída
        </div>
      </div>
    </div>
  );
}
