// Dropdown de ações por devedor: editar, alterar status, remover.
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAtualizarStatus } from "@/hooks/useDevedorMutations";
import { useToast } from "@/hooks/use-toast";
import type { Devedor, StatusNegociacao } from "@/lib/types";

const STATUS_OPTIONS: { value: StatusNegociacao; label: string }[] = [
  { value: "pendente", label: "Pendente" },
  { value: "primeira_msg", label: "1ª Mensagem" },
  { value: "em_negociacao", label: "Em Negociação" },
  { value: "acordo_aceito", label: "Acordo Fechado" },
  { value: "escalado", label: "Escalado" },
  { value: "sem_acordo", label: "Sem Acordo" },
  { value: "aguardando_retorno", label: "Aguardando" },
];

interface Props {
  devedor: Devedor;
  onEditar: (d: Devedor) => void;
  onRemover: (d: Devedor) => void;
}

export function DevedorAcoes({ devedor, onEditar, onRemover }: Props) {
  const { mutateAsync: atualizarStatus, isPending } = useAtualizarStatus();
  const { toast } = useToast();

  async function handleStatus(status: StatusNegociacao) {
    if (devedor.status_negociacao === status) return;
    try {
      await atualizarStatus({ id: devedor.id, status });
      toast({
        variant: "success",
        title: "Status atualizado",
        description: STATUS_OPTIONS.find((s) => s.value === status)?.label,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro ao atualizar status",
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          disabled={isPending}
          aria-label={`Ações para ${devedor.nome_devedor}`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>Ações</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onEditar(devedor)}>
          <Pencil className="mr-2 h-4 w-4" />
          Editar devedor
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Alterar status</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {STATUS_OPTIONS.map((opt) => (
              <DropdownMenuItem
                key={opt.value}
                onSelect={() => void handleStatus(opt.value)}
                disabled={devedor.status_negociacao === opt.value}
              >
                {opt.label}
                {devedor.status_negociacao === opt.value && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    atual
                  </span>
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => onRemover(devedor)}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Remover devedor
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
