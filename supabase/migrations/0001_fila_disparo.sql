-- ============================================================================
-- Fila de distribuição (drip / disparo automático por hora)
-- ============================================================================
-- Rode este script no SQL Editor do Supabase Cloud (o schema do projeto é
-- mantido lá, conforme supabase/README.md). É idempotente — pode rodar de
-- novo sem quebrar.
--
-- O que cria:
--   1. Tabela public.fran_fila_disparo (a fila)
--   2. Índices (inclui índice parcial que impede o mesmo devedor duplicado
--      na fila ativa)
--   3. RLS para usuários autenticados
--   4. Seeds em fran_config (fila_ativa, fila_disparos_por_hora, ...)
--   5. Agendamento pg_cron chamando a Edge Function processar-fila
-- ============================================================================

-- 1. Tabela ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fran_fila_disparo (
    id              BIGSERIAL PRIMARY KEY,
    devedor_id      BIGINT NOT NULL REFERENCES public.fran_devedores(id) ON DELETE CASCADE,
    -- na_fila | enviado | erro | cancelado
    status          TEXT NOT NULL DEFAULT 'na_fila',
    -- Ordem de processamento: menor = primeiro. Empate desempata por created_at.
    prioridade      INT NOT NULL DEFAULT 0,
    campanha        TEXT,
    tentativas      INT NOT NULL DEFAULT 0,
    erro_detalhes   TEXT,
    enfileirado_por UUID REFERENCES auth.users(id),
    data_processado TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Índices ---------------------------------------------------------------
-- Ordem de leitura da fila (status + prioridade + chegada).
CREATE INDEX IF NOT EXISTS fran_fila_disparo_proximos_idx
    ON public.fran_fila_disparo (status, prioridade, created_at);

-- Um mesmo devedor não pode ter duas entradas ATIVAS (na_fila) ao mesmo
-- tempo. Histórico (enviado/erro/cancelado) pode repetir.
CREATE UNIQUE INDEX IF NOT EXISTS fran_fila_disparo_devedor_ativo_idx
    ON public.fran_fila_disparo (devedor_id)
    WHERE status = 'na_fila';

-- 3. RLS -------------------------------------------------------------------
ALTER TABLE public.fran_fila_disparo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fila_select_authenticated" ON public.fran_fila_disparo;
CREATE POLICY "fila_select_authenticated"
    ON public.fran_fila_disparo FOR SELECT
    TO authenticated USING (true);

DROP POLICY IF EXISTS "fila_insert_authenticated" ON public.fran_fila_disparo;
CREATE POLICY "fila_insert_authenticated"
    ON public.fran_fila_disparo FOR INSERT
    TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "fila_update_authenticated" ON public.fran_fila_disparo;
CREATE POLICY "fila_update_authenticated"
    ON public.fran_fila_disparo FOR UPDATE
    TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "fila_delete_authenticated" ON public.fran_fila_disparo;
CREATE POLICY "fila_delete_authenticated"
    ON public.fran_fila_disparo FOR DELETE
    TO authenticated USING (true);

-- 4. Seeds de configuração -------------------------------------------------
-- fila_ativa: liga/desliga o processamento automático (começa pausada).
-- fila_disparos_por_hora: teto de disparos por hora.
-- fila_cron_secret: segredo que o pg_cron envia no header x-cron-secret.
--   TROQUE pelo valor gerado abaixo antes de agendar o cron.
INSERT INTO public.fran_config (chave, valor, descricao) VALUES
    ('fila_ativa', 'false', 'Liga/desliga o processamento automático da fila de disparo'),
    ('fila_disparos_por_hora', '10', 'Teto de disparos por hora na fila (drip)'),
    ('fila_cron_secret', '', 'Segredo enviado pelo pg_cron no header x-cron-secret')
ON CONFLICT (chave) DO NOTHING;

-- 5. Agendamento pg_cron ---------------------------------------------------
-- Pré-requisitos (rodar uma vez, exigem permissão de owner do projeto):
--   CREATE EXTENSION IF NOT EXISTS pg_cron;
--   CREATE EXTENSION IF NOT EXISTS pg_net;
--
-- PASSO A PASSO (faça manualmente, substituindo os <PLACEHOLDERS>):
--
-- 5.1. Gere um segredo e grave em fran_config:
--      UPDATE public.fran_config
--         SET valor = encode(gen_random_bytes(24), 'hex')
--       WHERE chave = 'fila_cron_secret';
--      -- veja o valor: SELECT valor FROM fran_config WHERE chave='fila_cron_secret';
--
-- 5.2. Agende o job (a cada 10 min). Use o MESMO segredo do passo 5.1 e a
--      URL do seu projeto. O cabeçalho Authorization usa a anon key apenas
--      para passar pelo gateway; a autorização real é o x-cron-secret.
--
--      SELECT cron.schedule(
--        'processar-fila-disparo',
--        '*/10 * * * *',
--        $$
--        SELECT net.http_post(
--          url     := 'https://<SEU-REF>.supabase.co/functions/v1/processar-fila',
--          headers := jsonb_build_object(
--            'Content-Type',  'application/json',
--            'Authorization', 'Bearer <SUA-ANON-KEY>',
--            'x-cron-secret', '<SEGREDO-DO-PASSO-5.1>'
--          ),
--          body    := jsonb_build_object('trigger', 'cron')
--        );
--        $$
--      );
--
-- Para remover/alterar depois:
--   SELECT cron.unschedule('processar-fila-disparo');
-- Para inspecionar execuções:
--   SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
