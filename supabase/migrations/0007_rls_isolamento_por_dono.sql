-- ============================================================================
-- Fase 5 — RLS de verdade (isolamento por dono no banco)
-- ============================================================================
-- Rode no SQL Editor do Supabase Cloud. Idempotente.
--
-- ATENÇÃO: esta é a etapa mais sensível. Ela RESTRINGE o acesso de leitura
-- pelo painel. Pontos de segurança que tornam isso seguro:
--   - Edge Functions e n8n usam service_role, que IGNORA RLS → disparos e a
--     escrita de mensagens continuam funcionando.
--   - O admin continua vendo tudo via fran_is_admin().
--
-- Reversão (se algo travar): reabilite o acesso amplo recriando políticas
-- permissivas, ex.:
--   CREATE POLICY tmp_all ON public.fran_devedores FOR ALL TO authenticated
--     USING (true) WITH CHECK (true);
--   CREATE POLICY tmp_all ON public.fran_memory FOR SELECT TO authenticated
--     USING (true);
--
-- Decisões desta fase:
--   - Operador vê/edita apenas os devedores atribuídos a ele; admin vê tudo.
--   - INSERT/DELETE de devedores: somente admin (ingestão é tarefa de gestão).
--   - Mensagens (fran_memory): operador só lê as dos leads dele (via
--     fran_conversas), admin lê tudo.
--
-- Requer migrações 0004, 0005 e 0006.
-- ============================================================================

