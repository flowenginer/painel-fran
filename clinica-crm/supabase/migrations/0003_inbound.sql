-- ============================================================================
-- Fase 3b/3c — Envio e recebimento: mapeamento oficial + upsert de inbound
-- ============================================================================
-- Rode no SQL Editor. Idempotente. Depende de 0001 (fundação) e 0002 (inbox).
-- ============================================================================

-- 1. Guardar o conversationId do canal oficial (Zernio) por conversa ---------
ALTER TABLE public.conversas
    ADD COLUMN IF NOT EXISTS zernio_conversation_id TEXT;

-- 2. Registrar mensagem recebida (find-or-create paciente + conversa) --------
-- Chamada pelas Edge Functions de webhook (service_role). Atômica.
-- Retorna a conversa e a unidade para a Edge inserir a mensagem depois.
-- Atribuição de anúncio (origem_*) é FIRST-TOUCH: só grava ao criar o paciente.
CREATE OR REPLACE FUNCTION public.crm_registrar_inbound(
    p_canal_id          BIGINT,
    p_telefone          TEXT,
    p_conversation_id   TEXT DEFAULT NULL,
    p_origem_campanha   TEXT DEFAULT NULL,
    p_origem_criativo   TEXT DEFAULT NULL,
    p_origem_anuncio_id TEXT DEFAULT NULL
)
RETURNS TABLE (conversa_id BIGINT, unidade_id BIGINT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_uni      BIGINT;
    v_tel      TEXT;
    v_pac      BIGINT;
    v_conv     BIGINT;
BEGIN
    v_tel := regexp_replace(COALESCE(p_telefone, ''), '\D', '', 'g');
    IF v_tel = '' THEN
        RAISE EXCEPTION 'telefone vazio';
    END IF;

    SELECT c.unidade_id INTO v_uni FROM public.canais c WHERE c.id = p_canal_id;
    IF v_uni IS NULL THEN
        RAISE EXCEPTION 'canal % inexistente', p_canal_id;
    END IF;

    -- Paciente (pré-cadastro): cria se não existir nesta unidade; senão só toca.
    INSERT INTO public.pacientes (
        unidade_id, telefone, status_funil,
        origem_campanha, origem_criativo, origem_anuncio_id,
        data_primeiro_contato, data_ultimo_contato
    )
    VALUES (
        v_uni, v_tel, 'lead_novo',
        p_origem_campanha, p_origem_criativo, p_origem_anuncio_id,
        NOW(), NOW()
    )
    ON CONFLICT (unidade_id, telefone)
        DO UPDATE SET data_ultimo_contato = NOW()
    RETURNING id INTO v_pac;

    -- Conversa: cria se não existir; senão atualiza canal/conversationId.
    INSERT INTO public.conversas (
        unidade_id, paciente_id, canal_id, telefone, zernio_conversation_id
    )
    VALUES (v_uni, v_pac, p_canal_id, v_tel, p_conversation_id)
    ON CONFLICT (unidade_id, telefone) DO UPDATE
        SET canal_id               = EXCLUDED.canal_id,
            paciente_id            = COALESCE(public.conversas.paciente_id, EXCLUDED.paciente_id),
            zernio_conversation_id = COALESCE(EXCLUDED.zernio_conversation_id,
                                              public.conversas.zernio_conversation_id),
            updated_at             = NOW()
    RETURNING id INTO v_conv;

    conversa_id := v_conv;
    unidade_id  := v_uni;
    RETURN NEXT;
END;
$$;

-- Só o service_role (Edge Functions/webhooks) executa.
REVOKE ALL ON FUNCTION public.crm_registrar_inbound(BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_registrar_inbound(BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;
