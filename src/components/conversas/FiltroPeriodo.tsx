import { useEffect, useState } from "react";
import { CalendarDays, Check, ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { rotuloPeriodo, type Periodo } from "@/lib/periodo";

export interface PeriodoCounts {
  hoje: number;
  ontem: number;
  semana: number;
  total: number;
}

interface Props {
  value: Periodo;
  onChange: (p: Periodo) => void;
  counts: PeriodoCounts;
}

export function FiltroPeriodo({ value, onChange, counts }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");

  // Pré-preenche o diálogo com o período personalizado atual (se houver).
  useEffect(() => {
    if (dialogOpen) {
      setDe(value.tipo === "custom" ? value.de : "");
      setAte(value.tipo === "custom" ? value.ate : "");
    }
  }, [dialogOpen, value]);

  const opcoes: { tipo: Periodo["tipo"]; label: string; count?: number }[] = [
    { tipo: "todas", label: "Todas as datas", count: counts.total },
    { tipo: "hoje", label: "Hoje", count: counts.hoje },
    { tipo: "ontem", label: "Ontem", count: counts.ontem },
    { tipo: "semana", label: "Esta semana", count: counts.semana },
  ];

  function aplicarCustom() {
    if (!de || !ate) return;
    onChange({ tipo: "custom", de, ate });
    setDialogOpen(false);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 min-w-[150px] justify-between gap-2">
            <span className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              {rotuloPeriodo(value)}
            </span>
            <ChevronDown className="h-4 w-4 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {opcoes.map((o) => (
            <DropdownMenuItem
              key={o.tipo}
              onSelect={() => onChange({ tipo: o.tipo } as Periodo)}
              className="flex items-center justify-between"
            >
              <span className="flex items-center gap-2">
                {value.tipo === o.tipo ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <span className="w-4" />
                )}
                {o.label}
              </span>
              {o.count != null && (
                <span className="text-xs text-muted-foreground">
                  ({o.count})
                </span>
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setDialogOpen(true)}>
            <span className="flex items-center gap-2">
              {value.tipo === "custom" ? (
                <Check className="h-4 w-4" />
              ) : (
                <span className="w-4" />
              )}
              Período personalizado…
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Selecione o período</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Data inicial</Label>
              <Input
                type="date"
                value={de}
                max={ate || undefined}
                onChange={(e) => setDe(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Data final</Label>
              <Input
                type="date"
                value={ate}
                min={de || undefined}
                onChange={(e) => setAte(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={aplicarCustom} disabled={!de || !ate}>
              Aplicar filtro
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
