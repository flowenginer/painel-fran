// URL do proxy de mídia (Edge Function `midia-proxy`). Busca o arquivo no
// servidor e devolve inline, com o content-type certo e (quando a origem for
// o Zernio) já autenticado com o Bearer da conta — o navegador não consegue
// enviar Authorization em src de <img>/<audio>/<video>, então TODA mídia
// recebida (não hospedada no nosso Storage público) deve passar por aqui.
export function urlMidiaProxy(url: string, nome?: string | null): string {
  const base = import.meta.env.VITE_SUPABASE_URL;
  const qs = new URLSearchParams({ url });
  if (nome) qs.set("nome", nome);
  return `${base}/functions/v1/midia-proxy?${qs.toString()}`;
}
