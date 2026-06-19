-- ============================================================================
-- Fase 2.1 — Disparo só por canais CONECTADOS no WhatsApp
-- ============================================================================
-- Rode no SQL Editor do Supabase Cloud. Idempotente. Requer 0014.
--
-- O que faz:
--   1. fran_canais.conectado / status_em: cache do status de conexão (atualizado
--      pelas Edge Functions de disparo no momento do disparo).
--   2. fran_proximo_canal_disparo(p_conectadas): rodízio passa a aceitar uma
--      lista de instâncias conectadas; só elas entram. Sem lista (NULL) = não
--      filtra por conexão (compatível com o comportamento anterior).
-- ============================================================================

ALTER TABLE public.fran_canais
    ADD COLUMN IF NOT EXISTS conectado BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.fran_canais
    ADD COLUMN IF NOT EXISTS status_em TIMESTAMPTZ;

-- Recria o picker aceitando a lista de instâncias conectadas.
DROP FUNCTION IF EXISTS public.fran_proximo_canal_disparo();

CREATE OR REPLACE FUNCTION public.fran_proximo_canal_disparo(
    p_conectadas TEXT[] DEFAULT NULL
)
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
       AND (p_conectadas IS NULL OR c.instancia = ANY(p_conectadas))
     ORDER BY (c.total_disparos::numeric / GREATEST(c.peso, 1)) ASC,
              c.ultimo_disparo_em ASC NULLS FIRST,
              c.id ASC
     FOR UPDATE OF c SKIP LOCKED
     LIMIT 1;

    IF v_id IS NULL THEN
        RETURN;
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

REVOKE ALL ON FUNCTION public.fran_proximo_canal_disparo(TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fran_proximo_canal_disparo(TEXT[]) TO service_role;
