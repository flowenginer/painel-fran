-- ============================================================================
-- Fase 3a — Inbox (relacional, multi-unidade): canais, conversas, mensagens
-- ============================================================================
-- Rode no SQL Editor do Supabase Cloud. Idempotente (pode rodar de novo).
-- Modelo RELACIONAL (sem LangChain/fran_memory): a clínica é 100% humana.
--   canais    → números/instâncias de WhatsApp (uazapi não-oficial | zernio oficial)
--   conversas → 1 conversa por (unidade, telefone); aponta pro paciente e canal
--   mensagens → o histórico (direcao in/out), amarradas à conversa
-- RLS por unidade (admin vê todas; atendente só a sua). Escrita das mensagens é
-- feita pelas Edge Functions (service_role) — igual ao padrão do painel-fran.
-- ============================================================================

-- 1. Canais (WhatsApp) ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.canais (
    id                BIGSERIAL PRIMARY KEY,
    unidade_id        BIGINT NOT NULL REFERENCES public.unidades(id) ON DELETE CASCADE,
    nome              TEXT NOT NULL,
    -- 'uazapi' = não-oficial (via n8n) | 'zernio' = oficial (Meta Cloud API)
    tipo              TEXT NOT NULL DEFAULT 'uazapi',
    -- uazapi: nome da instância que o n8n usa pra rotear
    instancia         TEXT NOT NULL DEFAULT '',
    numero            TEXT,
    -- zernio (oficial): accountId interno do Zernio
    zernio_account_id TEXT,
    ativo             BOOLEAN NOT NULL DEFAULT TRUE,
    conectado         BOOLEAN NOT NULL DEFAULT FALSE,
    status_em         TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT canais_tipo_chk CHECK (tipo IN ('uazapi', 'zernio'))
);
CREATE INDEX IF NOT EXISTS canais_unidade_idx ON public.canais (unidade_id, ativo);

