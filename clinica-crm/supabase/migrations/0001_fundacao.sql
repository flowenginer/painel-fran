-- ============================================================================
-- Fundação do CRM da Clínica — multi-unidade
-- ============================================================================
-- Rode no SQL Editor do Supabase Cloud. Idempotente (pode rodar de novo).
-- Cria: unidades, usuarios (1:1 auth.users), pacientes, helpers de RLS,
-- políticas RLS por unidade e um trigger que provisiona o perfil no signup.
-- ============================================================================

-- 1. Unidades --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.unidades (
    id         BIGSERIAL PRIMARY KEY,
    nome       TEXT NOT NULL,
    ativo      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Usuários (perfil 1:1 com auth.users) ----------------------------------
CREATE TABLE IF NOT EXISTS public.usuarios (
    id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nome       TEXT,
    email      TEXT,
    -- admin (dona) | atendente
    role       TEXT NOT NULL DEFAULT 'atendente',
    ativo      BOOLEAN NOT NULL DEFAULT TRUE,
    -- unidade da atendente; NULL para admin (enxerga todas)
    unidade_id BIGINT REFERENCES public.unidades(id) ON DELETE SET NULL,
    -- { "paginas": [...], "acoes": [...] }
    permissoes JSONB NOT NULL DEFAULT '{"paginas":[],"acoes":[]}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Pacientes/leads -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pacientes (
    id                    BIGSERIAL PRIMARY KEY,
    unidade_id            BIGINT NOT NULL REFERENCES public.unidades(id) ON DELETE CASCADE,
    -- Contato (pré-cadastro = só telefone)
    telefone              TEXT NOT NULL,
    nome                  TEXT,
    email                 TEXT,
    procedimento          TEXT,
    -- Funil: lead_novo | em_atendimento | agendou | compareceu | paciente | perdido
    status_funil          TEXT NOT NULL DEFAULT 'lead_novo',
    responsavel_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    -- Atribuição de anúncio (Click-to-WhatsApp) — preenchido em fase futura
    origem_campanha       TEXT,
    origem_criativo       TEXT,
    origem_anuncio_id     TEXT,
    data_primeiro_contato TIMESTAMPTZ,
    data_ultimo_contato   TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pacientes_unidade_idx ON public.pacientes (unidade_id, status_funil);
CREATE INDEX IF NOT EXISTS pacientes_responsavel_idx ON public.pacientes (responsavel_id);
-- Um telefone é único DENTRO da unidade.
CREATE UNIQUE INDEX IF NOT EXISTS pacientes_tel_unidade_idx
    ON public.pacientes (unidade_id, telefone);

-- 4. Helpers de RLS (SECURITY DEFINER, evitam recursão de policy) -----------
CREATE OR REPLACE FUNCTION public.crm_is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.usuarios
        WHERE id = auth.uid() AND role = 'admin' AND ativo
    );
$$;

CREATE OR REPLACE FUNCTION public.crm_minha_unidade()
RETURNS bigint LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public AS $$
    SELECT unidade_id FROM public.usuarios WHERE id = auth.uid();
$$;

-- 5. Provisiona o perfil no signup -----------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
    INSERT INTO public.usuarios (id, email, nome)
    VALUES (NEW.id, NEW.email, split_part(NEW.email, '@', 1))
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at automático
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS usuarios_touch ON public.usuarios;
CREATE TRIGGER usuarios_touch BEFORE UPDATE ON public.usuarios
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS pacientes_touch ON public.pacientes;
CREATE TRIGGER pacientes_touch BEFORE UPDATE ON public.pacientes
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 6. RLS -------------------------------------------------------------------
ALTER TABLE public.unidades  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pacientes ENABLE ROW LEVEL SECURITY;

-- unidades: todo autenticado lê; só admin escreve.
DROP POLICY IF EXISTS unidades_select ON public.unidades;
CREATE POLICY unidades_select ON public.unidades FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS unidades_admin_write ON public.unidades;
CREATE POLICY unidades_admin_write ON public.unidades FOR ALL TO authenticated
    USING (public.crm_is_admin()) WITH CHECK (public.crm_is_admin());

-- usuarios: cada um lê o próprio; admin lê/gerencia todos.
DROP POLICY IF EXISTS usuarios_select ON public.usuarios;
CREATE POLICY usuarios_select ON public.usuarios FOR SELECT TO authenticated
    USING (id = auth.uid() OR public.crm_is_admin());
DROP POLICY IF EXISTS usuarios_admin_write ON public.usuarios;
CREATE POLICY usuarios_admin_write ON public.usuarios FOR ALL TO authenticated
    USING (public.crm_is_admin()) WITH CHECK (public.crm_is_admin());

-- pacientes: admin vê todas as unidades; atendente só a sua.
DROP POLICY IF EXISTS pacientes_rls ON public.pacientes;
CREATE POLICY pacientes_rls ON public.pacientes FOR ALL TO authenticated
    USING (public.crm_is_admin() OR unidade_id = public.crm_minha_unidade())
    WITH CHECK (public.crm_is_admin() OR unidade_id = public.crm_minha_unidade());

-- 7. Seed: unidade inicial -------------------------------------------------
INSERT INTO public.unidades (nome)
SELECT 'Matriz'
WHERE NOT EXISTS (SELECT 1 FROM public.unidades);

-- ============================================================================
-- BOOTSTRAP DO 1º ADMIN (rodar UMA vez, à mão, depois de criar o usuário no
-- Supabase Auth): promova a dona a admin.
--   UPDATE public.usuarios SET role = 'admin', ativo = true
--    WHERE email = 'dona@clinica.com';
-- ============================================================================
