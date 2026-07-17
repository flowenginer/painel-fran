-- ============================================================================
-- Fase 6 — Storage para mídia do chat (áudio, imagem, documento)
-- ============================================================================
-- Rode no SQL Editor. Idempotente. Cria o bucket público `crm-midia` e as
-- políticas: qualquer autenticado sobe arquivo; leitura é pública (URL pública).
-- ============================================================================

-- Bucket público (leitura via URL pública; upload controlado por policy).
INSERT INTO storage.buckets (id, name, public)
VALUES ('crm-midia', 'crm-midia', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Upload: qualquer usuário autenticado pode subir no bucket.
DROP POLICY IF EXISTS crm_midia_insert ON storage.objects;
CREATE POLICY crm_midia_insert ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'crm-midia');

-- Leitura autenticada (a leitura pública já funciona pela URL do bucket público).
DROP POLICY IF EXISTS crm_midia_select ON storage.objects;
CREATE POLICY crm_midia_select ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'crm-midia');

-- Remoção pelo dono do arquivo (quem subiu).
DROP POLICY IF EXISTS crm_midia_delete ON storage.objects;
CREATE POLICY crm_midia_delete ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'crm-midia' AND owner = auth.uid());
