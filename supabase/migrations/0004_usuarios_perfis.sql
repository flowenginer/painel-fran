-- ============================================================================
-- Fase 1 — Identidade e perfis de usuário (login e acesso por pessoa)
-- ============================================================================
-- Rode no SQL Editor do Supabase Cloud. Idempotente — pode rodar de novo.
--
-- O que cria:
--   1. Tabela public.fran_usuarios (perfil 1:1 com auth.users)
--   2. Função fran_is_admin() — usada pelas políticas de RLS das próximas fases
--   3. Trigger handle_new_user — cria o perfil automaticamente para cada
--      usuário novo do Supabase Auth (default: papel "operador")
--   4. Backfill — cria perfil para usuários de auth já existentes
--   5. Promove o e-mail do admin geral para role = 'admin'
--   6. RLS apenas em fran_usuarios (as tabelas de dados — devedores, memory —
--      serão apertadas em fase posterior, após validar o login do admin)
--
-- IMPORTANTE (segurança): a senha do admin NÃO é definida aqui. Crie o
-- usuário no Supabase Auth (Dashboard > Authentication > Users, ou pelo
-- painel admin da Fase 2) com o e-mail abaixo; este script só garante que,
-- existindo esse e-mail, ele tenha papel de admin.
--
--   Admin geral: bellastival@hotmail.com
-- ============================================================================

-- 1. Tabela de perfis ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fran_usuarios (
    id                   UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nome                 TEXT,
    email                TEXT,
    -- 'admin'  → acesso total, gerencia usuários e permissões
    -- 'operador' → acesso conforme permissoes; vê só o que lhe foi atribuído
    role                 TEXT NOT NULL DEFAULT 'operador'
                              CHECK (role IN ('admin', 'operador')),
    ativo                BOOLEAN NOT NULL DEFAULT TRUE,
    -- Participa do round-robin de distribuição de leads (Fase 3).
    recebe_distribuicao  BOOLEAN NOT NULL DEFAULT TRUE,
    -- Permissões granulares ditadas pelo admin:
    --   { "paginas": ["conversas", ...], "acoes": ["transferir_conversa", ...] }
    -- Admin ignora estas permissões (acesso total).
    permissoes           JSONB NOT NULL DEFAULT '{"paginas": [], "acoes": []}'::jsonb,
    -- Marca da última vez que recebeu um lead (round-robin justo da Fase 3).
    ultima_atribuicao_em TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS fran_usuarios_role_idx
    ON public.fran_usuarios (role) WHERE ativo;

-- 2. Helper: o usuário autenticado é admin ativo? --------------------------
-- SECURITY DEFINER para poder ler fran_usuarios mesmo sob RLS restritiva,
-- sem cair em recursão de política. Marcada STABLE pois não escreve.
CREATE OR REPLACE FUNCTION public.fran_is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.fran_usuarios
         WHERE id = auth.uid()
           AND role = 'admin'
           AND ativo
    );
$$;

-- 3. Provisionamento automático de perfil ----------------------------------
-- Quando um usuário é criado no Supabase Auth, cria o perfil correspondente.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.fran_usuarios (id, email, nome)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'nome', NEW.raw_user_meta_data->>'name')
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. Backfill: perfis para usuários de auth já existentes -------------------
INSERT INTO public.fran_usuarios (id, email)
SELECT u.id, u.email
  FROM auth.users u
 ON CONFLICT (id) DO NOTHING;

-- Mantém o e-mail do perfil em dia com o auth (caso tenha mudado).
UPDATE public.fran_usuarios p
   SET email = u.email
  FROM auth.users u
 WHERE u.id = p.id
   AND p.email IS DISTINCT FROM u.email;

-- 5. Promove o admin geral --------------------------------------------------
-- Roda agora (se o usuário já existe) e é seguro repetir. Se você criar o
-- usuário depois, rode apenas este UPDATE de novo.
UPDATE public.fran_usuarios
   SET role = 'admin', ativo = TRUE, updated_at = NOW()
 WHERE lower(email) = lower('bellastival@hotmail.com');

-- 6. RLS de fran_usuarios ---------------------------------------------------
ALTER TABLE public.fran_usuarios ENABLE ROW LEVEL SECURITY;

-- SELECT: cada um lê o próprio perfil; admin lê todos.
DROP POLICY IF EXISTS "usuarios_select_self_or_admin" ON public.fran_usuarios;
CREATE POLICY "usuarios_select_self_or_admin"
    ON public.fran_usuarios FOR SELECT
    TO authenticated
    USING (id = auth.uid() OR public.fran_is_admin());

-- INSERT/UPDATE/DELETE: somente admin pela API do cliente. A criação de
-- usuários acontece via Edge Function com service_role (Fase 2), que ignora
-- RLS; estas políticas protegem o acesso direto com o token do operador.
DROP POLICY IF EXISTS "usuarios_insert_admin" ON public.fran_usuarios;
CREATE POLICY "usuarios_insert_admin"
    ON public.fran_usuarios FOR INSERT
    TO authenticated
    WITH CHECK (public.fran_is_admin());

DROP POLICY IF EXISTS "usuarios_update_admin" ON public.fran_usuarios;
CREATE POLICY "usuarios_update_admin"
    ON public.fran_usuarios FOR UPDATE
    TO authenticated
    USING (public.fran_is_admin())
    WITH CHECK (public.fran_is_admin());

DROP POLICY IF EXISTS "usuarios_delete_admin" ON public.fran_usuarios;
CREATE POLICY "usuarios_delete_admin"
    ON public.fran_usuarios FOR DELETE
    TO authenticated
    USING (public.fran_is_admin());

-- Mantém updated_at em dia.
CREATE OR REPLACE FUNCTION public.fran_usuarios_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fran_usuarios_set_updated_at ON public.fran_usuarios;
CREATE TRIGGER fran_usuarios_set_updated_at
    BEFORE UPDATE ON public.fran_usuarios
    FOR EACH ROW EXECUTE FUNCTION public.fran_usuarios_touch_updated_at();
