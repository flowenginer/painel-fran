// src/components/templates/NovoTemplateDialog.tsx
// Dialog para criar um novo template WhatsApp Business via Zernio.
// Suporta: header (texto), body com variáveis {{1}}, footer, botões de resposta rápida.

import { useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Plus, Trash2, Info, Braces } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { zernio, type CreateTemplateInput, type TemplateComponent } from "@/lib/zernio";
import { CAMPOS_DEVEDOR, extrairVariaveis } from "@/lib/broadcasts";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// Valores de exemplo por campo do lead — a Meta EXIGE um exemplo para cada
// variável {{n}} do corpo, senão a criação do template é recusada.
const EXEMPLO_CAMPO: Record<string, string> = {
  primeiro_nome: "Maria",
  nome_devedor: "Maria Silva",
  tratamento: "Sra.",
  instituicao: "Colégio Exemplo",
  cidade: "Goiânia",
  valor_atualizado: "1.500,00",
  valor_original: "1.200,00",
};

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
  // Mapa da variável do corpo → campo do lead ({"1":"primeiro_nome"}).
  const [mapaCampos, setMapaCampos] = useState<Record<string, string>>({});
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // Variáveis {{n}} realmente presentes no corpo (fonte da verdade).
  const varsUsadas = useMemo(() => extrairVariaveis(bodyTexto), [bodyTexto]);

  // Insere {{n}} na posição do cursor e já mapeia para o campo do lead.
  function inserirCampo(campoId: string) {
    const nums = extrairVariaveis(bodyTexto).map(Number);
    const n = (nums.length ? Math.max(...nums) : 0) + 1;
    const token = `{{${n}}}`;
    const el = bodyRef.current;
    const start = el?.selectionStart ?? bodyTexto.length;
    const end = el?.selectionEnd ?? bodyTexto.length;
    const novo = bodyTexto.slice(0, start) + token + bodyTexto.slice(end);
    setBodyTexto(novo);
    setMapaCampos((prev) => ({ ...prev, [String(n)]: campoId }));
    requestAnimationFrame(() => {
      const pos = start + token.length;
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  }

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
    setMapaCampos({});
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
    // Toda variável {{n}} precisa estar mapeada a um campo do lead (a Meta
    // exige um exemplo por variável; usamos o campo para gerar o exemplo).
    const naoMapeada = varsUsadas.find((v) => !mapaCampos[v]);
    if (naoMapeada) {
      toast({
        variant: "destructive",
        title: `Falta escolher o campo da variável {{${naoMapeada}}}`,
        description: "Cada variável do corpo precisa apontar para um campo do lead.",
      });
      return;
    }
    // A Meta exige variáveis sequenciais: {{1}}, {{2}}, {{3}}... sem pular número.
    const esperado = varsUsadas.map((_, i) => String(i + 1)).join(",");
    if (varsUsadas.join(",") !== esperado) {
      toast({
        variant: "destructive",
        title: "Variáveis fora de sequência",
        description: "Use {{1}}, {{2}}, {{3}}… em ordem, sem pular número. Reinsira os campos pelo botão.",
      });
      return;
    }

    // Montar components
    const components: TemplateComponent[] = [];

    if (headerTexto.trim()) {
      components.push({ type: "HEADER", format: "TEXT", text: headerTexto.trim() });
    }

    const bodyComp: TemplateComponent = { type: "BODY", text: bodyTexto.trim() };
    if (varsUsadas.length > 0) {
      // example.body_text = [[ex1, ex2, ...]] na ordem 1,2,3...
      bodyComp.example = {
        body_text: [varsUsadas.map((v) => EXEMPLO_CAMPO[mapaCampos[v]] ?? "exemplo")],
      };
    }
    components.push(bodyComp);

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
              Templates precisam ser aprovados pela Meta antes do uso. Para
              personalizar (nome do lead, instituição…), use{" "}
              <strong>Inserir campo do lead</strong> no corpo — não digite{" "}
              <code className="font-mono">[Nome]</code>; a Meta só aceita variáveis
              no formato <code className="font-mono">{"{{1}}"}</code> com exemplos
              (o sistema já cuida disso). O processo leva de alguns minutos a 24h.
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
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="tpl-body">
                Corpo <span className="text-destructive">*</span>
              </Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
                    <Braces className="h-3.5 w-3.5" />
                    Inserir campo do lead
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {CAMPOS_DEVEDOR.map((c) => (
                    <DropdownMenuItem key={c.id} onClick={() => inserirCampo(c.id)}>
                      {c.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <Textarea
              id="tpl-body"
              ref={bodyRef}
              placeholder={"Olá, {{1}}! Passei a integrar a equipe da {{2}} e revisei o seu atendimento..."}
              value={bodyTexto}
              onChange={(e) => setBodyTexto(e.target.value)}
              rows={6}
              maxLength={1024}
            />
            <p className="text-xs text-muted-foreground">
              Clique em <strong>Inserir campo do lead</strong> para colocar um campo
              personalizado (Nome, Instituição…) — ele vira <code className="font-mono">{"{{n}}"}</code>{" "}
              e é preenchido na hora do envio. Máximo 1024 caracteres.
            </p>

            {/* Mapeamento das variáveis → campo do lead */}
            {varsUsadas.length > 0 && (
              <div className="space-y-2 rounded-md border bg-muted/20 p-3">
                <p className="text-xs font-medium">Campos usados no corpo</p>
                {varsUsadas.map((v) => (
                  <div key={v} className="flex items-center gap-2">
                    <span className="w-10 shrink-0 font-mono text-xs">{`{{${v}}}`}</span>
                    <Select
                      value={mapaCampos[v] ?? ""}
                      onValueChange={(campo) =>
                        setMapaCampos((prev) => ({ ...prev, [v]: campo }))
                      }
                    >
                      <SelectTrigger className="h-8 flex-1">
                        <SelectValue placeholder="Escolha o campo do lead" />
                      </SelectTrigger>
                      <SelectContent>
                        {CAMPOS_DEVEDOR.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="hidden w-28 shrink-0 truncate text-[11px] text-muted-foreground sm:inline">
                      ex: {mapaCampos[v] ? EXEMPLO_CAMPO[mapaCampos[v]] ?? "—" : "—"}
                    </span>
                  </div>
                ))}
              </div>
            )}
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
