// Edge Function: admin-usuarios
//
// Gerência de usuários do painel pelo admin. Só pode ser chamada por um
// usuário cujo perfil em fran_usuarios tenha role = 'admin' e ativo = true.
//
// Ações (no corpo JSON, campo "action"):
//   - listar                          → lista todos os perfis
//   - criar    { email, password, nome?, role?, recebe_distribuicao?, permissoes? }
//   - atualizar{ id, nome?, role?, ativo?, recebe_distribuicao?, permissoes? }
//   - resetar_senha { id, password }
//   - remover  { id }                 → exclui o usuário do auth (cascata no perfil)
//
// Usa service_role para a Admin API do GoTrue e para o PostgREST, ignorando
// RLS. A autorização real é feita aqui (checa o papel do chamador).

// NOTA: esta função é autossuficiente (sem imports de ../_shared) de
// propósito, para poder ser colada e deployada direto pelo editor de Edge
// Functions do Supabase Dashboard, sem CLI/terminal.

// ---- CORS ------------------------------------------------------------------
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

// ---- Acesso ao Supabase (REST + Auth) --------------------------------------
interface SupabaseEnv {
  url: string;
  anonKey: string;
  serviceKey: string;
}

function lerEnv(): SupabaseEnv {
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) {
    throw new Error("Variáveis de ambiente do Supabase ausentes");
  }
  return { url, anonKey, serviceKey };
}

interface UserInfo {
  id: string;
  email?: string;
}

