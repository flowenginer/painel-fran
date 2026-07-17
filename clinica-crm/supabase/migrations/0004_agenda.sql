-- ============================================================================
-- Fase 5 — Agenda: agendamentos + categorias de cor (mapeadas ao Google)
-- ============================================================================
-- Rode no SQL Editor. Idempotente. Depende de 0001 (unidades/pacientes) e 0002.
-- As cores são os 11 colorId fixos do Google Calendar; a recepção escolhe uma
-- categoria (ex.: Tráfego=roxo, Clínica=azul, Cobrança=vermelho) e o
-- agendamento herda a cor. `google_event_id` guarda o vínculo pro sync.
-- ============================================================================

-- 1. Categorias de cor (configuráveis pela recepção) ------------------------
CREATE TABLE IF NOT EXISTS public.agenda_categorias (
    id              BIGSERIAL PRIMARY KEY,
    unidade_id      BIGINT NOT NULL REFERENCES public.unidades(id) ON DELETE CASCADE,
    nome            TEXT NOT NULL,
    -- 1..11 = colorId do Google Calendar
    google_color_id INT NOT NULL DEFAULT 7,
    ativo           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT agenda_cat_color_chk CHECK (google_color_id BETWEEN 1 AND 11)
);
CREATE INDEX IF NOT EXISTS agenda_categorias_unidade_idx
    ON public.agenda_categorias (unidade_id, ativo);

-- 2. Agendamentos -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agendamentos (
    id              BIGSERIAL PRIMARY KEY,
    unidade_id      BIGINT NOT NULL REFERENCES public.unidades(id) ON DELETE CASCADE,
    paciente_id     BIGINT REFERENCES public.pacientes(id) ON DELETE SET NULL,
    categoria_id    BIGINT REFERENCES public.agenda_categorias(id) ON DELETE SET NULL,
    titulo          TEXT NOT NULL,
    descricao       TEXT,
    inicio          TIMESTAMPTZ NOT NULL,
    fim             TIMESTAMPTZ NOT NULL,
    -- agendado | confirmado | compareceu | faltou | cancelado
    status          TEXT NOT NULL DEFAULT 'agendado',
    responsavel_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    criado_por      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    -- Sync com o Google Calendar (via n8n).
    google_event_id TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT agendamentos_status_chk
        CHECK (status IN ('agendado','confirmado','compareceu','faltou','cancelado'))
);
CREATE INDEX IF NOT EXISTS agendamentos_unidade_inicio_idx
    ON public.agendamentos (unidade_id, inicio);
CREATE INDEX IF NOT EXISTS agendamentos_paciente_idx
    ON public.agendamentos (paciente_id);
CREATE INDEX IF NOT EXISTS agendamentos_google_idx
    ON public.agendamentos (google_event_id);

-- updated_at automático (reusa touch_updated_at da fundação)
DROP TRIGGER IF EXISTS agendamentos_touch ON public.agendamentos;
CREATE TRIGGER agendamentos_touch BEFORE UPDATE ON public.agendamentos
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3. RLS --------------------------------------------------------------------
ALTER TABLE public.agenda_categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agendamentos      ENABLE ROW LEVEL SECURITY;

-- Categorias: lê/gerencia quem é da unidade (recepção escolhe as cores).
DROP POLICY IF EXISTS agenda_cat_rls ON public.agenda_categorias;
CREATE POLICY agenda_cat_rls ON public.agenda_categorias FOR ALL TO authenticated
    USING (public.crm_is_admin() OR unidade_id = public.crm_minha_unidade())
    WITH CHECK (public.crm_is_admin() OR unidade_id = public.crm_minha_unidade());

-- Agendamentos: admin vê todas; atendente só a sua unidade.
DROP POLICY IF EXISTS agendamentos_rls ON public.agendamentos;
CREATE POLICY agendamentos_rls ON public.agendamentos FOR ALL TO authenticated
    USING (public.crm_is_admin() OR unidade_id = public.crm_minha_unidade())
    WITH CHECK (public.crm_is_admin() OR unidade_id = public.crm_minha_unidade());

-- 4. Realtime ---------------------------------------------------------------
ALTER TABLE public.agendamentos REPLICA IDENTITY FULL;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
         WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
           AND tablename = 'agendamentos'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.agendamentos;
    END IF;
END $$;

-- 5. Seed: categorias iniciais por unidade (Tráfego/Clínica/Cobrança) --------
-- google_color_id: 3 = roxo (Grape), 7 = azul (Peacock), 11 = vermelho (Tomato)
INSERT INTO public.agenda_categorias (unidade_id, nome, google_color_id)
SELECT u.id, v.nome, v.cor
FROM public.unidades u
CROSS JOIN (VALUES ('Tráfego', 3), ('Clínica', 7), ('Cobrança', 11)) AS v(nome, cor)
WHERE NOT EXISTS (
    SELECT 1 FROM public.agenda_categorias a WHERE a.unidade_id = u.id
);
