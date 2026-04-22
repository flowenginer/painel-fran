// Normalização e priorização de telefones brasileiros conforme PRD seção 7.1.
//
// O Cedrus entrega telefones de duas formas:
//   - array de strings ["6281129405", ...]
//   - array de objetos [{ fone: "6281129405", fone_obs?: "..." }, ...]
// Cobrimos os dois.
//
// Regras:
// 1. Remove caracteres não numéricos.
// 2. Descarta se < 10 ou > 13 dígitos.
// 3. Classifica celular (11 dígitos, 3º = 9) vs fixo.
// 4. Adiciona prefixo 55 se não tiver.
// 5. Ordena celulares antes de fixos.
// 6. Retorna até 3 telefones (telefone, telefone_2, telefone_3).

export interface TelefonesNormalizados {
  telefone: string; // destino do WhatsApp
  telefone_2: string | null;
  telefone_3: string | null;
}

interface TelefoneClassificado {
  numero: string; // com 55 na frente
  celular: boolean;
}

function classificar(raw: string): TelefoneClassificado | null {
  const digitos = (raw ?? "").replace(/\D/g, "");
  if (!digitos) return null;

  // Remove prefixo 55 pra analisar o nacional
  let nacional = digitos;
  if (digitos.length === 13 && digitos.startsWith("55")) {
    nacional = digitos.slice(2);
  } else if (digitos.length === 12 && digitos.startsWith("55")) {
    nacional = digitos.slice(2);
  }

  // Nacional deve ter 10 (fixo) ou 11 (celular) dígitos
  if (nacional.length < 10 || nacional.length > 11) return null;

  let celular = false;
  if (nacional.length === 11) {
    // 3º dígito (primeiro após DDD) deve ser 9 pra ser celular válido
    if (nacional[2] !== "9") return null;
    celular = true;
  }

  return { numero: `55${nacional}`, celular };
}

// Extrai string do telefone, aceitando tanto formato plano quanto objeto.
function extrairString(raw: unknown): string | null {
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    // Cedrus usa "fone"; fallback para "telefone" e "numero" por garantia.
    for (const key of ["fone", "telefone", "numero", "number"]) {
      const v = obj[key];
      if (typeof v === "string" && v.trim()) return v;
    }
  }
  return null;
}

export function normalizarTelefones(
  telefones: unknown
): TelefonesNormalizados {
  const arr = Array.isArray(telefones) ? telefones : [];
  const classificados: TelefoneClassificado[] = [];
  const seen = new Set<string>();

  for (const raw of arr) {
    const str = extrairString(raw);
    if (!str) continue;
    const c = classificar(str);
    if (!c) continue;
    if (seen.has(c.numero)) continue;
    seen.add(c.numero);
    classificados.push(c);
  }

  // Celulares primeiro, preservando ordem de entrada
  classificados.sort((a, b) => Number(b.celular) - Number(a.celular));

  const [p1, p2, p3] = classificados;
  return {
    telefone: p1?.numero ?? "",
    telefone_2: p2?.numero ?? null,
    telefone_3: p3?.numero ?? null,
  };
}
