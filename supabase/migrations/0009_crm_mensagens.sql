-- ============================================================================
-- Fase A (CRM chat) — created_at e autor das mensagens
-- ============================================================================
-- Rode no SQL Editor do Supabase Cloud. Idempotente.
--
-- Acrescenta à fran_memory:
--   - created_at: data/hora da mensagem. Nullable de propósito (as linhas
--     antigas não têm carimbo confiável); todo INSERT novo — do n8n ou do
--     painel — preenche sozinho via DEFAULT now(). "Daqui pra frente".
--   - enviado_por: qual operadora enviou a mensagem pelo painel. NULL para
--     mensagens da IA/sistema e para mensagens recebidas do lead.
--
-- Não altera RLS: o painel NÃO insere direto em fran_memory. Quem grava a
-- mensagem enviada é a Edge Function enviar-mensagem (service_role).
--
-- Requer migrações 0004..0008.
-- ============================================================================

ALTER TABLE public.fran_memory
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.fran_memory
    ADD COLUMN IF NOT EXISTS enviado_por UUID
        REFERENCES public.fran_usuarios(id) ON DELETE SET NULL;

-- Ordenação cronológica da thread (id continua como desempate).
CREATE INDEX IF NOT EXISTS fran_memory_created_at_idx
    ON public.fran_memory (created_at);
