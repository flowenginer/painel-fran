// Lista de conversas: todos os devedores + última mensagem (se houver).
// - Ordena: quem tem mensagem mais recente em cima
// - Devedores sem mensagem aparecem no final (ordem alfabética)
// - Faz match por telefone normalizado (só dígitos) com session_id da fran_memory
//
// Pagina automaticamente sob o limite de 1000 linhas do PostgREST.
import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { fetchAllPages } from "@/lib/supabase-pagination";
import {
  ehMensagemVisivel,
  normalizarSessionId,
  parsearMensagem,
  variantesTelefone,
  type FranMemoryRow,
  type MensagemParsed,
} from "@/lib/conversas";
import type { Devedor } from "@/lib/types";

export interface ConversaItem {
  /** Devedor correspondente — pode ser null quando o session_id não bate com nenhum cadastrado. */
  devedor: Devedor | null;
  /** Telefone normalizado (só dígitos). Chave canônica da conversa. */
  telefone_normalizado: string;
  /** session_id original mais recente. Útil para exibir como veio. */
  session_id_exibicao: string;
  /** Última mensagem visível dessa conversa. */
  ultima_mensagem: MensagemParsed | null;
  /** Total de mensagens da sessão (independente de visíveis). */
  total_mensagens: number;
}

async function fetchConversas(): Promise<ConversaItem[]> {
  // 1. Devedores (todos, paginados) e mensagens (todas, paginadas) em paralelo.
  const [devedores, mensagensRaw] = await Promise.all([
    fetchAllPages<Devedor>(() =>
      supabase
        .from("fran_devedores")
        .select(
          "id, cpf, nome_devedor, primeiro_nome, email, telefone, telefone_2, telefone_3, instituicao, valor_atualizado, status_negociacao, status, responsavel_id, data_ultimo_contato, tentativas_contato, created_at, updated_at"
        )
        .order("updated_at", { ascending: false, nullsFirst: false })
    ),
    fetchAllPages<FranMemoryRow>(() =>
      supabase
        .from("fran_memory")
        .select("id, session_id, message, created_at, enviado_por")
        .order("id", { ascending: false })
    ),
  ]);

  // 2. Agrupa mensagens por telefone normalizado.
  // mensagensRaw já veio ordenado DESC por id (mais novo em cima).
  type Grupo = {
    telefone: string;
    session_id_exibicao: string;
    ultima_visivel: MensagemParsed | null;
    total: number;
  };
  const grupos = new Map<string, Grupo>();
  for (const raw of mensagensRaw) {
    const m = parsearMensagem(raw);
    const chave = m.session_id_normalizado;
    if (!chave) continue;
    let grupo = grupos.get(chave);
    if (!grupo) {
      grupo = {
        telefone: chave,
        session_id_exibicao: m.session_id,
        ultima_visivel: null,
        total: 0,
      };
      grupos.set(chave, grupo);
    }
    grupo.total += 1;
    if (!grupo.ultima_visivel && ehMensagemVisivel(m)) {
      grupo.ultima_visivel = m;
    }
  }

  // 3. Indexa devedores por todos os seus telefones (1, 2 e 3), incluindo
  // as variantes com/sem o 9º dígito para casar mesmo com formatos diferentes.
  const devedorPorTelefone = new Map<string, Devedor>();
  for (const d of devedores) {
    for (const tel of [d.telefone, d.telefone_2, d.telefone_3]) {
      for (const variante of variantesTelefone(tel)) {
        if (!devedorPorTelefone.has(variante)) {
          devedorPorTelefone.set(variante, d);
        }
      }
    }
  }

  // 4. Monta a lista. Primeiro os com mensagens (ordenados por id desc),
  // depois os sem mensagens (alfabético).
  const usados = new Set<number>();
  const comMsg: ConversaItem[] = [];
  const gruposOrdenados = Array.from(grupos.values()).sort((a, b) => {
    const idA = a.ultima_visivel?.id ?? 0;
    const idB = b.ultima_visivel?.id ?? 0;
    return idB - idA;
  });

  for (const g of gruposOrdenados) {
    // Tenta casar pelo telefone do grupo e suas variantes (com/sem o 9).
    const devedor =
      variantesTelefone(g.telefone)
        .map((v) => devedorPorTelefone.get(v))
        .find((d): d is Devedor => Boolean(d)) ?? null;
    if (devedor) usados.add(devedor.id);
    comMsg.push({
      devedor,
      telefone_normalizado: g.telefone,
      session_id_exibicao: g.session_id_exibicao,
      ultima_mensagem: g.ultima_visivel,
      total_mensagens: g.total,
    });
  }

  const semMsg: ConversaItem[] = devedores
    .filter((d) => !usados.has(d.id))
    .map((d) => ({
      devedor: d,
      telefone_normalizado: normalizarSessionId(d.telefone),
      session_id_exibicao: d.telefone ?? "",
      ultima_mensagem: null,
      total_mensagens: 0,
    }))
    .sort((a, b) =>
      (a.devedor?.nome_devedor ?? "").localeCompare(
        b.devedor?.nome_devedor ?? ""
      )
    );

  return [...comMsg, ...semMsg];
}

/**
 * Lista de conversas filtrada por dono:
 * - admin vê todas (e pode filtrar por um operador via `filtroResponsavel`);
 * - operador vê apenas as conversas dos leads atribuídos a ele.
 *
 * O filtro é aplicado no `select` (a query base é compartilhada no cache).
 * A trava de verdade no banco (RLS) virá na Fase 5.
 */
export function useConversas(filtroResponsavel?: string | null) {
  const { user, isAdmin } = useAuth();
  const uid = user?.id ?? null;

  const filtrar = useCallback(
    (lista: ConversaItem[]): ConversaItem[] => {
      if (isAdmin) {
        if (filtroResponsavel) {
          return lista.filter(
            (c) => c.devedor?.responsavel_id === filtroResponsavel
          );
        }
        return lista;
      }
      return lista.filter(
        (c) => uid != null && c.devedor?.responsavel_id === uid
      );
    },
    [isAdmin, filtroResponsavel, uid]
  );

  return useQuery<ConversaItem[]>({
    queryKey: ["conversas"],
    queryFn: fetchConversas,
    staleTime: 10_000,
    select: filtrar,
  });
}
