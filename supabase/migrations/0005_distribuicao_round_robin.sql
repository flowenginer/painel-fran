-- ============================================================================
-- Fase 3 — Distribuição round-robin de leads
-- ============================================================================
-- Rode no SQL Editor do Supabase Cloud. Idempotente.
--
-- O que faz:
--   1. Adiciona fran_devedores.responsavel_id (o operador dono do lead)
--   2. Tira os admins do rodízio por padrão (recebe_distribuicao = false)
--   3. Cria fran_atribuir_responsavel(devedor_id): escolhe o próximo operador
--      de forma ATÔMICA (round-robin justo por ultima_atribuicao_em) e grava
--      o responsável no devedor, devolvendo o id do operador (ou NULL se não
--      houver operador elegível).
--
-- Requer a migração 0004 (tabela fran_usuarios).
-- ============================================================================

-- 1. Coluna do dono do lead -------------------------------------------------
ALTER TABLE public.fran_devedores
    ADD COLUMN IF NOT EXISTS responsavel_id UUID
        REFERENCES public.fran_usuarios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS fran_devedores_responsavel_idx
    ON public.fran_devedores (responsavel_id);

-- 2. Admins fora do rodízio por padrão -------------------------------------
-- A regra de distribuição usa apenas ativo + recebe_distribuicao (qualquer
-- papel). Para honrar "admin não recebe por padrão", desliga a flag dos
-- admins existentes. Se quiser que um admin específico receba, marque
-- "Recebe leads na distribuição" no perfil dele.
UPDATE public.fran_usuarios
   SET recebe_distribuicao = FALSE
 WHERE role = 'admin' AND recebe_distribuicao = TRUE;

-- 3. Atribuição atômica (round-robin) --------------------------------------
-- Escolhe o operador elegível menos recentemente atribuído (NULLS FIRST =
-- quem nunca recebeu vai primeiro), bloqueando a linha com SKIP LOCKED para
-- ser seguro sob concorrência, atualiza o carimbo de rodízio e grava o dono
-- no devedor. Retorna o operador escolhido ou NULL.
CREATE OR REPLACE FUNCTION public.fran_atribuir_responsavel(p_devedor_id BIGINT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id UUID;
BEGIN
    SELECT id INTO v_id
      FROM public.fran_usuarios
     WHERE ativo AND recebe_distribuicao
     ORDER BY ultima_atribuicao_em ASC NULLS FIRST, created_at ASC
     FOR UPDATE SKIP LOCKED
     LIMIT 1;

    IF v_id IS NULL THEN
        RETURN NULL;
    END IF;

    UPDATE public.fran_usuarios
       SET ultima_atribuicao_em = NOW()
     WHERE id = v_id;

    UPDATE public.fran_devedores
       SET responsavel_id = v_id
     WHERE id = p_devedor_id;

    RETURN v_id;
END;
$$;

-- Só o backend (service_role, via Edge Functions) pode chamar. Revoga o
-- EXECUTE padrão de PUBLIC para que anon/authenticated não reatribuam leads.
REVOKE ALL ON FUNCTION public.fran_atribuir_responsavel(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fran_atribuir_responsavel(BIGINT) TO service_role;
