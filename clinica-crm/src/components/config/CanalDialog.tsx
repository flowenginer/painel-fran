import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listarUnidades } from "@/lib/pacientes";
import {
  atualizarCanal,
  criarCanal,
  lerSecret,
  salvarSecret,
} from "@/lib/canais";
import type { Canal, CanalTipo } from "@/lib/types";

interface CanalDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  inicial: Canal | null;
}

export function CanalDialog({ open, onOpenChange, inicial }: CanalDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const editando = !!inicial;

  const { data: unidades } = useQuery({
    queryKey: ["unidades"],
    queryFn: listarUnidades,
    enabled: open,
    staleTime: 1000 * 60 * 5,
  });

  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<CanalTipo>("uazapi");
  const [unidadeId, setUnidadeId] = useState("");
  const [instancia, setInstancia] = useState("");
  const [numero, setNumero] = useState("");
  const [accountId, setAccountId] = useState("");
  const [token, setToken] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [n8nUrl, setN8nUrl] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNome(inicial?.nome ?? "");
    setTipo(inicial?.tipo ?? "uazapi");
    setUnidadeId(inicial?.unidade_id ? String(inicial.unidade_id) : "");
    setInstancia(inicial?.instancia ?? "");
    setNumero(inicial?.numero ?? "");
    setAccountId(inicial?.zernio_account_id ?? "");
    setToken("");
    setWebhookSecret("");
    setN8nUrl("");
    // Carrega os segredos existentes ao editar.
    if (inicial) {
      void lerSecret(inicial.id).then((s) => {
        setToken(s.token);
        setWebhookSecret(s.webhook_secret);
        setN8nUrl(s.n8n_url);
      });
    }
  }, [open, inicial]);

  async function salvar() {
    if (!nome.trim() || !unidadeId) {
      toast({ variant: "destructive", title: "Preencha nome e unidade" });
      return;
    }
    setSalvando(true);
    try {
      const base = {
        unidade_id: Number(unidadeId),
        nome,
        tipo,
        instancia: tipo === "uazapi" ? instancia : "",
        numero,
        zernio_account_id: tipo === "zernio" ? accountId : null,
      };
      const canal =
        editando && inicial
          ? await atualizarCanal(inicial.id, base)
          : await criarCanal(base);
      await salvarSecret(canal.id, {
        token,
        webhook_secret: webhookSecret,
        n8n_url: tipo === "uazapi" ? n8nUrl : "",
      });
      await queryClient.invalidateQueries({ queryKey: ["canais"] });
      toast({ title: editando ? "Canal atualizado" : "Canal criado" });
      onOpenChange(false);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
    } finally {
      setSalvando(false);
    }
  }

  const oficial = tipo === "zernio";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editando ? "Editar canal" : "Novo canal"}</DialogTitle>
          <DialogDescription>
            Número de WhatsApp e credenciais. Os segredos ficam visíveis só para
            administradores.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex.: Recepção Matriz"
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as CanalTipo)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="uazapi">Não-oficial (uazapi)</SelectItem>
                  <SelectItem value="zernio">Oficial (Zernio)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Unidade</Label>
              <Select value={unidadeId} onValueChange={setUnidadeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {(unidades ?? []).map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>
                      {u.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Número (opcional)</Label>
              <Input
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                placeholder="5562999990000"
              />
            </div>
          </div>

          {oficial ? (
            <div className="space-y-2">
              <Label>Zernio accountId</Label>
              <Input
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                placeholder="accountId interno do Zernio"
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Instância (uazapi)</Label>
              <Input
                value={instancia}
                onChange={(e) => setInstancia(e.target.value)}
                placeholder="nome da instância no n8n/uazapi"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>{oficial ? "API key (Zernio)" : "Token da instância"}</Label>
            <Input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          <div className="space-y-2">
            <Label>
              {oficial ? "Webhook secret (HMAC)" : "Secret do webhook (n8n → painel)"}
            </Label>
            <Input
              type="password"
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          {!oficial && (
            <div className="space-y-2">
              <Label>URL do n8n (envio)</Label>
              <Input
                value={n8nUrl}
                onChange={(e) => setN8nUrl(e.target.value)}
                placeholder="https://seu-n8n/webhook/enviar"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={salvando}
          >
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={salvando}>
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
