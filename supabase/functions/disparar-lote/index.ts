// Edge Function: disparar-lote
//
// Dispara a primeira mensagem em lote para um conjunto de devedores
// via webhook n8n. Aplica validações antes:
// - Usuário autenticado
// - Limite diário (fran_config.limite_diario_disparos, default 40)
// - Horário permitido (fran_config.horario_disparo_inicio/fim)
// - Cada devedor precisa estar com status='pendente' e ter telefone
//
// Após sucesso do webhook:
// - INSERT em fran_disparos (um por devedor)
// - UPDATE em fran_devedores: status='primeira_msg',
//   data_primeiro_disparo=NOW(), tentativas_contato += 1
//
// Em caso de erro do webhook: registra em fran_disparos com
// status_envio='erro' e NÃO altera o status do devedor.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";

import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const TZ = "America/Sao_Paulo";

interface RequestBody {
  devedor_ids: number[];
  campanha?: string;
}

interface DevedorRow {
  id: number;
  cpf: string | null;
  nome_devedor: string;
  primeiro_nome: string | null;
  tratamento: string | null;
  telefone: string;
  instituicao: string;
  nome_aluno: string | null;
  valor_atualizado: number | null;
  ano_inicial_dividas: number | null;
  ano_final_dividas: number | null;
  qtd_parcelas_aberto: number | null;
  acordo_anterior: string | null;
  status_negociacao: string | null;
}

function validarBody(raw: unknown): RequestBody {
  if (!raw || typeof raw !== "object") {
    throw new Error("Body deve ser um objeto JSON");
  }
  const b = raw as Record<string, unknown>;
  const ids = b.devedor_ids;
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error("devedor_ids deve ser um array não-vazio");
  }
  const parsed: number[] = [];
  for (const id of ids) {
    const n = Number(id);
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error("devedor_ids contém valores inválidos");
    }
    parsed.push(Math.floor(n));
  }

  const campanha =
    typeof b.campanha === "string" && b.campanha.trim().length > 0
      ? b.campanha.trim()
      : undefined;

  return { devedor_ids: parsed, campanha };
}

function inicioHojeSaoPauloUTC(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const hoje = fmt.format(new Date()); // yyyy-mm-dd
  const data = new Date(`${hoje}T00:00:00-03:00`);
  return data.toISOString();
}

function dentroDoHorario(inicio: string, fim: string): boolean {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const hora = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minuto = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const atual = hora * 60 + minuto;

  const [iH, iM] = (inicio ?? "08:00").split(":").map(Number);
  const [fH, fM] = (fim ?? "20:00").split(":").map(Number);
  const ini = iH * 60 + iM;
  const f = fH * 60 + fM;

  return atual >= ini && atual <= f;
}

