-- ============================================================================
-- Fila de distribuição: dias da semana permitidos
-- ============================================================================
-- Rode no SQL Editor do Supabase Cloud. Idempotente.
--
-- Adiciona a config fila_dias_semana: lista separada por vírgula com os dias
-- em que a fila pode disparar. Índices seguem Date.getDay():
--   0=domingo, 1=segunda, 2=terça, 3=quarta, 4=quinta, 5=sexta, 6=sábado
--
-- Padrão "1,2,3,4,5" = segunda a sexta (não dispara fim de semana).
-- Para liberar todos os dias, deixe "0,1,2,3,4,5,6" (ou vazio).
-- ============================================================================

INSERT INTO public.fran_config (chave, valor, descricao) VALUES
    ('fila_dias_semana', '1,2,3,4,5',
     'Dias da semana em que a fila dispara (0=dom..6=sáb, separados por vírgula)')
ON CONFLICT (chave) DO NOTHING;
