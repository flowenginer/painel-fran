// Cliente frontend da Edge Function disparar-lote.
import { supabase } from "./supabase";

export interface DispararLoteParams {
  devedor_ids: number[];
  campanha?: string;
}

export interface DispararLoteResponse {
  ok: boolean;
  enviados: number;
  erros: number;
  inelegiveis: { id: number; motivo: string }[];
  limite_diario: number;
  limite_restante: number;
  webhook_error: string | null;
}

export async function dispararLote(
  params: DispararLoteParams
): Promise<DispararLoteResponse> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Sessão expirou. Faça login novamente.");
  }

  const { data, error } = await supabase.functions.invoke<DispararLoteResponse>(
    "disparar-lote",
    {
      body: params,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
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
      mensagem ??
        (error instanceof Error ? error.message : "Falha ao disparar")
    );
  }
  if (!data) throw new Error("Resposta vazia");
  return data;
}
