// Envio de mensagens: invoca a Edge Function `mensagem-enviar`, que roteia
// pelo canal da conversa (uazapi via n8n / Zernio oficial) e grava a mensagem.
import { supabase } from "@/lib/supabase";
import type { Mensagem, TipoMensagem } from "@/lib/types";

export interface EnviarInput {
  conversa_id: number;
  texto: string;
  tipo?: TipoMensagem;
  media_url?: string | null;
}

export interface EnviarResp {
  ok: boolean;
  mensagem?: Mensagem | null;
  aviso?: string;
  error?: string;
}

export async function enviarMensagem(input: EnviarInput): Promise<EnviarResp> {
  const { data, error } = await supabase.functions.invoke("mensagem-enviar", {
    body: input,
  });

  if (error) {
    // Extrai a mensagem de erro do corpo da resposta da Edge Function.
    let msg = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) {
        const j = (await ctx.json()) as { error?: string };
        if (j?.error) msg = j.error;
      }
    } catch {
      // mantém error.message
    }
    throw new Error(msg);
  }

  return data as EnviarResp;
}
