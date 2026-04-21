import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type ConnectionStatus = "checking" | "connected" | "error";

interface CheckResult {
  tabela: string;
  ok: boolean;
  erro?: string;
}

function App() {
  const [status, setStatus] = useState<ConnectionStatus>("checking");
  const [checks, setChecks] = useState<CheckResult[]>([]);

  useEffect(() => {
    async function checkConnection() {
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

          if (error) {
            results.push({ tabela, ok: false, erro: error.message });
          } else {
            results.push({ tabela, ok: true });
          }
        } catch (e) {
          results.push({
            tabela,
            ok: false,
            erro: e instanceof Error ? e.message : "Erro desconhecido",
          });
        }
      }

      setChecks(results);
      setStatus(results.every((r) => r.ok) ? "connected" : "error");
    }

    checkConnection();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-2xl w-full space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">Painel Fran</h1>
          <p className="text-muted-foreground">
            Stival Advogados — Gestão de devedores
          </p>
        </div>

        <div className="bg-card border border-border rounded-lg p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Status da instalação</h2>
            <StatusBadge status={status} />
          </div>

          <div className="space-y-2">
            {checks.length === 0 && status === "checking" && (
              <p className="text-sm text-muted-foreground">
                Verificando conexão com o Supabase...
              </p>
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
                  <span
                    className="text-destructive text-xs truncate max-w-xs"
                    title={check.erro}
                  >
                    ✕ {check.erro}
                  </span>
                )}
              </div>
            ))}
          </div>

          {status === "connected" && (
            <div className="pt-4 border-t border-border">
              <p className="text-sm text-muted-foreground">
                Tudo pronto. Próximo passo: implementar login (TASK-006).
              </p>
            </div>
          )}

          {status === "error" && (
            <div className="pt-4 border-t border-border">
              <p className="text-sm text-destructive">
                Alguma tabela não respondeu. Verifique as credenciais em .env e
                confirme que rodou os SQLs da TASK-001 e TASK-002.
              </p>
            </div>
          )}
        </div>

        <div className="text-center text-xs text-muted-foreground">
          v0.1.0 — TASK-005 concluída
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ConnectionStatus }) {
  if (status === "checking") {
    return (
      <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-muted text-xs font-medium">
        <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
        verificando
      </span>
    );
  }

  if (status === "connected") {
    return (
      <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-green-500/10 text-green-500 text-xs font-medium">
        <span className="w-2 h-2 rounded-full bg-green-500" />
        conectado
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-destructive/10 text-destructive text-xs font-medium">
      <span className="w-2 h-2 rounded-full bg-destructive" />
      erro
    </span>
  );
}

export default App;