// Valida o JWT chamando /auth/v1/user.
async function validarJwt(
  env: SupabaseEnv,
  authHeader: string
): Promise<UserInfo> {
  const resp = await fetch(`${env.url}/auth/v1/user`, {
    headers: { Authorization: authHeader, apikey: env.anonKey },
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

// PostgREST com service role.
async function rest(
  env: SupabaseEnv,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
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

interface Permissoes {
  paginas: string[];
  acoes: string[];
}

interface PerfilRow {
  id: string;
  nome: string | null;
  email: string | null;
  role: string;
  ativo: boolean;
  recebe_distribuicao: boolean;
  permissoes: Permissoes;
  ultima_atribuicao_em: string | null;
  created_at: string;
  updated_at: string;
}

// Chama a Admin API do GoTrue (criar/atualizar/remover usuários do auth).
async function authAdmin(
  env: SupabaseEnv,
  method: "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown
): Promise<Response> {
  return fetch(`${env.url}/auth/v1/admin${path}`, {
    method,
    headers: {
      apikey: env.serviceKey,
      Authorization: `Bearer ${env.serviceKey}`,
      "Content-Type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// Lê um perfil por id.
async function lerPerfil(env: SupabaseEnv, id: string): Promise<PerfilRow | null> {
  const resp = await rest(
    env,
    "GET",
    `/fran_usuarios?id=eq.${id}&select=id,nome,email,role,ativo,recebe_distribuicao,permissoes,ultima_atribuicao_em,created_at,updated_at`
  );
  if (!resp.ok) return null;
  const rows = (await resp.json()) as PerfilRow[];
  return rows[0] ?? null;
}

// Normaliza o objeto de permissões para o shape esperado.
function normalizarPermissoes(v: unknown): Permissoes {
  const obj = (v ?? {}) as Partial<Permissoes>;
  const limpar = (a: unknown) =>
    Array.isArray(a) ? a.filter((x): x is string => typeof x === "string") : [];
  return { paginas: limpar(obj.paginas), acoes: limpar(obj.acoes) };
}

function validarRole(role: unknown): "admin" | "operador" {
  return role === "admin" ? "admin" : "operador";
}

function emailValido(email: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Método não permitido" }, 405);
  }

  try {
    const env = lerEnv();

    // 1. Autentica o chamador.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Não autorizado" }, 401);
    let callerId: string;
    try {
      const user = await validarJwt(env, authHeader);
      callerId = user.id;
    } catch {
      return jsonResponse({ error: "Sessão inválida" }, 401);
    }

    // 2. Exige que o chamador seja admin ativo.
    const callerPerfil = await lerPerfil(env, callerId);
    if (!callerPerfil || callerPerfil.role !== "admin" || !callerPerfil.ativo) {
      return jsonResponse({ error: "Acesso restrito a administradores" }, 403);
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action ?? "");

    // ---- listar -----------------------------------------------------------
    if (action === "listar") {
      const resp = await rest(
        env,
        "GET",
        "/fran_usuarios?select=id,nome,email,role,ativo,recebe_distribuicao,permissoes,ultima_atribuicao_em,created_at,updated_at&order=created_at.asc"
      );
      if (!resp.ok) {
        return jsonResponse({ error: await resp.text() }, 500);
      }
      return jsonResponse({ ok: true, usuarios: await resp.json() });
    }

    // ---- criar ------------------------------------------------------------
    if (action === "criar") {
      const email = String(body.email ?? "").trim().toLowerCase();
      const password = String(body.password ?? "");
      const nome = body.nome != null ? String(body.nome).trim() : null;
      const role = validarRole(body.role);
      const recebeDistribuicao = body.recebe_distribuicao !== false;
      const permissoes = normalizarPermissoes(body.permissoes);

      if (!emailValido(email)) {
        return jsonResponse({ error: "E-mail inválido" }, 400);
      }
      if (password.length < 6) {
        return jsonResponse(
          { error: "A senha deve ter no mínimo 6 caracteres" },
          400
        );
      }

      // Cria no auth (já confirmado, para poder logar de imediato).
      const criarResp = await authAdmin(env, "POST", "/users", {
        email,
        password,
        email_confirm: true,
        user_metadata: nome ? { nome } : {},
      });
      if (!criarResp.ok) {
        const texto = await criarResp.text();
        const status = criarResp.status === 422 ? 409 : criarResp.status;
        const msg = /already|exists|registered/i.test(texto)
          ? "Já existe um usuário com este e-mail"
          : `Falha ao criar usuário: ${texto}`;
        return jsonResponse({ error: msg }, status);
      }
      const novo = (await criarResp.json()) as { id: string };

      // O trigger handle_new_user já criou o perfil; aplica os atributos.
      const patchResp = await rest(
        env,
        "PATCH",
        `/fran_usuarios?id=eq.${novo.id}`,
        {
          nome,
          email,
          role,
          ativo: true,
          recebe_distribuicao: recebeDistribuicao,
          permissoes,
          updated_at: new Date().toISOString(),
        },
        { Prefer: "return=representation" }
      );
      if (!patchResp.ok) {
        return jsonResponse({ error: await patchResp.text() }, 500);
      }
      const perfil = (await patchResp.json()) as PerfilRow[];
      return jsonResponse({ ok: true, usuario: perfil[0] ?? null });
    }

    // ---- atualizar --------------------------------------------------------
    if (action === "atualizar") {
      const id = String(body.id ?? "");
      if (!id) return jsonResponse({ error: "id é obrigatório" }, 400);
      const alvo = await lerPerfil(env, id);
      if (!alvo) return jsonResponse({ error: "Usuário não encontrado" }, 404);

      const patch: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (body.nome !== undefined) patch.nome = body.nome ? String(body.nome) : null;
      if (body.role !== undefined) patch.role = validarRole(body.role);
      if (body.ativo !== undefined) patch.ativo = Boolean(body.ativo);
      if (body.recebe_distribuicao !== undefined)
        patch.recebe_distribuicao = Boolean(body.recebe_distribuicao);
      if (body.permissoes !== undefined)
        patch.permissoes = normalizarPermissoes(body.permissoes);

      // Salvaguardas: não deixar o sistema sem admin ativo.
      const removendoAdmin =
        (patch.role !== undefined && patch.role !== "admin") ||
        (patch.ativo === false);
      if (removendoAdmin && alvo.role === "admin" && alvo.ativo) {
        const adminsResp = await rest(
          env,
          "GET",
          "/fran_usuarios?role=eq.admin&ativo=eq.true&select=id",
          undefined,
          { Prefer: "count=exact" }
        );
        const range = adminsResp.headers.get("content-range") ?? "0-0/0";
        const totalAdmins = Number(range.split("/")[1]) || 0;
        if (totalAdmins <= 1) {
          return jsonResponse(
            {
              error:
                "Não é possível rebaixar ou desativar o último administrador ativo",
            },
            409
          );
        }
      }

      const resp = await rest(
        env,
        "PATCH",
        `/fran_usuarios?id=eq.${id}`,
        patch,
        { Prefer: "return=representation" }
      );
      if (!resp.ok) return jsonResponse({ error: await resp.text() }, 500);
      const perfil = (await resp.json()) as PerfilRow[];
      return jsonResponse({ ok: true, usuario: perfil[0] ?? null });
    }

    // ---- resetar_senha ----------------------------------------------------
    if (action === "resetar_senha") {
      const id = String(body.id ?? "");
      const password = String(body.password ?? "");
      if (!id) return jsonResponse({ error: "id é obrigatório" }, 400);
      if (password.length < 6) {
        return jsonResponse(
          { error: "A senha deve ter no mínimo 6 caracteres" },
          400
        );
      }
      const resp = await authAdmin(env, "PUT", `/users/${id}`, { password });
      if (!resp.ok) {
        return jsonResponse({ error: await resp.text() }, 500);
      }
      return jsonResponse({ ok: true });
    }

    // ---- remover ----------------------------------------------------------
    if (action === "remover") {
      const id = String(body.id ?? "");
      if (!id) return jsonResponse({ error: "id é obrigatório" }, 400);
      if (id === callerId) {
        return jsonResponse(
          { error: "Você não pode remover a si mesmo" },
          409
        );
      }
      const alvo = await lerPerfil(env, id);
      if (alvo?.role === "admin" && alvo.ativo) {
        const adminsResp = await rest(
          env,
          "GET",
          "/fran_usuarios?role=eq.admin&ativo=eq.true&select=id",
          undefined,
          { Prefer: "count=exact" }
        );
        const range = adminsResp.headers.get("content-range") ?? "0-0/0";
        const totalAdmins = Number(range.split("/")[1]) || 0;
        if (totalAdmins <= 1) {
          return jsonResponse(
            { error: "Não é possível remover o último administrador ativo" },
            409
          );
        }
      }
      // Remove do auth; o ON DELETE CASCADE da FK apaga o perfil.
      const resp = await authAdmin(env, "DELETE", `/users/${id}`);
      if (!resp.ok && resp.status !== 404) {
        return jsonResponse({ error: await resp.text() }, 500);
      }
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: `Ação desconhecida: ${action}` }, 400);
  } catch (err) {
    console.error("[admin-usuarios] exceção:", err);
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 500);
  }
});
