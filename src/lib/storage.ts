// Upload de mídia enviada pela operadora para o bucket público `crm-midia`.
// A URL pública resultante é o que vai para o n8n → UAZAPI e para a thread.
import { supabase } from "./supabase";

const BUCKET = "crm-midia";

/** Sobe um arquivo/blob e devolve a URL pública. */
export async function uploadMidia(
  file: Blob,
  nomeArquivo: string
): Promise<string> {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : String(Date.now());
  const path = `enviadas/${id}-${nomeArquivo}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
