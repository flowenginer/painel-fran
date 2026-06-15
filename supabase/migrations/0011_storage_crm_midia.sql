-- ============================================================================
-- Storage para mídia do CRM (envio pela operadora)
-- ============================================================================
-- Rode no SQL Editor do Supabase Cloud. Idempotente.
--
-- Cria o bucket público `crm-midia` e as políticas para o painel:
--   - authenticated pode FAZER UPLOAD (insert) nesse bucket;
--   - leitura é pública (bucket público) — o WhatsApp/n8n precisa acessar a
--     URL para enviar a mídia ao lead.
--
-- Usado pela operadora ao mandar áudio/imagem/arquivo na tela de Conversas.
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('crm-midia', 'crm-midia', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Upload (INSERT) por usuários autenticados no bucket crm-midia.
DROP POLICY IF EXISTS "crm_midia_insert_auth" ON storage.objects;
CREATE POLICY "crm_midia_insert_auth"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'crm-midia');

-- Leitura pública dos objetos do bucket (necessário para o n8n/UAZAPI puxar).
DROP POLICY IF EXISTS "crm_midia_select_public" ON storage.objects;
CREATE POLICY "crm_midia_select_public"
    ON storage.objects FOR SELECT
    TO public
    USING (bucket_id = 'crm-midia');
