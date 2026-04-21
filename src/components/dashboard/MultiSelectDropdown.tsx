import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectDropdownProps {
  label: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  className?: string;
}

export function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
  className,
}: MultiSelectDropdownProps) {
  function toggle(value: string) {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  const resumo =
    selected.length === 0
      ? label
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? label)
        : `${label}: ${selected.length}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("justify-between min-w-[160px]", className)}
        >
          <span className="truncate">{resumo}</span>
          <ChevronDown className="ml-2 h-4 w-4 opacity-50 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 overflow-auto">
        {options.length === 0 && (
          <div className="px-3 py-2 text-xs text-muted-foreground">
            Sem opções
          </div>
        )}
        {options.map((opt) => {
          const checked = selected.includes(opt.value);
          return (
            <label
              key={opt.value}
              className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
            >
              <Checkbox
                checked={checked}
                onCheckedChange={() => toggle(opt.value)}
              />
              <span className="flex-1">{opt.label}</span>
            </label>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
