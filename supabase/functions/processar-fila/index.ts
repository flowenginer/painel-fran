// Edge Function: processar-fila
//
// Processa a "fila de distribuição" em gotejamento (drip). Pensada para
// ser chamada periodicamente pelo pg_cron do Supabase (a cada 10 min) e
// também manualmente pela UI ("Processar agora").
//
// Em cada execução respeita, nesta ordem:
//   1. fila_ativa            → liga/desliga o processamento
//   2. janela de horário     → horario_disparo_inicio/fim (São Paulo)
//   3. taxa por hora         → fila_disparos_por_hora
//   4. limite diário         → limite_diario_disparos
// Quando bate o limite do dia, simplesmente não envia mais nada — retoma
// naturalmente no dia seguinte, dentro da janela de horário.
//
// Compartilha a lógica de disparo com `disparar-lote` via
// `_shared/disparo-core.ts`.

import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
  lerConfig,
  lerEnv,
  rest,
  validarJwt,
  type SupabaseEnv,
} from "../_shared/supabase-rest.ts";
import {
  contarEnviadosDesde,
  dentroDoHorario,
  diaPermitido,
  enviarWebhook,
  inicioHojeSaoPauloUTC,
  inicioHoraAtualSaoPauloUTC,
  montarPayloadDevedor,
  type DevedorRow,
} from "../_shared/disparo-core.ts";

// Quantas vezes o cron roda por hora (a cada 10 min). Usado para diluir a
// taxa por hora em levas menores, evitando rajadas no topo de cada hora.
const RUNS_POR_HORA = 6;
// Tentativas de webhook antes de marcar o item da fila como erro.
const MAX_TENTATIVAS = 3;

interface FilaRow {
  id: number;
  devedor_id: number;
  campanha: string | null;
  tentativas: number;
  fran_devedores: DevedorRow | null;
}

// Resposta padrão "não fez nada" (ainda 200, para o cron não acusar falha).
function ocioso(motivo: string, extra: Record<string, unknown> = {}) {
  return jsonResponse({
    ok: true,
    processados: 0,
    enviados: 0,
    erros: 0,
    motivo,
    ...extra,
  });
}

