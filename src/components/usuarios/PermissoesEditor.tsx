import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ACOES, PAGINAS } from "@/lib/permissoes";
import type { UsuarioPermissoes } from "@/lib/types";

interface Props {
  value: UsuarioPermissoes;
  onChange: (next: UsuarioPermissoes) => void;
  /** Quando true (admin), mostra tudo marcado e desabilitado. */
  disabled?: boolean;
}

function toggle(lista: string[], id: string): string[] {
  return lista.includes(id)
    ? lista.filter((x) => x !== id)
    : [...lista, id];
}

export function PermissoesEditor({ value, onChange, disabled }: Props) {
  const marcadaPagina = (id: string) =>
    disabled ? true : value.paginas.includes(id);
  const marcadaAcao = (id: string) =>
    disabled ? true : value.acoes.includes(id);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-medium">Páginas</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {PAGINAS.map((p) => (
            <label
              key={p.id}
              className="flex items-start gap-2 rounded-md border p-2 text-sm"
            >
              <Checkbox
                checked={marcadaPagina(p.id)}
                disabled={disabled}
                onCheckedChange={() =>
                  onChange({ ...value, paginas: toggle(value.paginas, p.id) })
                }
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">{p.label}</span>
                {p.descricao && (
                  <span className="block text-xs text-muted-foreground">
                    {p.descricao}
                  </span>
                )}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">Funcionalidades</Label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {ACOES.map((a) => (
            <label
              key={a.id}
              className="flex items-start gap-2 rounded-md border p-2 text-sm"
            >
              <Checkbox
                checked={marcadaAcao(a.id)}
                disabled={disabled}
                onCheckedChange={() =>
                  onChange({ ...value, acoes: toggle(value.acoes, a.id) })
                }
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">{a.label}</span>
                {a.descricao && (
                  <span className="block text-xs text-muted-foreground">
                    {a.descricao}
                  </span>
                )}
              </span>
            </label>
          ))}
        </div>
      </div>

      {disabled && (
        <p className="text-xs text-muted-foreground">
          Administradores têm acesso total — as permissões não se aplicam.
        </p>
      )}
    </div>
  );
}
