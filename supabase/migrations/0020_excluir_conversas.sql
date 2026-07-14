-- ============================================================================
-- Exclusão de conversas (histórico de mensagens) — admin-only
-- ============================================================================
-- Rode no SQL Editor do Supabase Cloud. Idempotente.
--
-- "Excluir conversa" = apagar o HISTÓRICO de mensagens (fran_memory) de um ou
-- mais telefones. NÃO remove o cadastro do devedor (para isso há a remoção de
-- devedor). Conversas de números sem cadastro somem da lista; as de devedores
-- ficam "sem mensagens".
--
-- A função casa por telefone NORMALIZADO (só dígitos), porque o session_id da
-- fran_memory vem em formatos variados (com/sem máscara). Mesmo critério do
-- fran_canal_conversa.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fran_excluir_conversas(p_tels TEXT[])
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    -- Só admin ativo pode excluir.
    IF NOT EXISTS (
        SELECT 1 FROM public.fran_usuarios
         WHERE id = auth.uid() AND role = 'admin' AND ativo = TRUE
    ) THEN
        RAISE EXCEPTION 'Acesso restrito a administradores';
    END IF;

    IF p_tels IS NULL OR array_length(p_tels, 1) IS NULL THEN
        RETURN 0;
    END IF;

    WITH alvo AS (
        SELECT DISTINCT regexp_replace(t, '\D', '', 'g') AS tel
          FROM unnest(p_tels) AS t
         WHERE regexp_replace(t, '\D', '', 'g') <> ''
    )
    DELETE FROM public.fran_memory m
     USING alvo
     WHERE regexp_replace(m.session_id, '\D', '', 'g') = alvo.tel;

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.fran_excluir_conversas(TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fran_excluir_conversas(TEXT[]) TO authenticated;
