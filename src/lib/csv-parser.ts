// Parser CSV/TSV simples sem dependências.
// Detecta separador automaticamente entre tab, ponto-e-vírgula e vírgula.
// Suporta valores entre aspas (com escape por duplicação ""), CRLF/LF.

const SEPS = ["\t", ";", ","] as const;
type Sep = (typeof SEPS)[number];

function detectarSeparador(primeiraLinha: string): Sep {
  // Ignora conteúdo dentro de aspas para a contagem
  const fora = primeiraLinha.replace(/"[^"]*"/g, "");
  let melhor: Sep = "\t";
  let maior = -1;
  for (const sep of SEPS) {
    const n = (fora.match(new RegExp(`\\${sep}`, "g")) ?? []).length;
    if (n > maior) {
      maior = n;
      melhor = sep;
    }
  }
  return melhor;
}

function parseLinha(linha: string, sep: Sep): string[] {
  const campos: string[] = [];
  let atual = "";
  let dentroAspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') {
      if (dentroAspas && linha[i + 1] === '"') {
        atual += '"';
        i++;
      } else {
        dentroAspas = !dentroAspas;
      }
    } else if (c === sep && !dentroAspas) {
      campos.push(atual);
      atual = "";
    } else {
      atual += c;
    }
  }
  campos.push(atual);
  return campos.map((s) => s.trim());
}

export interface CsvParseResult {
  headers: string[];
  linhas: Record<string, string>[];
  separador: string;
}

/**
 * Parseia um texto CSV/TSV em linhas como objetos.
 * - Headers: primeira linha não vazia.
 * - Nomes dos headers são normalizados para lowercase.
 */
export function parseCsv(texto: string): CsvParseResult {
  // Normaliza quebras de linha e remove BOM
  const limpo = texto.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const todasLinhas = limpo
    .split("\n")
    .filter((l) => l.trim().length > 0);

  if (todasLinhas.length === 0) {
    return { headers: [], linhas: [], separador: "," };
  }

  const sep = detectarSeparador(todasLinhas[0]);
  const headers = parseLinha(todasLinhas[0], sep).map((h) =>
    h.toLowerCase().trim()
  );

  const linhas: Record<string, string>[] = [];
  for (let i = 1; i < todasLinhas.length; i++) {
    const campos = parseLinha(todasLinhas[i], sep);
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = (campos[idx] ?? "").trim();
    });
    linhas.push(obj);
  }

  return { headers, linhas, separador: sep };
}
