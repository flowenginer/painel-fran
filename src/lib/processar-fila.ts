// Cliente frontend da Edge Function processar-fila.
// Usado pelo botão "Processar agora" para forçar um ciclo da fila sem
// esperar o pg_cron. A autorização vai pelo JWT do operador.
import { supabase } from "./supabase";

export interface ProcessarFilaResponse {
  ok: boolean;
  processados: number;
  enviados: number;
  erros: number;
  inelegiveis?: number;
  motivo?: string;
  quota?: number;
  restante_dia?: number;
  enviados_hoje?: number;
  limite_diario?: number;
  por_hora?: number;
}

export async function processarFilaAgora(): Promise<ProcessarFilaResponse> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Sessão expirou. Faça login novamente.");
  }

  const { data, error } = await supabase.functions.invoke<ProcessarFilaResponse>(
    "processar-fila",
    {
      body: { trigger: "manual" },
      headers: { Authorization: `Bearer ${session.access_token}` },
    }
  );

  if (error) {
    const ctx = (error as { context?: Response }).context;
    let mensagem: string | null = null;
    if (ctx && typeof ctx.json === "function") {
      try {
        const body = await ctx.json();
        if (body?.error && typeof body.error === "string") {
          mensagem = body.error;
        }
      } catch {
        /* ignora */
      }
    }
    throw new Error(
      mensagem ?? (error instanceof Error ? error.message : "Falha ao processar fila")
    );
  }
  if (!data) throw new Error("Resposta vazia");
  return data;
}
