import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { SortDirection, SortField } from "@/hooks/useDevedores";

interface SortableHeadProps {
  field: SortField;
  currentField: SortField;
  direction: SortDirection;
  onSort: (field: SortField, direction: SortDirection) => void;
  align?: "left" | "right";
  children: React.ReactNode;
}

export function SortableHead({
  field,
  currentField,
  direction,
  onSort,
  align = "left",
  children,
}: SortableHeadProps) {
  const isActive = currentField === field;

  function handleClick() {
    if (isActive) {
      onSort(field, direction === "asc" ? "desc" : "asc");
    } else {
      onSort(field, "asc");
    }
  }

  return (
    <TableHead className={cn(align === "right" && "text-right")}>
      <button
        type="button"
        onClick={handleClick}
        className={cn(
          "inline-flex items-center gap-1 font-medium hover:text-foreground transition-colors",
          align === "right" && "w-full justify-end",
          isActive && "text-foreground"
        )}
      >
        {children}
        {!isActive && (
          <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
        )}
        {isActive && direction === "asc" && (
          <ArrowUp className="h-3.5 w-3.5" />
        )}
        {isActive && direction === "desc" && (
          <ArrowDown className="h-3.5 w-3.5" />
        )}
      </button>
    </TableHead>
  );
}
