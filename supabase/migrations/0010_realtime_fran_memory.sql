-- ============================================================================
-- Realtime na fran_memory (mensagens aparecem sem precisar dar F5)
-- ============================================================================
-- Rode no SQL Editor do Supabase Cloud. Idempotente.
--
-- O painel já escuta postgres_changes em fran_memory (useConversasRealtime),
-- mas só funciona se a tabela estiver na publicação de Realtime. Como as
-- mensagens recebidas entram por conexão direta do n8n, o Realtime do
-- Supabase as captura via WAL — desde que a tabela esteja publicada.
--
-- REPLICA IDENTITY FULL garante que o Realtime tenha as colunas da linha
-- (necessário para avaliar a RLS de fran_memory ao decidir o que entregar).
-- ============================================================================

ALTER TABLE public.fran_memory REPLICA IDENTITY FULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
         WHERE pubname = 'supabase_realtime'
           AND schemaname = 'public'
           AND tablename = 'fran_memory'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.fran_memory;
    END IF;
END $$;
