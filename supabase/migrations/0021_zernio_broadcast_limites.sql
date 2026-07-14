-- ============================================================================
-- Broadcasts Zernio — limites de ritmo (fase 2)
-- ============================================================================
-- Chaves de configuração usadas pela Edge Function `zernio-broadcast` para
-- gotejar os envios respeitando os limites da conta oficial. Separadas da fila
-- de IA (processar-fila) de propósito: o disparo em massa tem um ritmo próprio.
--
-- Rode no SQL Editor do Supabase Cloud. Idempotente.
-- ============================================================================

INSERT INTO public.fran_config (chave, valor, descricao) VALUES
    ('zernio_broadcast_por_hora',      '60',   'Máximo de mensagens de broadcast enviadas por hora (ritmo do disparo)'),
    ('zernio_broadcast_limite_diario', '1000', 'Máximo de mensagens de broadcast enviadas por dia (janela de 24h)')
ON CONFLICT (chave) DO NOTHING;
