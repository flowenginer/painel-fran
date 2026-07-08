// Cliente da Edge Function sugerir-resposta (assistente de sugestão de
// resposta via IA). É assistivo: não envia nem grava nada.
import { supabase } from "./supabase";

export interface SugestaoTurno {
  role: "user" | "assistant";
  content: string;
}

export interface SugerirInput {
  telefone: string;
  /** Mini-chat: pedidos de refino da operadora + sugestões anteriores. */
  mensagens: SugestaoTurno[];
}

interface SugerirResp {
  ok: boolean;
  sugestao?: string;
  error?: string;
}

export async function sugerirResposta(input: SugerirInput): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Sessão expirou. Faça login novamente.");
  }

  const { data, error } = await supabase.functions.invoke<SugerirResp>(
    "sugerir-resposta",
    {
      body: { telefone: input.telefone, mensagens: input.mensagens },
      headers: { Authorization: `Bearer ${session.access_token}` },
    }
  );

  if (error) {
    const ctx = (error as { context?: Response }).context;
    let mensagem: string | null = null;
    if (ctx && typeof ctx.json === "function") {
      try {
        const b = await ctx.json();
        if (b?.error && typeof b.error === "string") mensagem = b.error;
      } catch {
        /* ignora */
      }
    }
    throw new Error(
      mensagem ??
        (error instanceof Error ? error.message : "Falha ao gerar sugestão")
    );
  }
  if (!data) throw new Error("Resposta vazia");
  if (data.ok === false) {
    throw new Error(data.error ?? "Falha ao gerar sugestão");
  }
  return data.sugestao ?? "";
}
