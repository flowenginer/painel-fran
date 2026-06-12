-- ============================================================================
-- Fase 6 — Configuração da distribuição (método + pesos)
-- ============================================================================
-- Rode no SQL Editor do Supabase Cloud. Idempotente.
--
-- O que faz:
--   1. fran_usuarios.peso (peso na distribuição ponderada) e
--      fran_usuarios.total_atribuidos (contador p/ rodízio ponderado justo)
--   2. fran_config.distribuicao_metodo: 'round_robin' | 'ponderado'
--   3. fran_atribuir_responsavel passa a respeitar o método escolhido
--   4. RPCs admin-only para a tela de Configurações:
--      fran_listar_distribuicao() e fran_set_distribuicao()
--
-- Requer migrações 0004..0007.
-- ============================================================================

-- 1. Colunas de distribuição ------------------------------------------------
ALTER TABLE public.fran_usuarios
    ADD COLUMN IF NOT EXISTS peso INT NOT NULL DEFAULT 1;

ALTER TABLE public.fran_usuarios
    ADD COLUMN IF NOT EXISTS total_atribuidos BIGINT NOT NULL DEFAULT 0;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fran_usuarios_peso_chk'
    ) THEN
        ALTER TABLE public.fran_usuarios
            ADD CONSTRAINT fran_usuarios_peso_chk CHECK (peso >= 1);
    END IF;
END $$;

-- 2. Método de distribuição (config) ---------------------------------------
INSERT INTO public.fran_config (chave, valor, descricao) VALUES
    ('distribuicao_metodo', 'round_robin',
     'Método de distribuição de leads: round_robin | ponderado')
ON CONFLICT (chave) DO NOTHING;

-- 3. Atribuição respeitando o método ---------------------------------------
-- round_robin: reveza por ordem (quem recebeu há mais tempo).
-- ponderado:   minimiza total_atribuidos/peso (proporcional ao peso).
CREATE OR REPLACE FUNCTION public.fran_atribuir_responsavel(p_devedor_id BIGINT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id     UUID;
    v_metodo TEXT;
BEGIN
    SELECT valor INTO v_metodo
      FROM public.fran_config
     WHERE chave = 'distribuicao_metodo';
    v_metodo := COALESCE(v_metodo, 'round_robin');

    IF v_metodo = 'ponderado' THEN
        SELECT id INTO v_id
          FROM public.fran_usuarios
         WHERE ativo AND recebe_distribuicao
         ORDER BY (total_atribuidos::numeric / GREATEST(peso, 1)) ASC,
                  ultima_atribuicao_em ASC NULLS FIRST,
                  created_at ASC
         FOR UPDATE SKIP LOCKED
         LIMIT 1;
    ELSE
        SELECT id INTO v_id
          FROM public.fran_usuarios
         WHERE ativo AND recebe_distribuicao
         ORDER BY ultima_atribuicao_em ASC NULLS FIRST,
                  created_at ASC
         FOR UPDATE SKIP LOCKED
         LIMIT 1;
    END IF;

    IF v_id IS NULL THEN
        RETURN NULL;
    END IF;

    UPDATE public.fran_usuarios
       SET ultima_atribuicao_em = NOW(),
           total_atribuidos = total_atribuidos + 1
     WHERE id = v_id;

    UPDATE public.fran_devedores
       SET responsavel_id = v_id
     WHERE id = p_devedor_id;

    PERFORM public.fran_sync_conversa(p_devedor_id);

    RETURN v_id;
END;
$$;

-- 4. RPCs admin-only para a tela de Configurações --------------------------
CREATE OR REPLACE FUNCTION public.fran_listar_distribuicao()
RETURNS TABLE (
    id UUID,
    nome TEXT,
    email TEXT,
    role TEXT,
    ativo BOOLEAN,
    recebe_distribuicao BOOLEAN,
    peso INT,
    total_atribuidos BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.fran_is_admin() THEN
        RAISE EXCEPTION 'Acesso restrito a administradores';
    END IF;
    RETURN QUERY
        SELECT u.id, u.nome, u.email, u.role, u.ativo,
               u.recebe_distribuicao, u.peso, u.total_atribuidos
          FROM public.fran_usuarios u
         ORDER BY u.nome NULLS LAST, u.email;
END;
$$;

REVOKE ALL ON FUNCTION public.fran_listar_distribuicao() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fran_listar_distribuicao() TO authenticated;

CREATE OR REPLACE FUNCTION public.fran_set_distribuicao(
    p_user_id UUID,
    p_recebe  BOOLEAN,
    p_peso    INT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.fran_is_admin() THEN
        RAISE EXCEPTION 'Acesso restrito a administradores';
    END IF;
    UPDATE public.fran_usuarios
       SET recebe_distribuicao = COALESCE(p_recebe, recebe_distribuicao),
           peso = GREATEST(COALESCE(p_peso, peso), 1),
           updated_at = NOW()
     WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fran_set_distribuicao(UUID, BOOLEAN, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fran_set_distribuicao(UUID, BOOLEAN, INT) TO authenticated;
