// Edge Function: disparar-lote
//
// Dispara a primeira mensagem em lote via webhook n8n com validações
// de limite diário, horário e elegibilidade dos devedores.

import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
  lerConfig,
  lerEnv,
  rest,
  validarJwt,
} from "../_shared/supabase-rest.ts";

const TZ = "America/Sao_Paulo";

interface RequestBody {
  devedor_ids: number[];
  campanha?: string;
  /**
   * Se true, é um reenvio da primeira mensagem (não requer status=pendente).
   * Usado a partir do dropdown de ações do devedor. Quem já fechou acordo
   * (status=acordo_aceito) continua bloqueado para proteger negociações.
   */
  reenviar?: boolean;
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
  const reenviar = b.reenviar === true;
  return { devedor_ids: parsed, campanha, reenviar };
}

function inicioHojeSaoPauloUTC(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const hoje = fmt.format(new Date());
  return new Date(`${hoje}T00:00:00-03:00`).toISOString();
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
  return atual >= iH * 60 + iM && atual <= fH * 60 + fM;
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
    console.log("[disparar-lote] start");
    const env = lerEnv();

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Header Authorization ausente" }, 401);
    }
    let usuarioId: string;
    try {
      const user = await validarJwt(env, authHeader);
      usuarioId = user.id;
    } catch (err) {
      console.error("[disparar-lote] JWT inválido:", err);
      return jsonResponse(
        {
          error:
            "Sessão inválida ou expirada. Faça logout e login novamente.",
          detail: err instanceof Error ? err.message : String(err),
        },
        401
      );
    }

    const body = await req.json().catch(() => null);
    const { devedor_ids, campanha, reenviar } = validarBody(body);

    // 1. Lê configs
    const cfg = await lerConfig(env, [
      "limite_diario_disparos",
      "horario_disparo_inicio",
      "horario_disparo_fim",
      "n8n_webhook_url",
    ]);

    const limiteDiario = Number(cfg.limite_diario_disparos) || 40;
    const horaInicio = cfg.horario_disparo_inicio?.trim() || "08:00";
    const horaFim = cfg.horario_disparo_fim?.trim() || "20:00";
    const webhookUrl = cfg.n8n_webhook_url?.trim();
    if (!webhookUrl) {
      return jsonResponse(
        { error: "URL do webhook n8n não configurada." },
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
    const inicioHoje = inicioHojeSaoPauloUTC();
    const countResp = await rest(
      env,
      "GET",
      `/fran_disparos?status_envio=eq.enviado&data_disparo=gte.${encodeURIComponent(
        inicioHoje
      )}&select=id`,
      undefined,
      { Prefer: "count=exact" }
    );
    if (!countResp.ok) {
      throw new Error(
        `Falha ao contar disparos: ${countResp.status} ${await countResp.text()}`
      );
    }
    const contentRange = countResp.headers.get("content-range") ?? "0-0/0";
    const jaEnviados = Number(contentRange.split("/")[1]) || 0;

    const disponivel = limiteDiario - jaEnviados;
    if (disponivel <= 0) {
      return jsonResponse(
        { error: `Limite diário atingido (${jaEnviados}/${limiteDiario}).` },
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

    // 4. Busca devedores e valida elegibilidade
    const ids = devedor_ids.join(",");
    const devResp = await rest(
      env,
      "GET",
      `/fran_devedores?id=in.(${ids})&select=id,cpf,nome_devedor,primeiro_nome,tratamento,telefone,instituicao,nome_aluno,valor_atualizado,ano_inicial_dividas,ano_final_dividas,qtd_parcelas_aberto,acordo_anterior,status_negociacao`
    );
    if (!devResp.ok) {
      throw new Error(
        `Falha ao buscar devedores: ${devResp.status} ${await devResp.text()}`
      );
    }
    const devedores = (await devResp.json()) as DevedorRow[];
    const mapa = new Map(devedores.map((d) => [d.id, d]));

    const elegiveis: DevedorRow[] = [];
    const inelegiveis: { id: number; motivo: string }[] = [];

    for (const id of devedor_ids) {
      const d = mapa.get(id);
      if (!d) {
        inelegiveis.push({ id, motivo: "Devedor não encontrado" });
        continue;
      }
      if (reenviar) {
        // Reenvio: só proíbe devedores com acordo já aceito (para não
        // perturbar negociações fechadas).
        if (d.status_negociacao === "acordo_aceito") {
          inelegiveis.push({
            id,
            motivo: "Devedor já fechou acordo — reenvio bloqueado",
          });
          continue;
        }
      } else {
        // Disparo inicial: exige status=pendente.
        if (d.status_negociacao !== "pendente") {
          inelegiveis.push({
            id,
            motivo: `Status é ${d.status_negociacao ?? "indefinido"}, esperava pendente`,
          });
          continue;
        }
      }
      if (!d.telefone || d.telefone.trim().length < 12) {
        inelegiveis.push({ id, motivo: "Sem telefone válido" });
        continue;
      }
      elegiveis.push(d);
    }

    if (elegiveis.length === 0) {
      return jsonResponse(
        { error: "Nenhum devedor elegível para disparo", inelegiveis },
        400
      );
    }

    // 5. Envia ao webhook n8n
    const payload = {
      campanha,
      usuario_id: usuarioId,
      reenviar: reenviar ?? false,
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
      if (resp.ok) webhookOk = true;
      else webhookErr = `HTTP ${resp.status}`;
    } catch (err) {
      clearTimeout(timer);
      webhookErr =
        err instanceof Error && err.name === "AbortError"
          ? "Timeout ao chamar webhook n8n"
          : err instanceof Error
            ? err.message
            : String(err);
    }

    // 6. Registra em fran_disparos
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

    const insResp = await rest(
      env,
      "POST",
      "/fran_disparos",
      linhasDisparo,
      { Prefer: "return=minimal" }
    );
    if (!insResp.ok) {
      console.error(
        "Erro ao inserir fran_disparos:",
        insResp.status,
        await insResp.text()
      );
    }

    // 7. Atualiza devedores se sucesso
    if (webhookOk) {
      const idsList = elegiveis.map((d) => d.id).join(",");
      // No reenvio, preserva status e data_primeiro_disparo — só marca que
      // houve contato agora. No disparo inicial, muda para primeira_msg e
      // grava o primeiro disparo.
      const patch: Record<string, unknown> = reenviar
        ? { data_ultimo_contato: agora }
        : {
            status_negociacao: "primeira_msg",
            data_primeiro_disparo: agora,
            data_ultimo_contato: agora,
          };
      const updResp = await rest(
        env,
        "PATCH",
        `/fran_devedores?id=in.(${idsList})`,
        patch,
        { Prefer: "return=minimal" }
      );
      if (!updResp.ok) {
        console.error(
          "Erro ao atualizar devedores:",
          updResp.status,
          await updResp.text()
        );
      }
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
    console.error("[disparar-lote] exceção não tratada:", err);
    const message = err instanceof Error ? err.message : String(err);
    const isValidation =
      /devedor_ids|Body deve ser|Fora do hor|Limite di|Selecionou/.test(
        message
      );
    return jsonResponse(
      { error: message, stack: err instanceof Error ? err.stack : undefined },
      isValidation ? 400 : 500
    );
  }
});
