// src/lib/zernio.ts
// Cliente da API Zernio para o frontend (via Supabase Edge Functions).
// As chamadas diretas à API Zernio são feitas pelas Edge Functions — aqui
// usamos o supabase.functions.invoke para chamar a zernio-templates (proxy).
// Para leitura pública (listar templates), chamamos diretamente via fetch
// usando a API Key armazenada na fran_config (admin-only).

import { supabase } from "./supabase";

export const ZERNIO_BASE = "https://zernio.com/api/v1";

export type TemplateStatus =
  | "APPROVED"
  | "PENDING"
  | "REJECTED"
  | "PAUSED"
  | "DISABLED"
  | "IN_APPEAL";

export type TemplateCategory = "MARKETING" | "UTILITY" | "AUTHENTICATION";

export interface TemplateComponent {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
  format?: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | "LOCATION";
  text?: string;
  buttons?: TemplateButton[];
  example?: {
    header_text?: string[];
    body_text?: string[][];
  };
}

export interface TemplateButton {
  type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER";
  text: string;
  url?: string;
  phone_number?: string;
}

export interface ZernioTemplate {
  name: string;
  status: TemplateStatus;
  category: TemplateCategory;
  language: string;
  components: TemplateComponent[];
  id?: string;
  rejectedReason?: string | null;
  qualityScore?: { score: string } | null;
}

export interface CreateTemplateInput {
  name: string;
  category: TemplateCategory;
  language: string;
  components: TemplateComponent[];
}

// Chama a Edge Function zernio-templates (proxy autenticado)
async function invocarTemplates(body: Record<string, unknown>) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Sessão expirou. Faça login novamente.");

  const { data, error } = await supabase.functions.invoke("zernio-templates", {
    body,
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (error) {
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const b = await ctx.json();
        if (b?.error) throw new Error(b.error);
      } catch (e) {
        if (e instanceof Error && e.message !== "ctx.json is not a function") throw e;
      }
    }
    throw new Error(error instanceof Error ? error.message : "Falha ao chamar zernio-templates");
  }
  return data;
}

export const zernio = {
  templates: {
    list: (): Promise<ZernioTemplate[]> =>
      invocarTemplates({ acao: "listar" }).then((d) => d?.templates ?? []),

    criar: (input: CreateTemplateInput): Promise<ZernioTemplate> =>
      invocarTemplates({ acao: "criar", ...input }).then((d) => d?.template),

    deletar: (name: string): Promise<void> =>
      invocarTemplates({ acao: "deletar", name }).then(() => undefined),
  },
};
