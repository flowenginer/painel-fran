// Tipos e helpers para a aba de Conversas, que lê de fran_memory.
//
// Estrutura da fran_memory:
//   - id: PK auto-increment (usamos como ordem cronológica)
//   - session_id: identificador da sessão (telefone, em formato variado:
//     "5521992731918" ou "+55 21 99273-1918" — precisa normalizar)
//   - message: JSON LangChain com type/content/tool_calls
//
// Filosofia de exibição:
//   - "human" → bolha do devedor (lado direito)
//   - "ai" sem tool_calls → bolha da Fran (lado esquerdo)
//   - "ai" com tool_calls → escondido (Fran chamou uma tool)
//   - "tool" → escondido (resposta de tool, ruído técnico)
//   - "system" → escondido (instruções iniciais)

export interface FranMemoryRow {
  id: number;
  session_id: string;
  message: string | Record<string, unknown>;
  /** Data/hora da mensagem (coluna nova; null em linhas antigas). */
  created_at?: string | null;
  /** Operadora que enviou pelo painel (null = IA/sistema/lead). */
  enviado_por?: string | null;
}

export type TipoMensagem =
  | "ai"
  | "human"
  | "tool"
  | "system"
  | (string & {});

export interface ToolCall {
  id: string;
  name: string;
  args: unknown;
  type?: string;
}

export interface MensagemPayload {
  type: TipoMensagem;
  content: string;
  tool_calls?: ToolCall[];
  name?: string;
  tool_call_id?: string;
  additional_kwargs?: Record<string, unknown>;
  response_metadata?: Record<string, unknown>;
}

export interface MensagemParsed {
  id: number;
  session_id: string;
  session_id_normalizado: string;
  type: TipoMensagem;
  content: string;
  tem_tool_call: boolean;
  /** Data/hora (ISO) — null em mensagens antigas sem carimbo. */
  created_at: string | null;
  /** Operadora que enviou pelo painel (null = IA/lead). */
  enviado_por: string | null;
}

/** Retorna só os dígitos do telefone/session_id. */
export function normalizarSessionId(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

/**
 * Variantes canônicas de um telefone para casar conversa ↔ devedor mesmo
 * quando um lado tem o 9º dígito do celular e o outro não.
 *
 * Celular BR: 55 (país) + DDD (2) + 9 + 8 dígitos = 13 dígitos. Muitos
 * cadastros/sessões vêm com 12 (sem o 9). Geramos as duas formas para que
 * a comparação funcione independente do formato salvo.
 *
 * Retorna sempre ao menos o número normalizado; adiciona a forma alternada
 * apenas para padrões BR plausíveis (extras não casam com nada — inócuos).
 */
export function variantesTelefone(s: string | null | undefined): string[] {
  const norm = normalizarSessionId(s);
  if (!norm) return [];
  const variantes = new Set<string>([norm]);
  if (norm.startsWith("55")) {
    const ddd = norm.slice(2, 4);
    const resto = norm.slice(4);
    if (norm.length === 13 && resto.startsWith("9")) {
      // Tem o 9 → adiciona a forma sem o 9.
      variantes.add("55" + ddd + resto.slice(1));
    } else if (norm.length === 12) {
      // Sem o 9 → adiciona a forma com o 9.
      variantes.add("55" + ddd + "9" + resto);
    }
  }
  return Array.from(variantes);
}

/** Faz parse seguro do JSON da mensagem com fallback. */
export function parsearMensagem(row: FranMemoryRow): MensagemParsed {
  let payload: MensagemPayload | null = null;
  try {
    if (typeof row.message === "string") {
      payload = JSON.parse(row.message) as MensagemPayload;
    } else if (row.message && typeof row.message === "object") {
      payload = row.message as unknown as MensagemPayload;
    }
  } catch {
    payload = null;
  }

  return {
    id: row.id,
    session_id: row.session_id ?? "",
    session_id_normalizado: normalizarSessionId(row.session_id),
    type: payload?.type ?? "unknown",
    content: typeof payload?.content === "string" ? payload.content : "",
    tem_tool_call: Array.isArray(payload?.tool_calls)
      ? payload.tool_calls.length > 0
      : false,
    created_at: row.created_at ?? null,
    enviado_por: row.enviado_por ?? null,
  };
}

/**
 * Mensagem deve aparecer na thread visível do operador?
 * Esconde tool calls, respostas de tool e mensagens de sistema.
 */
export function ehMensagemVisivel(m: MensagemParsed): boolean {
  if (m.type === "tool") return false;
  if (m.type === "system") return false;
  if (m.type === "ai" && m.tem_tool_call) return false;
  if (m.type !== "ai" && m.type !== "human") return false;
  return Boolean(m.content);
}

/** Detecta placeholders de mídia no conteúdo. */
export type MidiaTipo = "audio" | "imagem" | "documento" | "video";

export function detectarMidia(content: string): MidiaTipo | null {
  if (/\[(áudio|audio|voice|voz)\]/i.test(content)) return "audio";
  if (/\[(imagem|image|photo|foto|figura)\]/i.test(content)) return "imagem";
  if (/\[(documento|document|pdf|arquivo)\]/i.test(content)) return "documento";
  if (/\[(vídeo|video)\]/i.test(content)) return "video";
  return null;
}

/** Trunca preview para a lista lateral. */
export function previewContent(content: string, max = 60): string {
  const limpo = content.replace(/\s+/g, " ").trim();
  if (limpo.length <= max) return limpo;
  return limpo.slice(0, max - 1) + "…";
}
