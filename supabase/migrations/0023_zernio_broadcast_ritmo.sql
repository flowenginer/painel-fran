-- ============================================================================
-- Broadcasts Zernio — ritmo por campanha
-- ============================================================================
-- Cada campanha passa a ter seu próprio ritmo de envio (mensagens/hora),
-- configurado na criação. A Edge Function `zernio-broadcast` respeita esse
-- valor por campanha (além de um teto de segurança diário global).
--
-- Rode no SQL Editor do Supabase Cloud. Idempotente.
-- ============================================================================

ALTER TABLE public.fran_zernio_broadcasts
    ADD COLUMN IF NOT EXISTS por_hora INT NOT NULL DEFAULT 60;
