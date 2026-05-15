// Cliente frontend da Edge Function uazapi-proxy.
// Ela encaminha as chamadas ao n8n, que conversa com a UAZAPI.
import { supabase } from "./supabase";

export type EstadoWhatsapp =
  | "connected"
  | "connecting"
  | "disconnected"
  | string;

export interface WhatsappStatus {
  ok: boolean;
  estado: EstadoWhatsapp;
  nome_instancia: string | null;
  telefone: string | null;
  nome_perfil: string | null;
  foto_perfil: string | null;
  /** Vem como "data:image/png;base64,..." pronto pra usar em <img src=>. */
  qrcode: string | null;
  paircode: string | null;
  ultima_desconexao: string | null;
  motivo_desconexao: string | null;
  current_presence: string | null;
  is_business: boolean | null;
}

export type AcaoWhatsapp = "status" | "connect" | "disconnect";

async function invocarProxy(acao: AcaoWhatsapp): Promise<WhatsappStatus> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Sessão expirou. Faça login novamente.");
  }

  const { data, error } = await supabase.functions.invoke<WhatsappStatus>(
    "uazapi-proxy",
    {
      body: { acao },
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
      mensagem ??
        (error instanceof Error ? error.message : "Falha ao chamar UAZAPI")
    );
  }
  if (!data) throw new Error("Resposta vazia do uazapi-proxy");
  return data;
}

export const uazapi = {
  status: () => invocarProxy("status"),
  connect: () => invocarProxy("connect"),
  disconnect: () => invocarProxy("disconnect"),
};
