// Upload de mídia do chat para o bucket público `crm-midia`.
import { supabase } from "@/lib/supabase";
import type { TipoMensagem } from "@/lib/types";

const BUCKET = "crm-midia";

export interface MidiaUpload {
  url: string;
  tipo: TipoMensagem;
  mime: string;
}

function tipoDeMime(mime: string): TipoMensagem {
  if (mime.startsWith("image/")) return "imagem";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  return "documento";
}

export async function uploadMidia(file: File): Promise<MidiaUpload> {
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const nome = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(nome, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(nome);
  return {
    url: data.publicUrl,
    tipo: tipoDeMime(file.type),
    mime: file.type || "application/octet-stream",
  };
}
