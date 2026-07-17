// Formatadores usados no CRM da clínica.

// Formata telefone BR normalizado (ex 5562991357861) -> (62) 99135-7861
export function formatTelefone(tel: string | null | undefined): string {
  if (!tel) return "—";
  const d = tel.replace(/\D/g, "");
  // Remove prefixo 55 se presente
  const nacional = d.startsWith("55") && d.length >= 12 ? d.slice(2) : d;
  if (nacional.length === 11) {
    return `(${nacional.slice(0, 2)}) ${nacional.slice(2, 7)}-${nacional.slice(7)}`;
  }
  if (nacional.length === 10) {
    return `(${nacional.slice(0, 2)}) ${nacional.slice(2, 6)}-${nacional.slice(6)}`;
  }
  return tel;
}

// Normaliza telefone para gravar padronizado: só dígitos, com DDI 55.
// Aceita "(62) 99135-7861", "62991357861", "5562991357861" etc.
// Retorna null se não sobrar nada aproveitável.
export function normalizarTelefone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, "");
  if (!d) return null;
  // Já tem DDI 55 + (10 ou 11) dígitos nacionais → mantém.
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) return d;
  // 10/11 dígitos (DDD + número) → prefixa 55.
  if (d.length === 10 || d.length === 11) return `55${d}`;
  // Fallback: devolve os dígitos como vieram (validação fica no form).
  return d;
}

// Tempo relativo pt-BR ("há 3 min", "há 2h", "há 4 dias", "agora").
export function formatTempoRelativo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "—";

  const agora = Date.now();
  const diffMs = agora - data.getTime();
  const diffSeg = Math.round(diffMs / 1000);

  if (diffSeg < 30) return "agora";
  if (diffSeg < 60) return `há ${diffSeg}s`;
  const diffMin = Math.round(diffSeg / 60);
  if (diffMin < 60) return `há ${diffMin} min`;
  const diffHoras = Math.round(diffMin / 60);
  if (diffHoras < 24) return `há ${diffHoras}h`;
  const diffDias = Math.round(diffHoras / 24);
  if (diffDias < 30) return `há ${diffDias} ${diffDias === 1 ? "dia" : "dias"}`;
  const diffMeses = Math.round(diffDias / 30);
  if (diffMeses < 12)
    return `há ${diffMeses} ${diffMeses === 1 ? "mês" : "meses"}`;
  const diffAnos = Math.round(diffMeses / 12);
  return `há ${diffAnos} ${diffAnos === 1 ? "ano" : "anos"}`;
}
