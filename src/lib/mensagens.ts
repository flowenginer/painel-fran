// Cliente da Edge Function enviar-mensagem (CRM chat: texto e mídia).
import { supabase } from "./supabase";

export interface EnviarMensagemResp {
  ok: boolean;
  gravado?: boolean;
  aviso?: string;
  error?: string;
}

export type TipoEnvio = "texto" | "imagem" | "audio" | "documento";

export interface EnviarInput {
  telefone: string;
  texto?: string;
  tipo?: TipoEnvio;
  media_url?: string | null;
}

export async function enviarMensagem(
  input: EnviarInput
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
      body: {
        telefone: input.telefone,
        texto: input.texto ?? "",
        tipo: input.tipo ?? "texto",
        media_url: input.media_url ?? null,
      },
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
