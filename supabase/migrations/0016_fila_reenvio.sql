-- ============================================================================
-- Reenvio em massa pela fila (gotejamento)
-- ============================================================================
-- Rode no SQL Editor do Supabase Cloud. Idempotente. Requer 0001 (fila).
--
-- Marca itens da fila como "reenvio": o processar-fila trata esses itens com a
-- semântica de reenvio (não muda status, não reatribui responsável, só
-- atualiza data_ultimo_contato) e bloqueia apenas negociação ativa /
-- acordo fechado na elegibilidade.
-- ============================================================================

ALTER TABLE public.fran_fila_disparo
    ADD COLUMN IF NOT EXISTS reenvio BOOLEAN NOT NULL DEFAULT false;
