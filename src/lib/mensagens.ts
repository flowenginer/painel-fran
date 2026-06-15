// Cliente da Edge Function enviar-mensagem (CRM chat — Fase A: texto).
import { supabase } from "./supabase";

export interface EnviarMensagemResp {
  ok: boolean;
  gravado?: boolean;
  aviso?: string;
  error?: string;
}

export async function enviarMensagem(
  telefone: string,
  texto: string
): Promise<EnviarMensagemResp> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Sessão expirou. Faça login novamente.");
  }

  const { data, error } = await supabase.functions.invoke<EnviarMensagemResp>(
    "enviar-mensagem",
    {
      body: { telefone, texto },
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
        (error instanceof Error ? error.message : "Falha ao enviar mensagem")
    );
  }
  if (!data) throw new Error("Resposta vazia");
  // Falha "de negócio" (ex.: UAZAPI recusou) vem como ok:false em HTTP 200.
  if (data.ok === false) {
    throw new Error(data.error ?? "Falha no envio");
  }
  return data;
}
