// Input monetário que aceita digitação em padrão brasileiro.
//
// HTML <input type="number"> usa padrão en-US (ponto = decimal), o que faz
// "34.000" virar 34. Este componente usa type=text + inputMode=decimal,
// faz parse pt-BR via parseBRL e formata o valor no blur.
import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatBRL, formatBRLSemPrefixo, parseBRL } from "@/lib/formatters";

interface Props {
  valor: number | null;
  onChange: (valor: number | null) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
}

export function InputValorBRL({
  valor,
  onChange,
  placeholder = "0,00",
  className,
  disabled,
  "aria-label": ariaLabel,
}: Props) {
  // Mantém o texto digitado para respeitar o que o usuário escreveu.
  const [texto, setTexto] = useState<string>(() =>
    valor === null ? "" : formatBRLSemPrefixo(valor)
  );

  // Se o valor vier de fora (reset do form), atualiza o texto.
  useEffect(() => {
    const atualParsed = parseBRL(texto);
    if (valor !== atualParsed) {
      setTexto(valor === null ? "" : formatBRLSemPrefixo(valor));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const novoTexto = e.target.value;
    setTexto(novoTexto);
    onChange(parseBRL(novoTexto));
  }

  function handleBlur() {
    const n = parseBRL(texto);
    if (n === null) {
      setTexto("");
      onChange(null);
    } else {
      setTexto(formatBRLSemPrefixo(n));
      onChange(n);
    }
  }

  return (
    <div className="space-y-0.5">
      <Input
        type="text"
        inputMode="decimal"
        value={texto}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(className)}
        aria-label={ariaLabel}
      />
      {texto && (
        <p className="text-[10px] text-muted-foreground tabular-nums">
          {valor === null ? "valor inválido" : formatBRL(valor)}
        </p>
      )}
    </div>
  );
}
