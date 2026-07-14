// Broadcasts Zernio: criação de campanha de disparo em massa via template
// oficial aprovado. O ENVIO em si (respeitando limites) é feito pela Edge
// Function `zernio-broadcast` (fase 2); aqui montamos o público, o mapa de
// variáveis e persistimos a campanha + os itens (alvos) na fila.
import { supabase } from "./supabase";
import { formatBRL } from "./formatters";
import type { Devedor } from "./types";

// Campos do devedor que podem preencher as variáveis {{n}} do template.
export interface CampoDevedor {
  id: string;
  label: string;
  get: (d: Pick<Devedor, CampoDevedorKey>) => string;
}

type CampoDevedorKey =
  | "nome_devedor"
  | "primeiro_nome"
  | "tratamento"
  | "instituicao"
  | "cidade"
  | "valor_atualizado"
  | "valor_original";

export const CAMPOS_DEVEDOR: CampoDevedor[] = [
  {
    id: "primeiro_nome",
    label: "Primeiro nome",
    get: (d) => (d.primeiro_nome?.trim() || d.nome_devedor?.split(/\s+/)[0] || ""),
  },
  { id: "nome_devedor", label: "Nome completo", get: (d) => d.nome_devedor ?? "" },
  { id: "tratamento", label: "Tratamento (Sr./Sra.)", get: (d) => d.tratamento ?? "" },
  { id: "instituicao", label: "Instituição / Credor", get: (d) => d.instituicao ?? "" },
  { id: "cidade", label: "Cidade", get: (d) => d.cidade ?? "" },
  {
    id: "valor_atualizado",
    label: "Valor atualizado (R$)",
    get: (d) => formatBRL(d.valor_atualizado),
  },
  {
    id: "valor_original",
    label: "Valor original (R$)",
    get: (d) => formatBRL(d.valor_original),
  },
];

export function campoPorId(id: string | undefined): CampoDevedor | undefined {
  return CAMPOS_DEVEDOR.find((c) => c.id === id);
}

/** Extrai os números das variáveis {{1}}, {{2}}... de um texto, únicos e ordenados. */
export function extrairVariaveis(texto: string | null | undefined): string[] {
  if (!texto) return [];
  const encontrados = new Set<string>();
  const re = /\{\{\s*(\d+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto)) !== null) {
    encontrados.add(m[1]);
  }
  return Array.from(encontrados).sort((a, b) => Number(a) - Number(b));
}

/**
 * Renderiza o texto do template substituindo {{n}} pelo valor do campo mapeado
 * do devedor. Usado no preview.
 */
export function renderPreview(
  texto: string,
  variaveis: Record<string, string>,
  devedor: Pick<Devedor, CampoDevedorKey>,
): string {
  return texto.replace(/\{\{\s*(\d+)\s*\}\}/g, (_todo, n: string) => {
    const campo = campoPorId(variaveis[n]);
    const valor = campo ? campo.get(devedor).trim() : "";
    return valor || `{{${n}}}`;
  });
}

export interface CriarBroadcastInput {
  nome: string;
  template_name: string;
  template_language: string;
  /** Corpo do template (com {{n}}) — guardado para exibir o texto real enviado. */
  template_body: string;
  /** Mapa "1" -> id de campo do devedor. */
  variaveis: Record<string, string>;
  devedor_ids: number[];
}

export interface CriarBroadcastResult {
  broadcast_id: number;
  total_alvos: number;
  sem_telefone: number;
}

// Chunk helper.
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Cria a campanha de broadcast e enfileira os itens (alvos). Os itens ficam com
 * status "na_fila"; o processador (Edge Function) resolve as variáveis e envia
 * respeitando os limites configurados.
 */
export async function criarBroadcast(
  input: CriarBroadcastInput,
): Promise<CriarBroadcastResult> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 1. Cria a campanha.
  const { data: campanha, error: erroCampanha } = await supabase
    .from("fran_zernio_broadcasts")
    .insert({
      nome: input.nome.trim(),
      template_name: input.template_name,
      template_language: input.template_language,
      template_body: input.template_body,
      variaveis: input.variaveis,
      status: "rascunho",
      criado_por: user?.id ?? null,
    })
    .select("id")
    .single();

  if (erroCampanha) throw erroCampanha;
  const broadcastId = (campanha as { id: number }).id;

  // 2. Busca telefone dos devedores selecionados (em blocos, evita URL gigante).
  const telefones = new Map<number, string>();
  for (const bloco of chunk(input.devedor_ids, 300)) {
    const { data, error } = await supabase
      .from("fran_devedores")
      .select("id, telefone")
      .in("id", bloco);
    if (error) throw error;
    for (const row of (data ?? []) as Array<{ id: number; telefone: string | null }>) {
      const tel = (row.telefone ?? "").trim();
      if (tel) telefones.set(row.id, tel);
    }
  }

  const semTelefone = input.devedor_ids.length - telefones.size;

  // 3. Enfileira os itens (blocos de 500).
  const itens = Array.from(telefones.entries()).map(([devedor_id, telefone]) => ({
    broadcast_id: broadcastId,
    devedor_id,
    telefone,
    status: "na_fila",
  }));

  for (const bloco of chunk(itens, 500)) {
    const { error } = await supabase
      .from("fran_zernio_broadcast_itens")
      .insert(bloco);
    if (error) throw error;
  }

  // 4. Atualiza o total de alvos.
  await supabase
    .from("fran_zernio_broadcasts")
    .update({ total_alvos: itens.length, updated_at: new Date().toISOString() })
    .eq("id", broadcastId);

  return {
    broadcast_id: broadcastId,
    total_alvos: itens.length,
    sem_telefone: semTelefone,
  };
}
