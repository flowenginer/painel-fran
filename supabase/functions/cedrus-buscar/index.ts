// Edge Function: cedrus-buscar
//
// Proxy autenticado para a API do Cedrus. Recebe filtros, busca as
// credenciais em fran_config, faz GET com Basic Auth, normaliza os
// devedores e retorna array pré-processado + metadata de paginação.

import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { lerConfig, lerEnv, validarJwt } from "../_shared/supabase-rest.ts";
import {
  buscarDevedoresCedrus,
  CedrusError,
  type CedrusFilters,
} from "./cedrus-client.ts";
import { transformarDevedor } from "./transform.ts";

const TAMANHO_PAGINA_CEDRUS = 50;

interface RequestBody {
  id_devedor?: string;
  cod_credor?: string;
  cod_devedor?: string;
  cnpj_cpf?: string;
  status?: string;
  dt_vencimento_de?: string;
  dt_vencimento_ate?: string;
  num_pagina?: number;
  /** Se true, inclui o JSON bruto da Cedrus na resposta para auditoria. */
  debug?: boolean;
}

function validarBody(body: unknown): RequestBody {
  if (!body || typeof body !== "object") {
    throw new Error("Body deve ser um objeto JSON");
  }
  const b = body as Record<string, unknown>;

  const result: RequestBody = {};

  if (b.id_devedor !== undefined) result.id_devedor = String(b.id_devedor);
  if (b.cod_credor !== undefined) result.cod_credor = String(b.cod_credor);
  if (b.cod_devedor !== undefined) result.cod_devedor = String(b.cod_devedor);
  if (b.cnpj_cpf !== undefined)
    result.cnpj_cpf = String(b.cnpj_cpf).replace(/\D/g, "");
  if (b.status !== undefined) {
    const s = String(b.status).toUpperCase();
    if (!["A", "P", "C", "S"].includes(s)) {
      throw new Error("status deve ser A, P, C ou S");
    }
    result.status = s;
  }
  if (b.dt_vencimento_de !== undefined)
    result.dt_vencimento_de = String(b.dt_vencimento_de);
  if (b.dt_vencimento_ate !== undefined)
    result.dt_vencimento_ate = String(b.dt_vencimento_ate);
  if (b.num_pagina !== undefined) {
    const n = Number(b.num_pagina);
    if (!Number.isFinite(n) || n < 1) throw new Error("num_pagina inválido");
    result.num_pagina = Math.floor(n);
  }
  if (b.debug === true) result.debug = true;

  if (
    !result.id_devedor &&
    !result.cod_credor &&
    !result.cnpj_cpf &&
    !result.cod_devedor
  ) {
    throw new Error(
      "Informe ao menos um filtro: id_devedor, cod_credor, cod_devedor ou cnpj_cpf."
    );
  }

  return result;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Método não permitido" }, 405);
  }

  try {
    // Etapa 1: validar env
    console.log("[cedrus-buscar] start");
    const env = lerEnv();

    // Etapa 2: validar JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Header Authorization ausente" }, 401);
    }
    try {
      await validarJwt(env, authHeader);
    } catch (err) {
      console.error("[cedrus-buscar] JWT inválido:", err);
      return jsonResponse(
        {
          error:
            "Sessão inválida ou expirada. Faça logout e login novamente.",
          detail: err instanceof Error ? err.message : String(err),
        },
        401
      );
    }

    // Etapa 3: validar body
    const body = await req.json().catch(() => null);
    const filtros = validarBody(body);

    // Etapa 4: ler config Cedrus
    const cfg = await lerConfig(env, [
      "cedrus_apikey",
      "cedrus_url_base",
    ]);
    const apikey = cfg.cedrus_apikey?.trim();
    const urlBase =
      cfg.cedrus_url_base?.trim() ||
      "https://api.sistemadecobranca.com.br:3001/v1";
    if (!apikey) {
      return jsonResponse(
        {
          error:
            "API Key do Cedrus não configurada. Defina em Configurações.",
        },
        400
      );
    }

    // Etapa 5: chamar Cedrus
    const pagina = filtros.num_pagina ?? 1;
    const cedrusFilters: CedrusFilters = {
      id_devedor: filtros.id_devedor,
      cod_credor: filtros.cod_credor,
      cod_devedor: filtros.cod_devedor,
      cnpj_cpf: filtros.cnpj_cpf,
      status: filtros.status as CedrusFilters["status"],
      dt_vencimento_de: filtros.dt_vencimento_de,
      dt_vencimento_ate: filtros.dt_vencimento_ate,
      num_pagina: pagina,
    };

    console.log("[cedrus-buscar] chamando cedrus", {
      urlBase,
      filtrosEnviados: cedrusFilters,
    });
    const resp = await buscarDevedoresCedrus(urlBase, apikey, cedrusFilters);
    console.log("[cedrus-buscar] cedrus retornou", {
      count: resp.devedores.length,
      message: resp.rawMessage,
      // Limita o snapshot para 10 primeiros para não explodir log
      primeiros3IdsECpfs: resp.devedores.slice(0, 10).map((d) => ({
        id_devedor: (d as Record<string, unknown>).id_devedor,
        cod_credor: (d as Record<string, unknown>).cod_credor,
        cod_devedor: (d as Record<string, unknown>).cod_devedor,
        cnpj_cpf: (d as Record<string, unknown>).cnpj_cpf,
        nome_devedor: (d as Record<string, unknown>).nome_devedor,
      })),
    });
    // JSON bruto completo do primeiro devedor (pra auditoria de campos)
    if (resp.devedores.length > 0) {
      const primeiro = resp.devedores[0];
      console.log(
        "[cedrus-buscar] bruto primeiro devedor:",
        JSON.stringify(primeiro).slice(0, 5000)
      );
    }

    // Etapa 6: normalizar
    const normalizados = resp.devedores.map(transformarDevedor);
    const possuiProximaPagina =
      resp.devedores.length >= TAMANHO_PAGINA_CEDRUS;

    const body: Record<string, unknown> = {
      devedores: normalizados,
      pagina,
      tamanhoPagina: TAMANHO_PAGINA_CEDRUS,
      possuiProximaPagina,
      total: resp.devedores.length,
      message: resp.rawMessage,
    };

    // Modo debug: inclui o JSON bruto na resposta para auditoria manual.
    if (filtros.debug) {
      body.brutoCedrus = resp.devedores;
      body.filtrosEnviados = cedrusFilters;
    }

    return jsonResponse(body);
  } catch (err) {
    console.error("[cedrus-buscar] exceção não tratada:", err);

    if (err instanceof CedrusError) {
      return jsonResponse(
        { error: err.message, detail: err.detail },
        err.status >= 400 && err.status < 600 ? err.status : 502
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    const isValidation =
      /Informe ao menos|status deve ser|num_pagina|Body deve ser/.test(message);
    return jsonResponse(
      { error: message, stack: err instanceof Error ? err.stack : undefined },
      isValidation ? 400 : 500
    );
  }
});
