-- ============================================================================
-- fran_config: garante política de INSERT para usuários autenticados
-- ============================================================================
-- Rode no SQL Editor do Supabase Cloud. Idempotente.
--
-- Necessário para que o painel consiga CRIAR chaves de config novas direto
-- pela UI (ex: fila_dias_semana) quando elas ainda não foram semeadas por
-- uma migration. Sem isso, salvar uma chave inexistente falha silenciosamente
-- (a tela mostra "salvo", mas nada persiste).
--
-- A política de UPDATE/SELECT já existente continua valendo; aqui só
-- acrescentamos INSERT.
-- ============================================================================

ALTER TABLE public.fran_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "config_insert_authenticated" ON public.fran_config;
CREATE POLICY "config_insert_authenticated"
    ON public.fran_config FOR INSERT
    TO authenticated WITH CHECK (true);
