// src/pages/Templates.tsx
// Página de gerenciamento de templates WhatsApp Business via Zernio API.
// Permite listar, criar e deletar templates — apenas admins têm acesso à criação.

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Trash2, RefreshCw, CheckCircle2, Clock, XCircle,
  PauseCircle, AlertCircle, ChevronDown, ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { zernio, type ZernioTemplate, type TemplateStatus } from "@/lib/zernio";
import { NovoTemplateDialog } from "@/components/templates/NovoTemplateDialog";

// ── helpers de status ──────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  TemplateStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }
> = {
  APPROVED: {
    label: "Aprovado",
    variant: "default",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  PENDING: {
    label: "Pendente",
    variant: "secondary",
    icon: <Clock className="h-3 w-3" />,
  },
  REJECTED: {
    label: "Rejeitado",
    variant: "destructive",
    icon: <XCircle className="h-3 w-3" />,
  },
  PAUSED: {
    label: "Pausado",
    variant: "outline",
    icon: <PauseCircle className="h-3 w-3" />,
  },
  DISABLED: {
    label: "Desabilitado",
    variant: "outline",
    icon: <PauseCircle className="h-3 w-3" />,
  },
  IN_APPEAL: {
    label: "Em recurso",
    variant: "secondary",
    icon: <AlertCircle className="h-3 w-3" />,
  },
};

const CATEGORY_LABEL: Record<string, string> = {
  MARKETING: "Marketing",
  UTILITY: "Utilidade",
  AUTHENTICATION: "Autenticação",
};

// ── card de template ───────────────────────────────────────────────────────

function TemplateCard({
  template,
  onDeletar,
  deletando,
  isAdmin,
}: {
  template: ZernioTemplate;
  onDeletar: (name: string) => void;
  deletando: boolean;
  isAdmin: boolean;
}) {
  const [expandido, setExpandido] = useState(false);
  const statusCfg = STATUS_CONFIG[template.status] ?? STATUS_CONFIG.PENDING;

  const bodyComp = template.components.find((c) => c.type === "BODY");
  const headerComp = template.components.find((c) => c.type === "HEADER");
  const footerComp = template.components.find((c) => c.type === "FOOTER");
  const botoesComp = template.components.find((c) => c.type === "BUTTONS");

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-sm font-mono">{template.name}</CardTitle>
              <Badge variant={statusCfg.variant} className="flex items-center gap-1 text-xs">
                {statusCfg.icon}
                {statusCfg.label}
              </Badge>
            </div>
            <CardDescription className="mt-1 text-xs">
              {CATEGORY_LABEL[template.category] ?? template.category} ·{" "}
              {template.language.toUpperCase()}
            </CardDescription>
          </div>
          {isAdmin && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => onDeletar(template.name)}
              disabled={deletando}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>

        {template.status === "REJECTED" && template.rejectedReason && (
          <p className="mt-2 rounded bg-destructive/10 px-2 py-1 text-xs text-destructive">
            Motivo: {template.rejectedReason}
          </p>
        )}
      </CardHeader>

      <CardContent className="space-y-2 pb-3">
        {/* Prévia do corpo */}
        {bodyComp?.text && (
          <p className="rounded bg-muted/50 px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap">
            {bodyComp.text}
          </p>
        )}

        {/* Expandir para ver todos os componentes */}
        <button
          onClick={() => setExpandido((v) => !v)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {expandido ? (
            <>
              <ChevronUp className="h-3 w-3" /> Ocultar detalhes
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" /> Ver componentes ({template.components.length})
            </>
          )}
        </button>

        {expandido && (
          <div className="space-y-2 rounded border bg-muted/30 p-2">
            {headerComp && (
              <div>
                <p className="text-xs font-medium text-muted-foreground">HEADER ({headerComp.format})</p>
                {headerComp.text && (
                  <p className="text-xs">{headerComp.text}</p>
                )}
              </div>
            )}
            {bodyComp && (
              <div>
                <p className="text-xs font-medium text-muted-foreground">BODY</p>
                <p className="text-xs whitespace-pre-wrap">{bodyComp.text}</p>
              </div>
            )}
            {footerComp?.text && (
              <div>
                <p className="text-xs font-medium text-muted-foreground">FOOTER</p>
                <p className="text-xs">{footerComp.text}</p>
              </div>
            )}
            {botoesComp?.buttons && botoesComp.buttons.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground">BOTÕES</p>
                <div className="flex flex-wrap gap-1">
                  {botoesComp.buttons.map((b, i) => (
                    <span key={i} className="rounded border px-2 py-0.5 text-xs">
                      {b.text}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── página principal ───────────────────────────────────────────────────────

export function Templates() {
  const { perfil } = useAuth();
  const isAdmin = perfil?.role === "admin";
  const qc = useQueryClient();
  const { toast } = useToast();
  const [novoAberto, setNovoAberto] = useState(false);

  const { data: templates = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ["zernio-templates"],
    queryFn: () => zernio.templates.list(),
    staleTime: 60_000,
  });

  const { mutate: deletar, isPending: deletando } = useMutation({
    mutationFn: (name: string) => zernio.templates.deletar(name),
    onSuccess: (_, name) => {
      qc.invalidateQueries({ queryKey: ["zernio-templates"] });
      toast({ title: `Template "${name}" removido.` });
    },
    onError: (e) =>
      toast({
        variant: "destructive",
        title: "Erro ao deletar template",
        description: e instanceof Error ? e.message : "Operação falhou",
      }),
  });

  const handleDeletar = (name: string) => {
    if (!confirm(`Deletar o template "${name}"? Esta ação não pode ser desfeita.`)) return;
    deletar(name);
  };

  // Agrupar por status
  const aprovados = templates.filter((t) => t.status === "APPROVED");
  const pendentes = templates.filter((t) => t.status === "PENDING" || t.status === "IN_APPEAL");
  const rejeitados = templates.filter(
    (t) => t.status === "REJECTED" || t.status === "PAUSED" || t.status === "DISABLED"
  );

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Templates WhatsApp</h1>
          <p className="text-sm text-muted-foreground">
            Templates aprovados pela Meta para envio fora da janela de 24h (via Zernio).
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          {isAdmin && (
            <Button size="sm" onClick={() => setNovoAberto(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Novo template
            </Button>
          )}
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
          Carregando templates...
        </div>
      )}

      {/* Vazio */}
      {!isLoading && templates.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <p className="text-sm">Nenhum template encontrado.</p>
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => setNovoAberto(true)}
              >
                Criar primeiro template
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Aprovados */}
      {aprovados.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Aprovados ({aprovados.length})
          </h2>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {aprovados.map((t) => (
              <TemplateCard
                key={t.name}
                template={t}
                onDeletar={handleDeletar}
                deletando={deletando}
                isAdmin={isAdmin}
              />
            ))}
          </div>
        </section>
      )}

      {/* Pendentes */}
      {pendentes.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Aguardando aprovação ({pendentes.length})
          </h2>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {pendentes.map((t) => (
              <TemplateCard
                key={t.name}
                template={t}
                onDeletar={handleDeletar}
                deletando={deletando}
                isAdmin={isAdmin}
              />
            ))}
          </div>
        </section>
      )}

      {/* Rejeitados/Pausados */}
      {rejeitados.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Rejeitados / Pausados ({rejeitados.length})
          </h2>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {rejeitados.map((t) => (
              <TemplateCard
                key={t.name}
                template={t}
                onDeletar={handleDeletar}
                deletando={deletando}
                isAdmin={isAdmin}
              />
            ))}
          </div>
        </section>
      )}

      {/* Dialog de novo template */}
      <NovoTemplateDialog
        open={novoAberto}
        onOpenChange={setNovoAberto}
        onSucesso={() => {
          qc.invalidateQueries({ queryKey: ["zernio-templates"] });
          setNovoAberto(false);
        }}
      />
    </div>
  );
}