-- 1. Helper: variantes normalizadas de um telefone (com/sem 9º dígito) ------
-- Espelha a lógica de variantesTelefone() do frontend.
CREATE OR REPLACE FUNCTION public.fran_tel_variantes(tel TEXT)
RETURNS TEXT[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    norm  TEXT := regexp_replace(COALESCE(tel, ''), '\D', '', 'g');
    ddd   TEXT;
    resto TEXT;
    res   TEXT[] := '{}';
BEGIN
    IF norm = '' THEN
        RETURN res;
    END IF;
    res := ARRAY[norm];
    IF left(norm, 2) = '55' THEN
        ddd := substring(norm FROM 3 FOR 2);
        resto := substring(norm FROM 5);
        IF length(norm) = 13 AND left(resto, 1) = '9' THEN
            res := res || ('55' || ddd || substring(resto FROM 2));
        ELSIF length(norm) = 12 THEN
            res := res || ('55' || ddd || '9' || resto);
        END IF;
    END IF;
    RETURN res;
END;
$$;

-- 2. Tabela de vínculo conversa → dono (chave: telefone normalizado) --------
CREATE TABLE IF NOT EXISTS public.fran_conversas (
    telefone_normalizado TEXT PRIMARY KEY,
    devedor_id           BIGINT REFERENCES public.fran_devedores(id) ON DELETE CASCADE,
    responsavel_id       UUID REFERENCES public.fran_usuarios(id) ON DELETE SET NULL,
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS fran_conversas_responsavel_idx
    ON public.fran_conversas (responsavel_id);

ALTER TABLE public.fran_conversas ENABLE ROW LEVEL SECURITY;

-- Só o dono e o admin leem o vínculo. Escrita apenas via funções
-- SECURITY DEFINER abaixo (que ignoram RLS) — sem policy de escrita.
DROP POLICY IF EXISTS "conversas_select_dono_ou_admin" ON public.fran_conversas;
CREATE POLICY "conversas_select_dono_ou_admin"
    ON public.fran_conversas FOR SELECT
    TO authenticated
    USING (public.fran_is_admin() OR responsavel_id = auth.uid());

-- 3. Sincroniza fran_conversas a partir de um devedor ----------------------
-- Cria/atualiza uma linha por variante de telefone do devedor, apontando
-- para o responsável atual. Chamada nas RPCs de atribuição e transferência.
CREATE OR REPLACE FUNCTION public.fran_sync_conversa(p_devedor_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    d         RECORD;
    v         TEXT;
    variantes TEXT[];
BEGIN
    SELECT id, telefone, telefone_2, telefone_3, responsavel_id
      INTO d
      FROM public.fran_devedores
     WHERE id = p_devedor_id;
    IF NOT FOUND THEN
        RETURN;
    END IF;

    variantes := public.fran_tel_variantes(d.telefone)
              || public.fran_tel_variantes(d.telefone_2)
              || public.fran_tel_variantes(d.telefone_3);

    FOREACH v IN ARRAY variantes LOOP
        IF v IS NULL OR v = '' THEN
            CONTINUE;
        END IF;
        INSERT INTO public.fran_conversas
            (telefone_normalizado, devedor_id, responsavel_id, updated_at)
        VALUES (v, d.id, d.responsavel_id, NOW())
        ON CONFLICT (telefone_normalizado) DO UPDATE
            SET devedor_id     = EXCLUDED.devedor_id,
                responsavel_id = EXCLUDED.responsavel_id,
                updated_at     = NOW();
    END LOOP;
END;
$$;

-- 4. RPCs de atribuição/transferência agora sincronizam o vínculo ----------
-- (mesma lógica das migrações 0005/0006 + PERFORM fran_sync_conversa)
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

    PERFORM public.fran_sync_conversa(p_devedor_id);

    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.fran_transferir_conversa(
    p_devedor_id  BIGINT,
    p_para_usuario UUID,
    p_motivo      TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller       UUID := auth.uid();
    v_caller_role  TEXT;
    v_caller_ativo BOOLEAN;
    v_caller_acoes JSONB;
    v_de           UUID;
    v_alvo_ativo   BOOLEAN;
    v_pode         BOOLEAN := FALSE;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Não autenticado';
    END IF;

    SELECT role, ativo, COALESCE(permissoes->'acoes', '[]'::jsonb)
      INTO v_caller_role, v_caller_ativo, v_caller_acoes
      FROM public.fran_usuarios
     WHERE id = v_caller;

    IF v_caller_role IS NULL OR NOT v_caller_ativo THEN
        RAISE EXCEPTION 'Usuário inválido ou inativo';
    END IF;

    SELECT responsavel_id INTO v_de
      FROM public.fran_devedores
     WHERE id = p_devedor_id;

    SELECT ativo INTO v_alvo_ativo
      FROM public.fran_usuarios
     WHERE id = p_para_usuario;

    IF v_alvo_ativo IS NULL THEN
        RAISE EXCEPTION 'Usuário de destino não encontrado';
    END IF;
    IF NOT v_alvo_ativo THEN
        RAISE EXCEPTION 'Usuário de destino está inativo';
    END IF;

    IF v_caller_role = 'admin' THEN
        v_pode := TRUE;
    ELSIF v_de = v_caller AND v_caller_acoes ? 'transferir_conversa' THEN
        v_pode := TRUE;
    END IF;

    IF NOT v_pode THEN
        RAISE EXCEPTION 'Sem permissão para transferir esta conversa';
    END IF;

    UPDATE public.fran_devedores
       SET responsavel_id = p_para_usuario
     WHERE id = p_devedor_id;

    PERFORM public.fran_sync_conversa(p_devedor_id);

    INSERT INTO public.fran_conversa_transferencias
        (devedor_id, de_usuario, para_usuario, por_usuario, motivo)
    VALUES (p_devedor_id, v_de, p_para_usuario, v_caller, NULLIF(TRIM(p_motivo), ''));

    RETURN p_para_usuario;
END;
$$;

-- 5. Backfill: popula fran_conversas a partir dos devedores já atribuídos ---
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT id FROM public.fran_devedores WHERE responsavel_id IS NOT NULL LOOP
        PERFORM public.fran_sync_conversa(r.id);
    END LOOP;
END $$;

-- 6. RLS de fran_devedores: dono OU admin ----------------------------------
ALTER TABLE public.fran_devedores ENABLE ROW LEVEL SECURITY;

-- Remove quaisquer políticas pré-existentes (inclui as permissivas antigas).
DO $$
DECLARE pol RECORD;
BEGIN
    FOR pol IN
        SELECT policyname FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'fran_devedores'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.fran_devedores', pol.policyname);
    END LOOP;
END $$;

CREATE POLICY "devedores_select_dono_ou_admin"
    ON public.fran_devedores FOR SELECT
    TO authenticated
    USING (responsavel_id = auth.uid() OR public.fran_is_admin());

CREATE POLICY "devedores_update_dono_ou_admin"
    ON public.fran_devedores FOR UPDATE
    TO authenticated
    USING (responsavel_id = auth.uid() OR public.fran_is_admin())
    WITH CHECK (responsavel_id = auth.uid() OR public.fran_is_admin());

CREATE POLICY "devedores_insert_admin"
    ON public.fran_devedores FOR INSERT
    TO authenticated
    WITH CHECK (public.fran_is_admin());

CREATE POLICY "devedores_delete_admin"
    ON public.fran_devedores FOR DELETE
    TO authenticated
    USING (public.fran_is_admin());

-- 7. RLS de fran_memory: dono (via fran_conversas) OU admin -----------------
ALTER TABLE public.fran_memory ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol RECORD;
BEGIN
    FOR pol IN
        SELECT policyname FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'fran_memory'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.fran_memory', pol.policyname);
    END LOOP;
END $$;

-- Índice de expressão para casar o session_id normalizado rapidamente.
CREATE INDEX IF NOT EXISTS fran_memory_session_norm_idx
    ON public.fran_memory ((regexp_replace(session_id, '\D', '', 'g')));

-- Apenas SELECT para o painel (n8n escreve via service_role, ignora RLS).
CREATE POLICY "memory_select_dono_ou_admin"
    ON public.fran_memory FOR SELECT
    TO authenticated
    USING (
        public.fran_is_admin()
        OR EXISTS (
            SELECT 1 FROM public.fran_conversas c
             WHERE c.responsavel_id = auth.uid()
               AND c.telefone_normalizado = regexp_replace(fran_memory.session_id, '\D', '', 'g')
        )
    );
