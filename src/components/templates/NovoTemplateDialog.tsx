// src/components/templates/NovoTemplateDialog.tsx
// Dialog para criar um novo template WhatsApp Business via Zernio.
// Suporta: header (texto), body com variáveis {{1}}, footer, botões de resposta rápida.

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Plus, Trash2, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { zernio, type CreateTemplateInput, type TemplateComponent } from "@/lib/zernio";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSucesso: () => void;
}

const IDIOMAS = [
  { value: "pt_BR", label: "Português (Brasil)" },
  { value: "en", label: "Inglês" },
  { value: "es", label: "Espanhol" },
];

export function NovoTemplateDialog({ open, onOpenChange, onSucesso }: Props) {
  const { toast } = useToast();

  const [nome, setNome] = useState("");
  const [categoria, setCategoria] = useState<"MARKETING" | "UTILITY" | "AUTHENTICATION">("UTILITY");
  const [idioma, setIdioma] = useState("pt_BR");
  const [headerTexto, setHeaderTexto] = useState("");
  const [bodyTexto, setBodyTexto] = useState("");
  const [footerTexto, setFooterTexto] = useState("");
  const [botoes, setBotoes] = useState<string[]>([]);
  const [novoBotao, setNovoBotao] = useState("");

  const { mutate: criar, isPending } = useMutation({
    mutationFn: (input: CreateTemplateInput) => zernio.templates.criar(input),
    onSuccess: (template) => {
      toast({
        title: "Template enviado para aprovação!",
        description: `"${template?.name}" está aguardando revisão da Meta.`,
      });
      resetar();
      onSucesso();
    },
    onError: (e) =>
      toast({
        variant: "destructive",
        title: "Erro ao criar template",
        description: e instanceof Error ? e.message : "Operação falhou",
      }),
  });

  function resetar() {
    setNome("");
    setCategoria("UTILITY");
    setIdioma("pt_BR");
    setHeaderTexto("");
    setBodyTexto("");
    setFooterTexto("");
    setBotoes([]);
    setNovoBotao("");
  }

  function adicionarBotao() {
    const texto = novoBotao.trim();
    if (!texto || botoes.length >= 3) return;
    setBotoes((prev) => [...prev, texto]);
    setNovoBotao("");
  }

  function removerBotao(i: number) {
    setBotoes((prev) => prev.filter((_, idx) => idx !== i));
  }

  function handleSubmit() {
    // Validações
    if (!nome.trim()) {
      toast({ variant: "destructive", title: "Nome do template é obrigatório" });
      return;
    }
    if (!/^[a-z0-9_]+$/.test(nome.trim())) {
      toast({
        variant: "destructive",
        title: "Nome inválido",
        description: "Use apenas letras minúsculas, números e underscore.",
      });
      return;
    }
    if (!bodyTexto.trim()) {
      toast({ variant: "destructive", title: "O corpo (body) é obrigatório" });
      return;
    }

    // Montar components
    const components: TemplateComponent[] = [];

    if (headerTexto.trim()) {
      components.push({ type: "HEADER", format: "TEXT", text: headerTexto.trim() });
    }

    components.push({ type: "BODY", text: bodyTexto.trim() });

    if (footerTexto.trim()) {
      components.push({ type: "FOOTER", text: footerTexto.trim() });
    }

    if (botoes.length > 0) {
      components.push({
        type: "BUTTONS",
        buttons: botoes.map((texto) => ({ type: "QUICK_REPLY", text: texto })),
      });
    }

    criar({ name: nome.trim(), category: categoria, language: idioma, components });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!isPending) { onOpenChange(v); if (!v) resetar(); } }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Novo template WhatsApp</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Info */}
          <div className="flex gap-2 rounded bg-muted/50 p-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            <p>
              Templates precisam ser aprovados pela Meta antes do uso. Use{" "}
              <code className="font-mono">{"{{1}}"}</code>,{" "}
              <code className="font-mono">{"{{2}}"}</code> para variáveis no corpo.
              O processo leva de alguns minutos a 24h.
            </p>
          </div>

          {/* Nome */}
          <div className="space-y-1.5">
            <Label htmlFor="tpl-nome">
              Nome <span className="text-destructive">*</span>
            </Label>
            <Input
              id="tpl-nome"
              placeholder="negociacao_divida_v1"
              value={nome}
              onChange={(e) => setNome(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
            />
            <p className="text-xs text-muted-foreground">
              Apenas letras minúsculas, números e underscore. Não pode ser alterado após criação.
            </p>
          </div>

          {/* Categoria + Idioma */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>
                Categoria <span className="text-destructive">*</span>
              </Label>
              <Select value={categoria} onValueChange={(v) => setCategoria(v as typeof categoria)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="UTILITY">Utilidade</SelectItem>
                  <SelectItem value="MARKETING">Marketing</SelectItem>
                  <SelectItem value="AUTHENTICATION">Autenticação</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>
                Idioma <span className="text-destructive">*</span>
              </Label>
              <Select value={idioma} onValueChange={setIdioma}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {IDIOMAS.map((i) => (
                    <SelectItem key={i.value} value={i.value}>
                      {i.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Header (opcional) */}
          <div className="space-y-1.5">
            <Label htmlFor="tpl-header">Header (opcional)</Label>
            <Input
              id="tpl-header"
              placeholder="Ex: Stival Advogados — Negociação de Dívida"
              value={headerTexto}
              onChange={(e) => setHeaderTexto(e.target.value)}
              maxLength={60}
            />
            <p className="text-xs text-muted-foreground">Máximo 60 caracteres. Sem variáveis.</p>
          </div>

          {/* Body */}
          <div className="space-y-1.5">
            <Label htmlFor="tpl-body">
              Corpo <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="tpl-body"
              placeholder={"Olá, {{1}}! Identificamos uma pendência de R$ {{2}} em seu nome. Podemos ajudá-lo a regularizar sua situação. Responda SIM para saber mais."}
              value={bodyTexto}
              onChange={(e) => setBodyTexto(e.target.value)}
              rows={5}
              maxLength={1024}
            />
            <p className="text-xs text-muted-foreground">
              Use <code className="font-mono">{"{{1}}"}</code>,{" "}
              <code className="font-mono">{"{{2}}"}</code> etc. para variáveis dinâmicas.
              Máximo 1024 caracteres.
            </p>
          </div>

          {/* Footer (opcional) */}
          <div className="space-y-1.5">
            <Label htmlFor="tpl-footer">Footer (opcional)</Label>
            <Input
              id="tpl-footer"
              placeholder="Ex: Para não receber mais mensagens, responda PARAR."
              value={footerTexto}
              onChange={(e) => setFooterTexto(e.target.value)}
              maxLength={60}
            />
          </div>

          {/* Botões de resposta rápida (opcional, máx 3) */}
          <div className="space-y-2">
            <Label>Botões de resposta rápida (opcional, máx 3)</Label>
            <div className="space-y-1.5">
              {botoes.map((b, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="flex-1 rounded border bg-muted/30 px-3 py-1.5 text-sm">
                    {b}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => removerBotao(i)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            {botoes.length < 3 && (
              <div className="flex gap-2">
                <Input
                  placeholder="Ex: Quero negociar"
                  value={novoBotao}
                  onChange={(e) => setNovoBotao(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); adicionarBotao(); } }}
                  maxLength={25}
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={adicionarBotao}
                  disabled={!novoBotao.trim()}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Máximo 25 caracteres por botão. Máximo 3 botões.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => { onOpenChange(false); resetar(); }}
            disabled={isPending}
          >
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isPending || !nome || !bodyTexto}>
            {isPending ? "Enviando..." : "Enviar para aprovação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
