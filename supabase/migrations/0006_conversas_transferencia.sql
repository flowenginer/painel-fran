-- ============================================================================
-- Fase 4 — Conversas por dono + transferência
-- ============================================================================
-- Rode no SQL Editor do Supabase Cloud. Idempotente.
--
-- O que cria:
--   1. fran_conversa_transferencias (auditoria de transferências)
--   2. fran_listar_operadores(): lista enxuta de usuários ativos (para o
--      seletor de destino da transferência e para resolver nomes na UI)
--   3. fran_transferir_conversa(devedor_id, para_usuario, motivo): muda o
--      responsável do lead, com checagem de permissão no banco, e registra
--      a auditoria.
--
-- Requer as migrações 0004 (fran_usuarios) e 0005 (responsavel_id).
-- ============================================================================

-- 1. Auditoria de transferências -------------------------------------------
CREATE TABLE IF NOT EXISTS public.fran_conversa_transferencias (
    id            BIGSERIAL PRIMARY KEY,
    devedor_id    BIGINT REFERENCES public.fran_devedores(id) ON DELETE CASCADE,
    de_usuario    UUID REFERENCES public.fran_usuarios(id) ON DELETE SET NULL,
    para_usuario  UUID REFERENCES public.fran_usuarios(id) ON DELETE SET NULL,
    por_usuario   UUID REFERENCES public.fran_usuarios(id) ON DELETE SET NULL,
    motivo        TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS fran_conversa_transf_devedor_idx
    ON public.fran_conversa_transferencias (devedor_id, created_at DESC);

ALTER TABLE public.fran_conversa_transferencias ENABLE ROW LEVEL SECURITY;

-- Admin vê tudo; operador vê transferências em que esteve envolvido.
-- INSERT não tem policy: só a função SECURITY DEFINER abaixo grava (ela roda
-- como dono e ignora RLS).
DROP POLICY IF EXISTS "transf_select_admin_ou_envolvido"
    ON public.fran_conversa_transferencias;
CREATE POLICY "transf_select_admin_ou_envolvido"
    ON public.fran_conversa_transferencias FOR SELECT
    TO authenticated
    USING (
        public.fran_is_admin()
        OR de_usuario = auth.uid()
        OR para_usuario = auth.uid()
        OR por_usuario = auth.uid()
    );

-- 2. Lista enxuta de usuários ativos ---------------------------------------
-- Operadores não podem ler fran_usuarios (RLS), mas precisam dos nomes para
-- o seletor de transferência. Esta função SECURITY DEFINER expõe só o
-- necessário, para qualquer usuário autenticado.
CREATE OR REPLACE FUNCTION public.fran_listar_operadores()
RETURNS TABLE (id UUID, nome TEXT, email TEXT, role TEXT, ativo BOOLEAN)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT id, nome, email, role, ativo
      FROM public.fran_usuarios
     WHERE ativo
     ORDER BY nome NULLS LAST, email;
$$;

REVOKE ALL ON FUNCTION public.fran_listar_operadores() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fran_listar_operadores() TO authenticated;

-- 3. Transferência de conversa ---------------------------------------------
-- Regras (avaliadas no banco):
--   - admin pode transferir qualquer conversa;
--   - operador só transfere conversa que é dele (responsavel atual) E se tiver
--     a permissão "transferir_conversa";
--   - o destino precisa existir e estar ativo.
-- Grava a auditoria e devolve o novo responsável. Levanta exceção (que o
-- cliente recebe como erro) quando a regra não é satisfeita.
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

    INSERT INTO public.fran_conversa_transferencias
        (devedor_id, de_usuario, para_usuario, por_usuario, motivo)
    VALUES (p_devedor_id, v_de, p_para_usuario, v_caller, NULLIF(TRIM(p_motivo), ''));

    RETURN p_para_usuario;
END;
$$;

REVOKE ALL ON FUNCTION public.fran_transferir_conversa(BIGINT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fran_transferir_conversa(BIGINT, UUID, TEXT) TO authenticated;
