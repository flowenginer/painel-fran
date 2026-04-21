// Acesso à REST API do Supabase via fetch direto — evita a dependência
// esm.sh do supabase-js, que pode causar cold start lento ou 502.

export interface SupabaseEnv {
  url: string;
  anonKey: string;
  serviceKey: string;
}

export function lerEnv(): SupabaseEnv {
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) {
    throw new Error("Variáveis de ambiente do Supabase ausentes");
  }
  return { url, anonKey, serviceKey };
}

export interface UserInfo {
  id: string;
  email?: string;
}

/**
 * Valida o JWT chamando /auth/v1/user. Retorna o user ou lança erro claro.
 */
export async function validarJwt(
  env: SupabaseEnv,
  authHeader: string
): Promise<UserInfo> {
  const resp = await fetch(`${env.url}/auth/v1/user`, {
    headers: {
      Authorization: authHeader,
      apikey: env.anonKey,
    },
  });
  if (!resp.ok) {
    const texto = await resp.text().catch(() => "");
    throw new Error(
      `Sessão inválida (HTTP ${resp.status}): ${texto || "JWT não aceito"}`
    );
  }
  const user = (await resp.json()) as UserInfo;
  if (!user?.id) throw new Error("Usuário sem id retornado pelo auth");
  return user;
}

/**
 * Lê múltiplas chaves de fran_config usando service role.
 */
export async function lerConfig(
  env: SupabaseEnv,
  chaves: string[]
): Promise<Record<string, string>> {
  const filtro = `chave=in.(${chaves.join(",")})`;
  const resp = await fetch(
    `${env.url}/rest/v1/fran_config?${filtro}&select=chave,valor`,
    {
      headers: {
        apikey: env.serviceKey,
        Authorization: `Bearer ${env.serviceKey}`,
      },
    }
  );
  if (!resp.ok) {
    const texto = await resp.text().catch(() => "");
    throw new Error(`Falha ao ler fran_config: ${resp.status} ${texto}`);
  }
  const rows = (await resp.json()) as Array<{
    chave: string;
    valor: string | null;
  }>;
  const mapa: Record<string, string> = {};
  for (const r of rows) {
    mapa[r.chave] = r.valor ?? "";
  }
  return mapa;
}

/**
 * Helpers simples para INSERT/UPDATE/SELECT via PostgREST.
 */

export async function rest(
  env: SupabaseEnv,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string, // começa com /
  body?: unknown,
  extraHeaders: Record<string, string> = {}
): Promise<Response> {
  return fetch(`${env.url}/rest/v1${path}`, {
    method,
    headers: {
      apikey: env.serviceKey,
      Authorization: `Bearer ${env.serviceKey}`,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}
