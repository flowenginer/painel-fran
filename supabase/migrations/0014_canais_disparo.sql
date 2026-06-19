-- ============================================================================
-- Fase 2 — Distribuição de disparos entre canais (anti-bloqueio)
-- ============================================================================
-- Rode no SQL Editor do Supabase Cloud. Idempotente. Requer 0013_canais.sql.
--
-- O que faz:
--   1. fran_canais: flag `usar_no_disparo` (participa do rodízio de disparo) +
--      contadores `total_disparos` / `ultimo_disparo_em` para o rodízio justo.
--   2. fran_canal_token: token de cada instância — tabela SEGREDO, só admin lê.
--      (O service_role das Edge Functions ignora RLS.)
--   3. fran_proximo_canal_disparo(): escolhe o próximo canal por rodízio
--      ponderado pelo peso, entre os ativos + usar_no_disparo + com token.
--      Retorna (instancia, token) para o disparo mandar no payload.
-- ============================================================================

-- 1. Flags/contadores de disparo --------------------------------------------
ALTER TABLE public.fran_canais
    ADD COLUMN IF NOT EXISTS usar_no_disparo BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.fran_canais
    ADD COLUMN IF NOT EXISTS total_disparos BIGINT NOT NULL DEFAULT 0;
ALTER TABLE public.fran_canais
    ADD COLUMN IF NOT EXISTS ultimo_disparo_em TIMESTAMPTZ;

-- 2. Token por canal (SEGREDO — admin-only) ---------------------------------
CREATE TABLE IF NOT EXISTS public.fran_canal_token (
    canal_id   BIGINT PRIMARY KEY
               REFERENCES public.fran_canais(id) ON DELETE CASCADE,
    token      TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.fran_canal_token ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol RECORD;
BEGIN
    FOR pol IN
        SELECT policyname FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'fran_canal_token'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.fran_canal_token', pol.policyname);
    END LOOP;
END $$;

-- Só admin lê/escreve. Operador NUNCA enxerga os tokens.
CREATE POLICY "canal_token_admin_all"
    ON public.fran_canal_token FOR ALL
    TO authenticated
    USING (public.fran_is_admin())
    WITH CHECK (public.fran_is_admin());

-- 3. Próximo canal de disparo (rodízio ponderado por peso) -------------------
CREATE OR REPLACE FUNCTION public.fran_proximo_canal_disparo()
RETURNS TABLE (instancia TEXT, token TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id    BIGINT;
    v_inst  TEXT;
    v_token TEXT;
BEGIN
    SELECT c.id, c.instancia, t.token
      INTO v_id, v_inst, v_token
      FROM public.fran_canais c
      JOIN public.fran_canal_token t ON t.canal_id = c.id
     WHERE c.ativo
       AND c.usar_no_disparo
       AND COALESCE(c.instancia, '') <> ''
       AND COALESCE(t.token, '') <> ''
     ORDER BY (c.total_disparos::numeric / GREATEST(c.peso, 1)) ASC,
              c.ultimo_disparo_em ASC NULLS FIRST,
              c.id ASC
     FOR UPDATE OF c SKIP LOCKED
     LIMIT 1;

    IF v_id IS NULL THEN
        RETURN; -- nenhum canal de disparo configurado → disparo usa o padrão do n8n
    END IF;

    UPDATE public.fran_canais
       SET total_disparos = total_disparos + 1,
           ultimo_disparo_em = NOW()
     WHERE id = v_id;

    instancia := v_inst;
    token := v_token;
    RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.fran_proximo_canal_disparo() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fran_proximo_canal_disparo() TO service_role;
