-- ============================================================================
-- Fase 7 — Múltiplos canais de conexão (WhatsApp/UAZAPI via n8n)
-- ============================================================================
-- Rode no SQL Editor do Supabase Cloud. Idempotente.
--
-- Objetivo: distribuir o volume entre vários números (anti-bloqueio) e
-- responder cada conversa pelo MESMO número que o lead falou.
--
-- Desenho (1 fluxo n8n que roteia por instância):
--   - fran_canais: registro dos números/instâncias (nome, instancia, peso...).
--   - fran_memory.canal: instância UAZAPI por onde a mensagem passou.
--   - fran_canal_conversa(tel): canal "grudado" da conversa = canal da última
--     mensagem que teve canal (fonte da verdade para responder).
--
-- A `instancia` (string) é a chave que o n8n usa para rotear. Ela vai no
-- payload do envio e é gravada em fran_memory.canal.
--
-- Requer 0004 (fran_is_admin) e 0009 (fran_memory.created_at).
-- ============================================================================

-- 1. Tabela de canais -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fran_canais (
    id         BIGSERIAL PRIMARY KEY,
    nome       TEXT NOT NULL,
    instancia  TEXT NOT NULL DEFAULT '',
    numero     TEXT,
    ativo      BOOLEAN NOT NULL DEFAULT TRUE,
    peso       INT NOT NULL DEFAULT 1,
    ordem      INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fran_canais_peso_chk'
    ) THEN
        ALTER TABLE public.fran_canais
            ADD CONSTRAINT fran_canais_peso_chk CHECK (peso >= 1);
    END IF;
END $$;

-- Seed: canal principal (o número atual). Edite a `instancia` na tela de
-- Configurações com o identificador que o n8n usa. Enquanto vazio, o n8n
-- segue usando o número padrão (comportamento atual) — rollout seguro.
INSERT INTO public.fran_canais (nome, instancia, ativo, peso, ordem)
SELECT 'Canal 1 (principal)', '', TRUE, 1, 0
WHERE NOT EXISTS (SELECT 1 FROM public.fran_canais);

-- 2. canal na fran_memory (instância por onde a mensagem passou) ------------
ALTER TABLE public.fran_memory
    ADD COLUMN IF NOT EXISTS canal TEXT;

-- 3. Canal "grudado" da conversa -------------------------------------------
-- Última mensagem (qualquer direção) que teve canal define por onde responder.
CREATE OR REPLACE FUNCTION public.fran_canal_conversa(p_tel TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT m.canal
      FROM public.fran_memory m
     WHERE regexp_replace(m.session_id, '\D', '', 'g')
           = regexp_replace(p_tel, '\D', '', 'g')
       AND m.canal IS NOT NULL
       AND m.canal <> ''
     ORDER BY m.id DESC
     LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.fran_canal_conversa(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fran_canal_conversa(TEXT)
    TO service_role, authenticated;

-- 4. RLS de fran_canais -----------------------------------------------------
-- Leitura por autenticado (o painel mostra o nome do canal); escrita só admin.
ALTER TABLE public.fran_canais ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol RECORD;
BEGIN
    FOR pol IN
        SELECT policyname FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'fran_canais'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.fran_canais', pol.policyname);
    END LOOP;
END $$;

CREATE POLICY "canais_select_auth"
    ON public.fran_canais FOR SELECT
    TO authenticated USING (true);
CREATE POLICY "canais_insert_admin"
    ON public.fran_canais FOR INSERT
    TO authenticated WITH CHECK (public.fran_is_admin());
CREATE POLICY "canais_update_admin"
    ON public.fran_canais FOR UPDATE
    TO authenticated USING (public.fran_is_admin()) WITH CHECK (public.fran_is_admin());
CREATE POLICY "canais_delete_admin"
    ON public.fran_canais FOR DELETE
    TO authenticated USING (public.fran_is_admin());
