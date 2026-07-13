// src/lib/mensagens.ts
// Cliente de envio de mensagem do CRM (texto e mídia).
// Roteia automaticamente para o canal correto:
//   - Se o telefone tem conversa ativa no Zernio → chama zernio-enviar
//   - Caso contrário → chama enviar-mensagem (UAZAPI via n8n)

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
  /**
   * Canal já conhecido da conversa (ex.: "zernio:..." ou instância UAZAPI).
   * Quando informado, evita a consulta extra ao banco para descobrir o canal.
   */
  canal?: string | null;
}

// Verifica se o telefone tem uma conversa ativa no Zernio.
// Consulta fran_zernio_conversas diretamente — índice único, muito rápido.
async function isCanalZernio(telefone: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("fran_zernio_conversas")
      .select("id")
      .eq("telefone", telefone)
      .limit(1)
      .maybeSingle();
    if (error) return false;
    return !!data;
  } catch {
    return false;
  }
}

// Envia via Zernio (API oficial)
async function enviarViaZernio(
  input: EnviarInput,
  token: string
): Promise<EnviarMensagemResp> {
  const { data, error } = await supabase.functions.invoke<EnviarMensagemResp>(
    "zernio-enviar",
    {
      body: {
        telefone: input.telefone,
        texto: input.texto ?? "",
        tipo: input.tipo ?? "texto",
        media_url: input.media_url ?? null,
      },
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (error) {
    const ctx = (error as { context?: Response }).context;
    let mensagem: string | null = null;
    if (ctx && typeof ctx.json === "function") {
      try {
        const b = await ctx.json();
        if (b?.error && typeof b.error === "string") mensagem = b.error;
      } catch { /* ignora */ }
    }
    throw new Error(
      mensagem ?? (error instanceof Error ? error.message : "Falha ao enviar via Zernio")
    );
  }
  if (!data) throw new Error("Resposta vazia do Zernio");
  if (data.ok === false) throw new Error(data.error ?? "Falha no envio Zernio");
  return data;
}

// Envia via UAZAPI (canal não-oficial)
async function enviarViaUazapi(
  input: EnviarInput,
  token: string
): Promise<EnviarMensagemResp> {
  const { data, error } = await supabase.functions.invoke<EnviarMensagemResp>(
    "enviar-mensagem",
    {
      body: {
        telefone: input.telefone,
        texto: input.texto ?? "",
        tipo: input.tipo ?? "texto",
        media_url: input.media_url ?? null,
      },
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (error) {
    const ctx = (error as { context?: Response }).context;
    let mensagem: string | null = null;
    if (ctx && typeof ctx.json === "function") {
      try {
        const b = await ctx.json();
        if (b?.error && typeof b.error === "string") mensagem = b.error;
      } catch { /* ignora */ }
    }
    throw new Error(
      mensagem ?? (error instanceof Error ? error.message : "Falha ao enviar mensagem")
    );
  }
  if (!data) throw new Error("Resposta vazia");
  if (data.ok === false) throw new Error(data.error ?? "Falha no envio");
  return data;
}

// Função principal — detecta o canal e roteia automaticamente
export async function enviarMensagem(
  input: EnviarInput
): Promise<EnviarMensagemResp> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Sessão expirou. Faça login novamente.");
  }

  // Roteia pelo canal já conhecido da conversa (sem ida ao banco); só consulta
  // a fran_zernio_conversas como fallback quando o canal não foi informado.
  const usarZernio =
    input.canal != null
      ? input.canal.startsWith("zernio:")
      : await isCanalZernio(input.telefone);

  if (usarZernio) {
    return enviarViaZernio(input, session.access_token);
  }

  return enviarViaUazapi(input, session.access_token);
}