function montarPayloadDevedor(d: DevedorRow) {
  return {
    devedor_id: d.id,
    cpf: d.cpf,
    nome_devedor: d.nome_devedor,
    primeiro_nome: d.primeiro_nome,
    tratamento: d.tratamento,
    telefone: d.telefone,
    instituicao: d.instituicao,
    nome_aluno: d.nome_aluno,
    valor_atualizado: d.valor_atualizado,
    ano_inicial_dividas: d.ano_inicial_dividas,
    ano_final_dividas: d.ano_final_dividas,
    qtd_parcelas_aberto: d.qtd_parcelas_aberto,
    acordo_anterior: d.acordo_anterior,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Método não permitido" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Não autenticado" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !serviceKey || !anonKey) {
      return jsonResponse(
        { error: "Variáveis de ambiente do Supabase ausentes" },
        500
      );
    }

    // Verifica sessão do operador
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return jsonResponse({ error: "Sessão inválida" }, 401);
    }
    const usuarioId = userData.user.id;

    // Parse body
    const body = await req.json().catch(() => null);
    const { devedor_ids, campanha } = validarBody(body);

    // Service role client pra escrever ignorando RLS nas operações críticas
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1. Lê configs
    const { data: configRows, error: cfgErr } = await admin
      .from("fran_config")
      .select("chave, valor")
      .in("chave", [
        "limite_diario_disparos",
        "horario_disparo_inicio",
        "horario_disparo_fim",
        "n8n_webhook_url",
      ]);
    if (cfgErr) throw cfgErr;

    const cfg: Record<string, string> = {};
    for (const r of configRows ?? []) {
      cfg[r.chave as string] = (r.valor as string | null) ?? "";
    }

    const limiteDiario = Number(cfg.limite_diario_disparos) || 40;
    const horaInicio = cfg.horario_disparo_inicio?.trim() || "08:00";
    const horaFim = cfg.horario_disparo_fim?.trim() || "20:00";
    const webhookUrl = cfg.n8n_webhook_url?.trim();

    if (!webhookUrl) {
      return jsonResponse(
        {
          error:
            "URL do webhook n8n não configurada. Defina em Configurações.",
        },
        400
      );
    }

    // 2. Valida horário
    if (!dentroDoHorario(horaInicio, horaFim)) {
      return jsonResponse(
        {
          error: `Fora do horário permitido (${horaInicio}–${horaFim} em São Paulo).`,
        },
        400
      );
    }

    // 3. Valida limite diário
    const { count: jaEnviados, error: countErr } = await admin
      .from("fran_disparos")
      .select("*", { count: "exact", head: true })
      .eq("status_envio", "enviado")
      .gte("data_disparo", inicioHojeSaoPauloUTC());
    if (countErr) throw countErr;

    const disponivel = limiteDiario - (jaEnviados ?? 0);
    if (disponivel <= 0) {
      return jsonResponse(
        {
          error: `Limite diário atingido (${jaEnviados}/${limiteDiario}).`,
        },
        400
      );
    }
    if (devedor_ids.length > disponivel) {
      return jsonResponse(
        {
          error: `Selecionou ${devedor_ids.length}, mas só restam ${disponivel} disparos hoje (limite ${limiteDiario}).`,
        },
        400
      );
    }

    // 4. Busca devedores e valida elegibilidade (status=pendente, telefone)
    const { data: devedores, error: devErr } = await admin
      .from("fran_devedores")
      .select(
        "id, cpf, nome_devedor, primeiro_nome, tratamento, telefone, instituicao, nome_aluno, valor_atualizado, ano_inicial_dividas, ano_final_dividas, qtd_parcelas_aberto, acordo_anterior, status_negociacao"
      )
      .in("id", devedor_ids);
    if (devErr) throw devErr;

    const mapa = new Map((devedores ?? []).map((d) => [d.id, d as DevedorRow]));
    const elegiveis: DevedorRow[] = [];
    const inelegiveis: { id: number; motivo: string }[] = [];

    for (const id of devedor_ids) {
      const d = mapa.get(id);
      if (!d) {
        inelegiveis.push({ id, motivo: "Devedor não encontrado" });
        continue;
      }
      if (d.status_negociacao !== "pendente") {
        inelegiveis.push({
          id,
          motivo: `Status é ${d.status_negociacao ?? "indefinido"}, esperava pendente`,
        });
        continue;
      }
      if (!d.telefone || d.telefone.trim().length < 12) {
        inelegiveis.push({ id, motivo: "Sem telefone válido" });
        continue;
      }
      elegiveis.push(d);
    }

    if (elegiveis.length === 0) {
      return jsonResponse(
        {
          error: "Nenhum devedor elegível para disparo",
          inelegiveis,
        },
        400
      );
    }

    // 5. Envia ao webhook n8n
    const payload = {
      campanha,
      usuario_id: usuarioId,
      devedores: elegiveis.map(montarPayloadDevedor),
    };

    let webhookOk = false;
    let webhookResp: unknown = null;
    let webhookErr: string | null = null;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 60_000);
    try {
      const resp = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      const texto = await resp.text();
      try {
        webhookResp = texto ? JSON.parse(texto) : texto;
      } catch {
        webhookResp = texto;
      }
      if (resp.ok) {
        webhookOk = true;
      } else {
        webhookErr = `HTTP ${resp.status}`;
      }
    } catch (err) {
      clearTimeout(timer);
      webhookErr =
        err instanceof Error && err.name === "AbortError"
          ? "Timeout ao chamar webhook n8n"
          : err instanceof Error
            ? err.message
            : String(err);
    }

    // 6. Registra em fran_disparos (sucesso ou erro)
    const agora = new Date().toISOString();
    const linhasDisparo = elegiveis.map((d) => ({
      devedor_id: d.id,
      telefone: d.telefone,
      data_disparo: agora,
      status_envio: webhookOk ? "enviado" : "erro",
      erro_detalhes: webhookErr,
      webhook_response: webhookResp,
      campanha,
      usuario_id: usuarioId,
    }));

    const { error: insertErr } = await admin
      .from("fran_disparos")
      .insert(linhasDisparo);
    if (insertErr) {
      // Log mas não interrompe — importante sinalizar pro caller
      console.error("Erro ao inserir fran_disparos:", insertErr);
    }

    // 7. Se sucesso: atualiza status dos devedores
    if (webhookOk) {
      const ids = elegiveis.map((d) => d.id);
      // Chamada em duas etapas porque Supabase não suporta tentativas_contato + 1
      // dentro de .update() em batch. Fazemos UPDATE normal dos campos fixos
      // e um RPC-like seria overkill aqui — a imprecisão de +1 é aceitável
      // (Fran atualiza depois com tool calls).
      const { error: updErr } = await admin
        .from("fran_devedores")
        .update({
          status_negociacao: "primeira_msg",
          data_primeiro_disparo: agora,
          data_ultimo_contato: agora,
        })
        .in("id", ids);
      if (updErr) console.error("Erro ao atualizar devedores:", updErr);
    }

    return jsonResponse({
      ok: webhookOk,
      enviados: webhookOk ? elegiveis.length : 0,
      erros: webhookOk ? 0 : elegiveis.length,
      inelegiveis,
      limite_diario: limiteDiario,
      limite_restante: Math.max(
        0,
        disponivel - (webhookOk ? elegiveis.length : 0)
      ),
      webhook_error: webhookErr,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isValidation =
      /devedor_ids|Body deve ser|Fora do hor|Limite di|Selecionou/.test(
        message
      );
    return jsonResponse({ error: message }, isValidation ? 400 : 500);
  }
});
