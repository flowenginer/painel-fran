// Edge Function: cedrus-buscar
//
// Proxy autenticado para a API do Cedrus. Recebe filtros do frontend,
// busca as credenciais em fran_config, faz GET com Basic Auth, normaliza
// os devedores e retorna array pré-processado + metadata de paginação.
//
// Requisição:
//   POST /functions/v1/cedrus-buscar
//   Authorization: Bearer <user JWT>
//   Content-Type: application/json
//   Body: { id_devedor?, cod_credor?, cnpj_cpf?, status?, dt_vencimento_de?,
//           dt_vencimento_ate?, num_pagina? }
//
// Resposta (200):
//   {
//     devedores: DevedorNormalizado[],
//     pagina: number,
//     tamanhoPagina: number,
//     possuiProximaPagina: boolean,
//     total: number,
//     message?: string
//   }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";

import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
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

  // Precisa pelo menos de um filtro de busca
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

async function lerConfigCedrus(
  supabaseUrl: string,
  serviceKey: string
): Promise<{ apikey: string; urlBase: string }> {
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin
    .from("fran_config")
    .select("chave, valor")
    .in("chave", ["cedrus_apikey", "cedrus_url_base"]);

  if (error) throw new Error(`Falha ao ler fran_config: ${error.message}`);

  const mapa: Record<string, string> = {};
  for (const row of data ?? []) {
    mapa[row.chave as string] = (row.valor as string | null) ?? "";
  }

  const apikey = mapa.cedrus_apikey?.trim();
  const urlBase =
    mapa.cedrus_url_base?.trim() ||
    "https://api.sistemadecobranca.com.br:3001/v1";

  if (!apikey) {
    throw new Error(
      "API Key do Cedrus não configurada. Defina fran_config.cedrus_apikey em Configurações."
    );
  }

  return { apikey, urlBase };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Método não permitido" }, 405);
  }

  try {
    // Valida autenticação do usuário — o painel só chama autenticado.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Não autenticado" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !serviceKey || !anonKey) {
      return jsonResponse(
        { error: "Variáveis de ambiente do Supabase ausentes" },
        500
      );
    }

    // Verifica sessão válida
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return jsonResponse({ error: "Sessão inválida" }, 401);
    }

    // Parse e valida body
    const body = await req.json().catch(() => null);
    const filtros = validarBody(body);

    // Lê config do Cedrus (service role pra ignorar RLS)
    const { apikey, urlBase } = await lerConfigCedrus(supabaseUrl, serviceKey);

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

    const resp = await buscarDevedoresCedrus(urlBase, apikey, cedrusFilters);

    const normalizados = resp.devedores.map(transformarDevedor);

    // Sinal de paginação: se veio exatamente 50, pode existir próxima página.
    const possuiProximaPagina =
      resp.devedores.length >= TAMANHO_PAGINA_CEDRUS;

    return jsonResponse({
      devedores: normalizados,
      pagina,
      tamanhoPagina: TAMANHO_PAGINA_CEDRUS,
      possuiProximaPagina,
      total: resp.devedores.length,
      message: resp.rawMessage,
    });
  } catch (err) {
    if (err instanceof CedrusError) {
      return jsonResponse(
        { error: err.message, detail: err.detail },
        err.status >= 400 && err.status < 600 ? err.status : 502
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    // Erros de validação do body → 400
    const isValidation =
      /Informe ao menos|status deve ser|num_pagina|Body deve ser/.test(message);
    return jsonResponse({ error: message }, isValidation ? 400 : 500);
  }
});
