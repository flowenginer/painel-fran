import { useState } from "react";
import { Smile } from "lucide-react";

import { cn } from "@/lib/utils";

const EMOJIS = [
  "😀", "😁", "😂", "🤣", "😊", "😍", "😘", "😉",
  "👍", "👏", "🙏", "🙌", "💪", "🤝", "👌", "✌️",
  "❤️", "🔥", "✨", "🎉", "😅", "😎", "🥰", "😇",
  "😢", "😭", "😡", "🤔", "😴", "🤗", "😬", "🙄",
  "✅", "❌", "⚠️", "📌", "📅", "⏰", "💰", "📞",
  "🦷", "😁", "💉", "🩺", "🏥", "💊", "🧾", "📍",
];

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
}

export function EmojiPicker({ onSelect }: EmojiPickerProps) {
  const [aberto, setAberto] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
        aria-label="Emoji"
      >
        <Smile className="h-5 w-5" />
      </button>

      {aberto && (
        <>
          {/* clique fora fecha */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setAberto(false)}
          />
          <div
            className={cn(
              "absolute bottom-11 left-0 z-50 grid w-64 grid-cols-8 gap-1",
              "rounded-lg border bg-popover p-2 shadow-md",
            )}
          >
            {EMOJIS.map((e, i) => (
              <button
                key={`${e}-${i}`}
                type="button"
                className="rounded p-1 text-lg hover:bg-muted"
                onClick={() => {
                  onSelect(e);
                  setAberto(false);
                }}
              >
                {e}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