// Autoriza a chamada: via segredo de cron (header x-cron-secret) ou via
// JWT de operador (botão "Processar agora" na UI).
async function autorizar(
  env: SupabaseEnv,
  req: Request,
  cronSecret: string
): Promise<{ ok: true; via: "cron" | "usuario" } | { ok: false; resp: Response }> {
  const headerSecret = req.headers.get("x-cron-secret");
  if (headerSecret && cronSecret && headerSecret === cronSecret) {
    return { ok: true, via: "cron" };
  }
  const authHeader = req.headers.get("Authorization");
  if (authHeader) {
    try {
      await validarJwt(env, authHeader);
      return { ok: true, via: "usuario" };
    } catch {
      /* cai no 401 abaixo */
    }
  }
  return {
    ok: false,
    resp: jsonResponse({ error: "Não autorizado" }, 401),
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
    console.log("[processar-fila] start");
    const env = lerEnv();

    const cfg = await lerConfig(env, [
      "fila_ativa",
      "fila_disparos_por_hora",
      "fila_dias_semana",
      "fila_cron_secret",
      "limite_diario_disparos",
      "horario_disparo_inicio",
      "horario_disparo_fim",
      "n8n_webhook_url",
    ]);

    const auth = await autorizar(env, req, cfg.fila_cron_secret?.trim() ?? "");
    if (!auth.ok) return auth.resp;

    const filaAtiva = (cfg.fila_ativa?.trim() ?? "false") === "true";
    const porHora = Math.max(0, Number(cfg.fila_disparos_por_hora) || 0);
    const limiteDiario = Number(cfg.limite_diario_disparos) || 40;
    const horaInicio = cfg.horario_disparo_inicio?.trim() || "08:00";
    const horaFim = cfg.horario_disparo_fim?.trim() || "20:00";
    const webhookUrl = cfg.n8n_webhook_url?.trim();

    if (!filaAtiva) return ocioso("fila_pausada");
    if (porHora <= 0) return ocioso("taxa_por_hora_zerada");
    if (!webhookUrl) {
      return jsonResponse(
        { error: "URL do webhook n8n não configurada." },
        400
      );
    }
    if (!diaPermitido(cfg.fila_dias_semana)) {
      return ocioso("fora_dia_semana");
    }
    if (!dentroDoHorario(horaInicio, horaFim)) {
      return ocioso("fora_horario", { horario: `${horaInicio}-${horaFim}` });
    }

    // Quanto ainda cabe hoje e nesta hora.
    const enviadosHoje = await contarEnviadosDesde(
      env,
      inicioHojeSaoPauloUTC()
    );
    const enviadosHora = await contarEnviadosDesde(
      env,
      inicioHoraAtualSaoPauloUTC()
    );

    const restanteDia = Math.max(0, limiteDiario - enviadosHoje);
    const restanteHora = Math.max(0, porHora - enviadosHora);
    // Dilui a taxa por hora nas execuções do cron (evita rajada).
    const capPorRun = Math.max(1, Math.ceil(porHora / RUNS_POR_HORA));

    const quota = Math.min(restanteDia, restanteHora, capPorRun);
    if (quota <= 0) {
      return ocioso(
        restanteDia <= 0 ? "limite_diario_atingido" : "limite_hora_atingido",
        {
          enviados_hoje: enviadosHoje,
          limite_diario: limiteDiario,
          enviados_hora: enviadosHora,
          por_hora: porHora,
        }
      );
    }

    // Busca itens na fila + devedor embutido. Pega um buffer extra para
    // compensar itens que se tornaram inelegíveis (já contatados, etc.).
    const limite = quota + 25;
    const filaResp = await rest(
      env,
      "GET",
      `/fran_fila_disparo?status=eq.na_fila&select=id,devedor_id,campanha,tentativas,fran_devedores(*)&order=prioridade.asc,created_at.asc&limit=${limite}`
    );
    if (!filaResp.ok) {
      throw new Error(
        `Falha ao ler fila: ${filaResp.status} ${await filaResp.text()}`
      );
    }
    const itens = (await filaResp.json()) as FilaRow[];
    if (itens.length === 0) return ocioso("fila_vazia");

    const elegiveis: { item: FilaRow; devedor: DevedorRow }[] = [];
    const inelegiveis: { id: number; motivo: string }[] = [];

    for (const item of itens) {
      if (elegiveis.length >= quota) break;
      const d = item.fran_devedores;
      if (!d) {
        inelegiveis.push({ id: item.id, motivo: "Devedor não encontrado" });
        continue;
      }
      if (d.status_negociacao !== "pendente") {
        inelegiveis.push({
          id: item.id,
          motivo: `Status é ${d.status_negociacao ?? "indefinido"}, esperava pendente`,
        });
        continue;
      }
      if (!d.telefone || d.telefone.trim().length < 12) {
        inelegiveis.push({ id: item.id, motivo: "Sem telefone válido" });
        continue;
      }
      elegiveis.push({ item, devedor: d });
    }

    // Remove inelegíveis da fila (marca como erro com o motivo) para não
    // travarem o processamento das próximas execuções.
    if (inelegiveis.length > 0) {
      const ids = inelegiveis.map((i) => i.id).join(",");
      await rest(
        env,
        "PATCH",
        `/fran_fila_disparo?id=in.(${ids})`,
        {
          status: "erro",
          erro_detalhes: "Inelegível no processamento da fila",
          data_processado: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { Prefer: "return=minimal" }
      );
    }

    if (elegiveis.length === 0) {
      return ocioso("nenhum_elegivel", { inelegiveis: inelegiveis.length });
    }

    // Agrupa por campanha (itens podem ter campanhas diferentes). Na prática
    // costuma ser uma só, mas mantemos correto enviando um payload por grupo.
    const grupos = new Map<string, { devedor: DevedorRow; itemId: number }[]>();
    for (const { item, devedor } of elegiveis) {
      const chave = item.campanha ?? "";
      const lista = grupos.get(chave) ?? [];
      lista.push({ devedor, itemId: item.id });
      grupos.set(chave, lista);
    }

    let enviados = 0;
    let erros = 0;
    const agora = new Date().toISOString();

    for (const [campanhaChave, grupo] of grupos) {
      const campanha = campanhaChave || undefined;
      const devedores = grupo.map((g) => g.devedor);
      const itemIds = grupo.map((g) => g.itemId);
      const devedorIds = devedores.map((d) => d.id);

      const webhook = await enviarWebhook(webhookUrl, {
        campanha,
        origem: "fila",
        reenviar: false,
        devedores: devedores.map(montarPayloadDevedor),
      });

      // Registra em fran_disparos (1 linha por devedor).
      const linhas = devedores.map((d) => ({
        devedor_id: d.id,
        telefone: d.telefone,
        data_disparo: agora,
        status_envio: webhook.ok ? "enviado" : "erro",
        erro_detalhes: webhook.erro,
        webhook_response: webhook.resposta,
        campanha,
      }));
      const insResp = await rest(env, "POST", "/fran_disparos", linhas, {
        Prefer: "return=minimal",
      });
      if (!insResp.ok) {
        console.error(
          "[processar-fila] erro ao inserir fran_disparos:",
          insResp.status,
          await insResp.text()
        );
      }

      if (webhook.ok) {
        enviados += devedores.length;
        // Marca itens da fila como enviados.
        await rest(
          env,
          "PATCH",
          `/fran_fila_disparo?id=in.(${itemIds.join(",")})`,
          {
            status: "enviado",
            erro_detalhes: null,
            data_processado: agora,
            updated_at: agora,
          },
          { Prefer: "return=minimal" }
        );
        // Atualiza devedores: primeira mensagem enviada.
        await rest(
          env,
          "PATCH",
          `/fran_devedores?id=in.(${devedorIds.join(",")})`,
          {
            status_negociacao: "primeira_msg",
            data_primeiro_disparo: agora,
            data_ultimo_contato: agora,
          },
          { Prefer: "return=minimal" }
        );
      } else {
        erros += devedores.length;
        // Incrementa tentativas; se estourar o máximo, marca erro, senão
        // devolve para a fila para nova tentativa no próximo ciclo.
        for (const g of grupo) {
          const tentativas =
            (elegiveis.find((e) => e.item.id === g.itemId)?.item.tentativas ??
              0) + 1;
          const estourou = tentativas >= MAX_TENTATIVAS;
          await rest(
            env,
            "PATCH",
            `/fran_fila_disparo?id=eq.${g.itemId}`,
            {
              status: estourou ? "erro" : "na_fila",
              tentativas,
              erro_detalhes: webhook.erro,
              updated_at: agora,
              ...(estourou ? { data_processado: agora } : {}),
            },
            { Prefer: "return=minimal" }
          );
        }
      }
    }

    return jsonResponse({
      ok: true,
      processados: elegiveis.length,
      enviados,
      erros,
      inelegiveis: inelegiveis.length,
      quota,
      restante_dia: Math.max(0, restanteDia - enviados),
      enviados_hoje: enviadosHoje + enviados,
      limite_diario: limiteDiario,
      por_hora: porHora,
    });
  } catch (err) {
    console.error("[processar-fila] exceção não tratada:", err);
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse(
      { error: message, stack: err instanceof Error ? err.stack : undefined },
      500
    );
  }
});
