// Edge Function: uazapi-proxy
//
// Proxy autenticado que repassa chamadas do painel para um webhook do n8n
// (rodando na mesma VPS que já tem IP autorizado na allowlist da UAZAPI).
// O n8n por sua vez fala com chelsan.uazapi.com.
//
// Fluxo:
//   Painel → uazapi-proxy → webhook do n8n → UAZAPI
//
// Por que essa indireção: a UAZAPI restringe acesso por IP. O Supabase Edge
// não tem IP fixo, mas a VPS do cliente sim — e o n8n dela já está na
// allowlist (a Fran usa hoje pra mandar mensagens via UAZAPI).
//
// Configuração necessária em fran_config:
//   - uazapi_webhook_url     URL completa do webhook no n8n
//   - uazapi_webhook_secret  segredo enviado via header X-Painel-Secret

import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { lerConfig, lerEnv, validarJwt } from "../_shared/supabase-rest.ts";

const TIMEOUT_MS = 30_000;

type Acao = "status" | "connect" | "disconnect";
const ACOES_VALIDAS: Acao[] = ["status", "connect", "disconnect"];

interface RequestBody {
  acao: Acao;
}

function validarBody(raw: unknown): RequestBody {
  if (!raw || typeof raw !== "object") {
    throw new Error("Body deve ser um objeto JSON");
  }
  const b = raw as Record<string, unknown>;
  const acao = String(b.acao ?? "").trim() as Acao;
  if (!ACOES_VALIDAS.includes(acao)) {
    throw new Error(
      `Ação inválida. Use uma das: ${ACOES_VALIDAS.join(", ")}`
    );
  }
  return { acao };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Método não permitido" }, 405);
  }

  try {
    console.log("[uazapi-proxy] start");
    const env = lerEnv();

    // 1. Valida JWT do operador
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Header Authorization ausente" }, 401);
    }
    try {
      await validarJwt(env, authHeader);
    } catch (err) {
      console.error("[uazapi-proxy] JWT inválido:", err);
      return jsonResponse(
        {
          error: "Sessão inválida ou expirada. Faça login novamente.",
          detail: err instanceof Error ? err.message : String(err),
        },
        401
      );
    }

    // 2. Valida body
    const body = await req.json().catch(() => null);
    const { acao } = validarBody(body);

    // 3. Lê configs
    const cfg = await lerConfig(env, [
      "uazapi_webhook_url",
      "uazapi_webhook_secret",
    ]);
    const webhookUrl = cfg.uazapi_webhook_url?.trim();
    const secret = cfg.uazapi_webhook_secret?.trim();
    if (!webhookUrl) {
      return jsonResponse(
        {
          error:
            "URL do webhook UAZAPI não configurada. Defina uazapi_webhook_url em Configurações.",
        },
        400
      );
    }
    if (!secret) {
      return jsonResponse(
        {
          error:
            "Secret do webhook UAZAPI não configurado. Defina uazapi_webhook_secret em Configurações.",
        },
        400
      );
    }

    // 4. Chama o n8n
    console.log("[uazapi-proxy] chamando n8n", { acao, webhookUrl });
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

    let resp: Response;
    try {
      resp = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Painel-Secret": secret,
        },
        body: JSON.stringify({ acao }),
        signal: ctrl.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      const msg = err instanceof Error ? err.message : String(err);
      if (err instanceof Error && err.name === "AbortError") {
        return jsonResponse(
          { error: "Timeout ao chamar webhook n8n" },
          504
        );
      }
      return jsonResponse(
        { error: `Falha de rede ao chamar webhook: ${msg}` },
        502
      );
    }
    clearTimeout(timer);

    const texto = await resp.text();
    let json: unknown;
    try {
      json = texto ? JSON.parse(texto) : null;
    } catch {
      json = null;
    }

    if (!resp.ok) {
      console.error(
        "[uazapi-proxy] n8n respondeu erro",
        resp.status,
        texto.slice(0, 500)
      );
      return jsonResponse(
        {
          error: `Webhook n8n retornou HTTP ${resp.status}`,
          detail: json ?? texto.slice(0, 500),
        },
        resp.status === 401 ? 502 : resp.status
      );
    }

    // O n8n retorna um array com 1 item — desencapsula pra ficar mais limpo
    // no consumidor.
    let data: unknown = json;
    if (Array.isArray(json) && json.length > 0) {
      data = json[0];
    }

    return jsonResponse(data);
  } catch (err) {
    console.error("[uazapi-proxy] exceção não tratada:", err);
    const message = err instanceof Error ? err.message : String(err);
    const isValidation =
      /Ação inválida|Body deve ser/.test(message);
    return jsonResponse(
      { error: message, stack: err instanceof Error ? err.stack : undefined },
      isValidation ? 400 : 500
    );
  }
});
