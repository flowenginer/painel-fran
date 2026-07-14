-- ============================================================================
-- Broadcasts Zernio — guarda o corpo do template na campanha
-- ============================================================================
-- Para o painel mostrar em Conversas o TEXTO REAL que foi enviado (com as
-- variáveis já preenchidas), e não só um rótulo. O corpo é capturado no momento
-- da criação da campanha (o front já tem o texto do template selecionado).
--
-- Rode no SQL Editor do Supabase Cloud. Idempotente.
-- ============================================================================

ALTER TABLE public.fran_zernio_broadcasts
    ADD COLUMN IF NOT EXISTS template_body TEXT;
