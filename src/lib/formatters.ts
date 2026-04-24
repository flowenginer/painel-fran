// Formatadores brasileiros para o painel.

// Mascara CPF: 12345678900 -> 123.***.***-00 (privacidade na listagem).
export function formatCpfMascarado(cpf: string | null | undefined): string {
  if (!cpf) return "—";
  const digitos = cpf.replace(/\D/g, "");
  if (digitos.length !== 11) return cpf;
  return `${digitos.slice(0, 3)}.***.***-${digitos.slice(9)}`;
}

// Formata CPF completo: 12345678900 -> 123.456.789-00
export function formatCpf(cpf: string | null | undefined): string {
  if (!cpf) return "—";
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11) return cpf;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

// Formata valor em BRL. null/undefined -> traço.
export function formatBRL(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valor);
}

// Formata sem prefixo R$ (para usar dentro de inputs): "34.000,00"
export function formatBRLSemPrefixo(
  valor: number | null | undefined
): string {
  if (valor === null || valor === undefined) return "";
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valor);
}

// Parse de string em formato brasileiro para número.
// Regras:
//   - Remove "R$", espaços e qualquer caractere que não seja dígito/.,-
//   - Se tem vírgula: parte antes da última vírgula é inteira (pontos = milhar,
//     removidos); depois é a parte decimal.
//   - Se só tem ponto: tratamos como separador de milhar (padrão pt-BR)
//     e removemos todos — resultando num inteiro.
// Exemplos:
//   "34"            → 34
//   "34.000"        → 34000
//   "34,50"         → 34.5
//   "34.000,50"     → 34000.50
//   "1.234.567,89"  → 1234567.89
//   "R$ 2.654,95"   → 2654.95
export function parseBRL(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;

  const str = String(raw).trim();
  if (!str) return null;

  // Remove tudo que não é dígito, ponto, vírgula ou sinal negativo
  const limpo = str.replace(/[^\d.,-]/g, "");
  if (!limpo) return null;

  const temVirgula = limpo.includes(",");
  const temPonto = limpo.includes(".");

  let normalizado: string;
  if (temVirgula) {
    // Vírgula é decimal; pontos são milhar → remover
    normalizado = limpo.replace(/\./g, "").replace(",", ".");
  } else if (temPonto) {
    // Só ponto: assumimos milhar (padrão BR) → remover todos
    normalizado = limpo.replace(/\./g, "");
  } else {
    normalizado = limpo;
  }

  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}

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
