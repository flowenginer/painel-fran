-- ============================================================================
-- Fase 7 — Lembretes automáticos (retorno 6/6 meses, Clube do Sorriso 4/4)
-- ============================================================================
-- Rode no SQL Editor. Idempotente. Depende de 0001..0005.
-- Como funciona: quando um agendamento é marcado como "compareceu", o gatilho
-- agenda os lembretes futuros (data = fim + N meses) para cada regra ativa da
-- unidade. Um cron diário chama a Edge `processar-lembretes`, que envia os que
-- venceram e marca como enviado.
-- ============================================================================

-- 1. Regras de lembrete (configuráveis por unidade) -------------------------
CREATE TABLE IF NOT EXISTS public.lembretes_config (
    id         BIGSERIAL PRIMARY KEY,
    unidade_id BIGINT NOT NULL REFERENCES public.unidades(id) ON DELETE CASCADE,
    nome       TEXT NOT NULL,
    meses      INT NOT NULL,
    -- Canal por onde enviar (recomendado: não-oficial/uazapi, sem janela 24h).
    canal_id   BIGINT REFERENCES public.canais(id) ON DELETE SET NULL,
    -- Texto; use {nome} como placeholder do primeiro nome do paciente.
    mensagem   TEXT NOT NULL DEFAULT 'Olá {nome}! Passando para lembrar da sua consulta de acompanhamento. Vamos agendar? 😊',
    ativo      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT lembretes_config_meses_chk CHECK (meses BETWEEN 1 AND 36)
);
CREATE INDEX IF NOT EXISTS lembretes_config_unidade_idx
    ON public.lembretes_config (unidade_id, ativo);

-- 2. Fila/log de lembretes --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lembretes (
    id            BIGSERIAL PRIMARY KEY,
    unidade_id    BIGINT NOT NULL REFERENCES public.unidades(id) ON DELETE CASCADE,
    paciente_id   BIGINT NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,
    config_id     BIGINT REFERENCES public.lembretes_config(id) ON DELETE SET NULL,
    telefone      TEXT NOT NULL,
    agendado_para DATE NOT NULL,
    -- pendente | enviado | erro | cancelado
    status        TEXT NOT NULL DEFAULT 'pendente',
    enviado_em    TIMESTAMPTZ,
    erro          TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT lembretes_status_chk
        CHECK (status IN ('pendente','enviado','erro','cancelado'))
);
CREATE INDEX IF NOT EXISTS lembretes_due_idx
    ON public.lembretes (status, agendado_para);
CREATE INDEX IF NOT EXISTS lembretes_unidade_idx
    ON public.lembretes (unidade_id, agendado_para DESC);
-- Evita duplicar a mesma regra/data pro mesmo paciente.
CREATE UNIQUE INDEX IF NOT EXISTS lembretes_unico_idx
    ON public.lembretes (paciente_id, config_id, agendado_para);

DROP TRIGGER IF EXISTS lembretes_config_touch ON public.lembretes_config;
CREATE TRIGGER lembretes_config_touch BEFORE UPDATE ON public.lembretes_config
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3. Gatilho: ao marcar "compareceu", agenda os lembretes futuros -----------
CREATE OR REPLACE FUNCTION public.agendamento_gera_lembretes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.status = 'compareceu'
       AND NEW.status IS DISTINCT FROM OLD.status
       AND NEW.paciente_id IS NOT NULL THEN
        INSERT INTO public.lembretes (unidade_id, paciente_id, config_id, telefone, agendado_para)
        SELECT NEW.unidade_id, NEW.paciente_id, cfg.id, p.telefone,
               (NEW.fim::date + (cfg.meses || ' months')::interval)::date
          FROM public.lembretes_config cfg
          JOIN public.pacientes p ON p.id = NEW.paciente_id
         WHERE cfg.unidade_id = NEW.unidade_id AND cfg.ativo
        ON CONFLICT (paciente_id, config_id, agendado_para) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agendamentos_gera_lembretes ON public.agendamentos;
CREATE TRIGGER agendamentos_gera_lembretes
    AFTER UPDATE ON public.agendamentos
    FOR EACH ROW EXECUTE FUNCTION public.agendamento_gera_lembretes();

-- 4. RLS --------------------------------------------------------------------
ALTER TABLE public.lembretes_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lembretes        ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lembretes_config_rls ON public.lembretes_config;
CREATE POLICY lembretes_config_rls ON public.lembretes_config FOR ALL TO authenticated
    USING (public.crm_is_admin() OR unidade_id = public.crm_minha_unidade())
    WITH CHECK (public.crm_is_admin() OR unidade_id = public.crm_minha_unidade());

-- lembretes: leitura por unidade; escrita é do gatilho (definer) e do cron (service_role).
DROP POLICY IF EXISTS lembretes_select ON public.lembretes;
CREATE POLICY lembretes_select ON public.lembretes FOR SELECT TO authenticated
    USING (public.crm_is_admin() OR unidade_id = public.crm_minha_unidade());

-- 5. Seed: regras iniciais por unidade --------------------------------------
INSERT INTO public.lembretes_config (unidade_id, nome, meses, mensagem)
SELECT u.id, v.nome, v.meses, v.msg
FROM public.unidades u
CROSS JOIN (VALUES
    ('Retorno (6 meses)', 6,
     'Olá {nome}! Já faz 6 meses da sua última consulta. Que tal agendar sua revisão? 🦷😊'),
    ('Clube do Sorriso (4 meses)', 4,
     'Oi {nome}! Chegou a hora da sua manutenção do Clube do Sorriso. Vamos marcar? ✨')
) AS v(nome, meses, msg)
WHERE NOT EXISTS (
    SELECT 1 FROM public.lembretes_config c WHERE c.unidade_id = u.id
);

-- ============================================================================
-- CRON (rodar UMA vez, ajustando <PROJETO> e <SECRET>). Requer pg_cron+pg_net.
-- Configure o mesmo <SECRET> como env LEMBRETES_CRON_SECRET na Edge Function.
-- ----------------------------------------------------------------------------
-- SELECT cron.schedule(
--   'processar-lembretes', '0 12 * * *',   -- todo dia 12:00 UTC (~09:00 BRT)
--   $$ SELECT net.http_post(
--        url := 'https://<PROJETO>.functions.supabase.co/processar-lembretes',
--        headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','<SECRET>'),
--        body := '{}'::jsonb
--      ); $$
-- );
-- ============================================================================
