-- ============================================================================
-- Broadcasts Zernio (disparo em massa via template oficial WhatsApp Business)
-- ============================================================================
-- Rode no SQL Editor do Supabase Cloud (o schema é mantido lá, ver
-- supabase/README.md). Idempotente — pode rodar de novo sem quebrar.
--
-- O que cria:
--   1. fran_zernio_broadcasts       → a campanha de broadcast (template + mapa
--                                      de variáveis + status + totais)
--   2. fran_zernio_broadcast_itens  → um alvo por linha (devedor + telefone),
--                                      processado em gotejamento respeitando os
--                                      limites (mesma config da fila)
--   3. Índices + RLS (authenticated)
--   4. Seeds em fran_config (liga/desliga + segredo do cron)
--
-- O ENVIO em si é feito pela Edge Function `zernio-broadcast` (fase 2),
-- agendada pelo pg_cron como o `processar-fila`.
-- ============================================================================

-- 1. Broadcast (campanha) ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fran_zernio_broadcasts (
    id                 BIGSERIAL PRIMARY KEY,
    nome               TEXT NOT NULL,
    template_name      TEXT NOT NULL,
    template_language  TEXT NOT NULL DEFAULT 'pt_BR',
    -- Mapa das variáveis do template → campo do devedor.
    -- Ex.: {"1": "primeiro_nome", "2": "instituicao"}
    variaveis          JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- rascunho | ativo | pausado | concluido | cancelado
    status             TEXT NOT NULL DEFAULT 'rascunho',
    total_alvos        INT NOT NULL DEFAULT 0,
    total_enviados     INT NOT NULL DEFAULT 0,
    total_erros        INT NOT NULL DEFAULT 0,
    criado_por         UUID REFERENCES auth.users(id),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Itens do broadcast (1 por alvo) ---------------------------------------
CREATE TABLE IF NOT EXISTS public.fran_zernio_broadcast_itens (
    id               BIGSERIAL PRIMARY KEY,
    broadcast_id     BIGINT NOT NULL REFERENCES public.fran_zernio_broadcasts(id) ON DELETE CASCADE,
    devedor_id       BIGINT NOT NULL REFERENCES public.fran_devedores(id) ON DELETE CASCADE,
    telefone         TEXT NOT NULL,
    -- na_fila | enviado | erro | cancelado
    status           TEXT NOT NULL DEFAULT 'na_fila',
    tentativas       INT NOT NULL DEFAULT 0,
    erro_detalhes    TEXT,
    zernio_message_id TEXT,
    data_processado  TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Índices ----------------------------------------------------------------
CREATE INDEX IF NOT EXISTS fran_zernio_broadcast_itens_proximos_idx
    ON public.fran_zernio_broadcast_itens (status, broadcast_id, created_at);

-- Um mesmo devedor não pode estar duas vezes ATIVO (na_fila) no mesmo broadcast.
CREATE UNIQUE INDEX IF NOT EXISTS fran_zernio_broadcast_itens_unico_ativo_idx
    ON public.fran_zernio_broadcast_itens (broadcast_id, devedor_id)
    WHERE status = 'na_fila';

-- 4. RLS --------------------------------------------------------------------
ALTER TABLE public.fran_zernio_broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fran_zernio_broadcast_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "zbroadcast_all_authenticated" ON public.fran_zernio_broadcasts;
CREATE POLICY "zbroadcast_all_authenticated"
    ON public.fran_zernio_broadcasts FOR ALL
    TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "zbroadcast_itens_all_authenticated" ON public.fran_zernio_broadcast_itens;
CREATE POLICY "zbroadcast_itens_all_authenticated"
    ON public.fran_zernio_broadcast_itens FOR ALL
    TO authenticated USING (true) WITH CHECK (true);

-- 5. Seeds de configuração --------------------------------------------------
INSERT INTO public.fran_config (chave, valor, descricao) VALUES
    ('zernio_broadcast_ativo', 'false', 'Liga/desliga o processamento automático dos broadcasts Zernio'),
    ('zernio_broadcast_cron_secret', '', 'Segredo enviado pelo pg_cron no header x-cron-secret para zernio-broadcast')
ON CONFLICT (chave) DO NOTHING;

-- 6. Agendamento pg_cron (fase 2 — quando a Edge Function existir) -----------
-- Mesmo padrão do processar-fila. Substitua os <PLACEHOLDERS>:
--
--   UPDATE public.fran_config
--      SET valor = encode(gen_random_bytes(24), 'hex')
--    WHERE chave = 'zernio_broadcast_cron_secret';
--
--   SELECT cron.schedule(
--     'processar-zernio-broadcast',
--     '*/10 * * * *',
--     $$
--     SELECT net.http_post(
--       url     := 'https://<SEU-REF>.supabase.co/functions/v1/zernio-broadcast',
--       headers := jsonb_build_object(
--         'Content-Type',  'application/json',
--         'Authorization', 'Bearer <SUA-ANON-KEY>',
--         'x-cron-secret', '<SEGREDO-ACIMA>'
--       ),
--       body    := jsonb_build_object('trigger', 'cron')
--     );
--     $$
--   );
