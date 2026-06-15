-- ============================================================================
-- Hardening de segurança — RLS de tabelas auxiliares
-- ============================================================================
-- Rode no SQL Editor do Supabase Cloud. Idempotente.
--
-- Fecha vetores de EXTRAÇÃO DE DADOS encontrados na auditoria:
--   1. fran_config: segredos (apikey/secret/webhooks) só para admin.
--   2. fran_disparos: leitura só do dono do lead ou admin.
--   3. fran_fila_disparo: idem.
--   4. fran_instituicoes: garante RLS habilitada (sem leitura anônima).
--
-- n8n e Edge Functions usam service_role → IGNORAM RLS, então nada quebra
-- nos disparos/fila/config server-side. O admin (fran_is_admin) vê tudo.
--
-- Requer 0004 (fran_usuarios/fran_is_admin) e 0005 (responsavel_id).
-- ============================================================================

-- Helper para limpar todas as políticas de uma tabela antes de recriar.
-- (inline em cada bloco DO abaixo)

-- 1. fran_config -----------------------------------------------------------
ALTER TABLE public.fran_config ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol RECORD;
BEGIN
    FOR pol IN
        SELECT policyname FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'fran_config'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.fran_config', pol.policyname);
    END LOOP;
END $$;

-- SELECT: admin vê tudo; demais NÃO veem chaves sensíveis (segredos/webhooks).
CREATE POLICY "config_select_seguro"
    ON public.fran_config FOR SELECT
    TO authenticated
    USING (
        public.fran_is_admin()
        OR chave NOT IN (
            'cedrus_apikey',
            'uazapi_webhook_secret',
            'uazapi_webhook_url',
            'n8n_webhook_url',
            'fila_cron_secret'
        )
    );

-- Escrita de config: somente admin.
CREATE POLICY "config_insert_admin"
    ON public.fran_config FOR INSERT
    TO authenticated WITH CHECK (public.fran_is_admin());
CREATE POLICY "config_update_admin"
    ON public.fran_config FOR UPDATE
    TO authenticated USING (public.fran_is_admin()) WITH CHECK (public.fran_is_admin());
CREATE POLICY "config_delete_admin"
    ON public.fran_config FOR DELETE
    TO authenticated USING (public.fran_is_admin());

-- 2. fran_disparos: dono do lead ou admin ----------------------------------
ALTER TABLE public.fran_disparos ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol RECORD;
BEGIN
    FOR pol IN
        SELECT policyname FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'fran_disparos'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.fran_disparos', pol.policyname);
    END LOOP;
END $$;

CREATE POLICY "disparos_select_dono_ou_admin"
    ON public.fran_disparos FOR SELECT
    TO authenticated
    USING (
        public.fran_is_admin()
        OR EXISTS (
            SELECT 1 FROM public.fran_devedores d
             WHERE d.id = fran_disparos.devedor_id
               AND d.responsavel_id = auth.uid()
        )
    );

-- Escrita real é via service_role (Edge). Pelo cliente, só admin.
CREATE POLICY "disparos_insert_admin"
    ON public.fran_disparos FOR INSERT
    TO authenticated WITH CHECK (public.fran_is_admin());
CREATE POLICY "disparos_update_admin"
    ON public.fran_disparos FOR UPDATE
    TO authenticated USING (public.fran_is_admin()) WITH CHECK (public.fran_is_admin());
CREATE POLICY "disparos_delete_admin"
    ON public.fran_disparos FOR DELETE
    TO authenticated USING (public.fran_is_admin());

-- 3. fran_fila_disparo: dono do lead ou admin ------------------------------
ALTER TABLE public.fran_fila_disparo ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol RECORD;
BEGIN
    FOR pol IN
        SELECT policyname FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'fran_fila_disparo'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.fran_fila_disparo', pol.policyname);
    END LOOP;
END $$;

CREATE POLICY "fila_select_dono_ou_admin"
    ON public.fran_fila_disparo FOR SELECT
    TO authenticated
    USING (
        public.fran_is_admin()
        OR EXISTS (
            SELECT 1 FROM public.fran_devedores d
             WHERE d.id = fran_fila_disparo.devedor_id
               AND d.responsavel_id = auth.uid()
        )
    );

CREATE POLICY "fila_insert_admin"
    ON public.fran_fila_disparo FOR INSERT
    TO authenticated WITH CHECK (public.fran_is_admin());
CREATE POLICY "fila_update_admin"
    ON public.fran_fila_disparo FOR UPDATE
    TO authenticated USING (public.fran_is_admin()) WITH CHECK (public.fran_is_admin());
CREATE POLICY "fila_delete_admin"
    ON public.fran_fila_disparo FOR DELETE
    TO authenticated USING (public.fran_is_admin());

-- 4. fran_instituicoes: garante RLS (sem leitura anônima) ------------------
-- Dados de referência (credores) — leitura por autenticado, escrita por admin.
ALTER TABLE public.fran_instituicoes ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol RECORD;
BEGIN
    FOR pol IN
        SELECT policyname FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'fran_instituicoes'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.fran_instituicoes', pol.policyname);
    END LOOP;
END $$;

CREATE POLICY "instituicoes_select_auth"
    ON public.fran_instituicoes FOR SELECT
    TO authenticated USING (true);
CREATE POLICY "instituicoes_insert_admin"
    ON public.fran_instituicoes FOR INSERT
    TO authenticated WITH CHECK (public.fran_is_admin());
CREATE POLICY "instituicoes_update_admin"
    ON public.fran_instituicoes FOR UPDATE
    TO authenticated USING (public.fran_is_admin()) WITH CHECK (public.fran_is_admin());
CREATE POLICY "instituicoes_delete_admin"
    ON public.fran_instituicoes FOR DELETE
    TO authenticated USING (public.fran_is_admin());
