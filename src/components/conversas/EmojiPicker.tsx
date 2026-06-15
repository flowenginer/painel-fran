import { useState } from "react";
import { Smile } from "lucide-react";

import { Button } from "@/components/ui/button";

// Conjunto enxuto e curado — cobre o uso comum de atendimento sem precisar
// de uma biblioteca extra. Dá para evoluir para um picker completo depois.
const EMOJIS = [
  "😀","😁","😂","🤣","😊","😍","😘","😉","😎","🤩",
  "🙂","🙃","😅","😇","🥰","😋","😛","🤔","🤗","🙏",
  "👍","👎","👌","👏","🙌","💪","🤝","✌️","🤞","👋",
  "❤️","🧡","💛","💚","💙","💜","🖤","💖","💯","🔥",
  "✅","❌","⚠️","❗","❓","💬","📞","📲","📅","⏰",
  "😢","😭","😔","😕","😟","😡","🤬","😴","🥳","🎉",
  "💰","💵","🤑","📄","📎","📌","✏️","📝","🔗","⭐",
];

interface Props {
  onSelect: (emoji: string) => void;
}

export function EmojiPicker({ onSelect }: Props) {
  const [aberto, setAberto] = useState(false);

  return (
    <div className="relative">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-9 w-9 text-muted-foreground"
        aria-label="Emojis"
        onClick={() => setAberto((a) => !a)}
      >
        <Smile className="h-5 w-5" />
      </Button>

      {aberto && (
        <>
          {/* backdrop para fechar ao clicar fora */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setAberto(false)}
          />
          <div className="absolute bottom-11 left-0 z-50 w-64 rounded-md border bg-popover p-2 shadow-md">
            <div className="grid grid-cols-8 gap-0.5">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  className="rounded p-1 text-lg hover:bg-accent"
                  onClick={() => {
                    onSelect(e);
                    setAberto(false);
                  }}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