-- 1b. Segredos do canal (admin-only; nunca expostos à atendente) ------------
CREATE TABLE IF NOT EXISTS public.canal_secrets (
    canal_id       BIGINT PRIMARY KEY REFERENCES public.canais(id) ON DELETE CASCADE,
    -- uazapi: token da instância | zernio: api key (Bearer)
    token          TEXT NOT NULL DEFAULT '',
    -- zernio: segredo do webhook (HMAC)
    webhook_secret TEXT NOT NULL DEFAULT '',
    -- uazapi: URL do webhook do n8n que fala com a uazapi
    n8n_url        TEXT NOT NULL DEFAULT '',
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Conversas --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conversas (
    id                      BIGSERIAL PRIMARY KEY,
    unidade_id              BIGINT NOT NULL REFERENCES public.unidades(id) ON DELETE CASCADE,
    paciente_id             BIGINT REFERENCES public.pacientes(id) ON DELETE SET NULL,
    canal_id                BIGINT REFERENCES public.canais(id) ON DELETE SET NULL,
    -- Telefone normalizado (só dígitos, com DDI). Chave humana da conversa.
    telefone                TEXT NOT NULL,
    responsavel_id          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    -- aberta | resolvida
    status                  TEXT NOT NULL DEFAULT 'aberta',
    -- Resumo (mantido pelo trigger) pra listar sem varrer mensagens.
    ultima_mensagem_at      TIMESTAMPTZ,
    ultima_mensagem_preview TEXT,
    ultima_direcao          TEXT,
    nao_lida                BOOLEAN NOT NULL DEFAULT FALSE,
    -- Janela de 24h do canal oficial (preenchida no inbound).
    janela_expira_at        TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT conversas_status_chk CHECK (status IN ('aberta', 'resolvida'))
);
-- Uma conversa por telefone dentro da unidade.
CREATE UNIQUE INDEX IF NOT EXISTS conversas_unidade_tel_idx
    ON public.conversas (unidade_id, telefone);
CREATE INDEX IF NOT EXISTS conversas_lista_idx
    ON public.conversas (unidade_id, ultima_mensagem_at DESC);
CREATE INDEX IF NOT EXISTS conversas_responsavel_idx
    ON public.conversas (responsavel_id);
CREATE INDEX IF NOT EXISTS conversas_paciente_idx
    ON public.conversas (paciente_id);

-- 3. Mensagens --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mensagens (
    id             BIGSERIAL PRIMARY KEY,
    conversa_id    BIGINT NOT NULL REFERENCES public.conversas(id) ON DELETE CASCADE,
    -- Denormalizado pra RLS por unidade sem join.
    unidade_id     BIGINT NOT NULL REFERENCES public.unidades(id) ON DELETE CASCADE,
    -- 'in' = recebida do lead | 'out' = enviada pela atendente/sistema
    direcao        TEXT NOT NULL,
    -- texto | imagem | audio | video | documento
    tipo           TEXT NOT NULL DEFAULT 'texto',
    conteudo       TEXT,
    media_url      TEXT,
    media_mime     TEXT,
    -- Atendente que enviou (out); NULL para recebidas/sistema.
    enviado_por    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    -- ID da mensagem no provedor (dedupe / status).
    provider_msg_id TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT mensagens_direcao_chk CHECK (direcao IN ('in', 'out')),
    CONSTRAINT mensagens_tipo_chk
        CHECK (tipo IN ('texto', 'imagem', 'audio', 'video', 'documento'))
);
CREATE INDEX IF NOT EXISTS mensagens_conversa_idx
    ON public.mensagens (conversa_id, created_at);
CREATE INDEX IF NOT EXISTS mensagens_unidade_idx
    ON public.mensagens (unidade_id);

-- 4. Trigger: ao inserir mensagem, atualiza o resumo da conversa ------------
CREATE OR REPLACE FUNCTION public.mensagem_atualiza_conversa()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    preview TEXT;
BEGIN
    preview := COALESCE(
        NULLIF(NEW.conteudo, ''),
        CASE NEW.tipo
            WHEN 'imagem'    THEN '📷 Imagem'
            WHEN 'audio'     THEN '🎤 Áudio'
            WHEN 'video'     THEN '🎬 Vídeo'
            WHEN 'documento' THEN '📄 Documento'
            ELSE ''
        END
    );

    UPDATE public.conversas c
       SET ultima_mensagem_at      = NEW.created_at,
           ultima_mensagem_preview = LEFT(preview, 140),
           ultima_direcao          = NEW.direcao,
           -- Recebida marca como não-lida; enviada zera.
           nao_lida                = (NEW.direcao = 'in'),
           -- Inbound reabre a janela de 24h (só relevante pro canal oficial).
           janela_expira_at        = CASE
                                        WHEN NEW.direcao = 'in'
                                        THEN NEW.created_at + INTERVAL '24 hours'
                                        ELSE c.janela_expira_at
                                     END,
           updated_at              = NOW()
     WHERE c.id = NEW.conversa_id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mensagens_atualiza_conversa ON public.mensagens;
CREATE TRIGGER mensagens_atualiza_conversa
    AFTER INSERT ON public.mensagens
    FOR EACH ROW EXECUTE FUNCTION public.mensagem_atualiza_conversa();

-- updated_at automático (reusa touch_updated_at da fundação)
DROP TRIGGER IF EXISTS canais_touch ON public.canais;
CREATE TRIGGER canais_touch BEFORE UPDATE ON public.canais
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS conversas_touch ON public.conversas;
CREATE TRIGGER conversas_touch BEFORE UPDATE ON public.conversas
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 5. RLS --------------------------------------------------------------------
ALTER TABLE public.canais        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canal_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversas     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mensagens     ENABLE ROW LEVEL SECURITY;

-- canais: lê quem é da unidade (ou admin); escreve só admin.
DROP POLICY IF EXISTS canais_select ON public.canais;
CREATE POLICY canais_select ON public.canais FOR SELECT TO authenticated
    USING (public.crm_is_admin() OR unidade_id = public.crm_minha_unidade());
DROP POLICY IF EXISTS canais_admin_write ON public.canais;
CREATE POLICY canais_admin_write ON public.canais FOR ALL TO authenticated
    USING (public.crm_is_admin()) WITH CHECK (public.crm_is_admin());

-- canal_secrets: só admin (a atendente NUNCA vê token/segredo).
DROP POLICY IF EXISTS canal_secrets_admin ON public.canal_secrets;
CREATE POLICY canal_secrets_admin ON public.canal_secrets FOR ALL TO authenticated
    USING (public.crm_is_admin()) WITH CHECK (public.crm_is_admin());

-- conversas: admin vê todas; atendente só a sua unidade (leitura + gestão).
-- INSERT/UPDATE permitido pra própria unidade (marcar lida, atribuir, iniciar).
DROP POLICY IF EXISTS conversas_rls ON public.conversas;
CREATE POLICY conversas_rls ON public.conversas FOR ALL TO authenticated
    USING (public.crm_is_admin() OR unidade_id = public.crm_minha_unidade())
    WITH CHECK (public.crm_is_admin() OR unidade_id = public.crm_minha_unidade());

-- mensagens: leitura por unidade. A ESCRITA é só via service_role (Edge
-- Functions) — sem policy de INSERT/UPDATE/DELETE pra authenticated.
DROP POLICY IF EXISTS mensagens_select ON public.mensagens;
CREATE POLICY mensagens_select ON public.mensagens FOR SELECT TO authenticated
    USING (public.crm_is_admin() OR unidade_id = public.crm_minha_unidade());

-- 6. Realtime (as mensagens chegam por fora, via Edge/n8n) ------------------
ALTER TABLE public.mensagens REPLICA IDENTITY FULL;
ALTER TABLE public.conversas REPLICA IDENTITY FULL;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
         WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
           AND tablename = 'mensagens'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.mensagens;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
         WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
           AND tablename = 'conversas'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.conversas;
    END IF;
END $$;

-- ============================================================================
-- TESTE (opcional): cria uma conversa e 2 mensagens na unidade "Matriz".
-- Rode no SQL Editor (service_role ignora RLS) pra ver o inbox ao vivo.
-- ----------------------------------------------------------------------------
-- WITH u AS (SELECT id FROM public.unidades ORDER BY id LIMIT 1),
--      c AS (
--        INSERT INTO public.conversas (unidade_id, telefone)
--        SELECT id, '5562999990000' FROM u
--        ON CONFLICT (unidade_id, telefone) DO UPDATE SET updated_at = NOW()
--        RETURNING id, unidade_id
--      )
-- INSERT INTO public.mensagens (conversa_id, unidade_id, direcao, conteudo)
-- SELECT c.id, c.unidade_id, 'in', 'Olá, vim pelo anúncio!' FROM c;
-- ============================================================================
