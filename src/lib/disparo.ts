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
  const { data, error } = await supabase.functions.invoke<DispararLoteResponse>(
    "disparar-lote",
    { body: params }
  );

  if (error) {
    const msg = error instanceof Error ? error.message : "Falha ao disparar";
    throw new Error(msg);
  }
  if (!data) throw new Error("Resposta vazia");
  return data;
}
