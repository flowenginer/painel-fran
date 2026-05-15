import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useConfig } from "@/hooks/useConfig";
import { useSaveConfig } from "@/hooks/useSaveConfig";
import { useToast } from "@/hooks/use-toast";
import { buscarNoCedrus } from "@/lib/cedrus";
import { supabase } from "@/lib/supabase";

type TestResult = "ok" | "erro" | "pendente" | null;

interface FormState {
  cedrus_apikey: string;
  cedrus_url_base: string;
  n8n_webhook_url: string;
  uazapi_webhook_url: string;
  uazapi_webhook_secret: string;
  limite_diario_disparos: string;
  horario_disparo_inicio: string;
  horario_disparo_fim: string;
}

const DEFAULTS: FormState = {
  cedrus_apikey: "",
  cedrus_url_base: "https://api.sistemadecobranca.com.br:3001/v1",
  n8n_webhook_url: "",
  uazapi_webhook_url: "",
  uazapi_webhook_secret: "",
  limite_diario_disparos: "40",
  horario_disparo_inicio: "08:00",
  horario_disparo_fim: "20:00",
};

export function Configuracoes() {
  const { data, isLoading } = useConfig();
  const { mutateAsync: salvar, isPending: salvando } = useSaveConfig();
  const { toast } = useToast();

  const [form, setForm] = useState<FormState>(DEFAULTS);
  const [showApiKey, setShowApiKey] = useState(false);
  const [sujo, setSujo] = useState(false);
  const [testCedrus, setTestCedrus] = useState<TestResult>(null);
  const [testN8n, setTestN8n] = useState<TestResult>(null);

  useEffect(() => {
    if (data) {
      setForm({
        cedrus_apikey: data.cedrus_apikey ?? "",
        cedrus_url_base: data.cedrus_url_base ?? DEFAULTS.cedrus_url_base,
        n8n_webhook_url: data.n8n_webhook_url ?? "",
        uazapi_webhook_url: data.uazapi_webhook_url ?? "",
        uazapi_webhook_secret: data.uazapi_webhook_secret ?? "",
        limite_diario_disparos:
          data.limite_diario_disparos ?? DEFAULTS.limite_diario_disparos,
        horario_disparo_inicio:
          data.horario_disparo_inicio ?? DEFAULTS.horario_disparo_inicio,
        horario_disparo_fim:
          data.horario_disparo_fim ?? DEFAULTS.horario_disparo_fim,
      });
      setSujo(false);
    }
  }, [data]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSujo(true);
  }

  async function handleSalvar() {
    const limite = Number(form.limite_diario_disparos);
    if (!Number.isInteger(limite) || limite <= 0) {
      toast({
        variant: "destructive",
        title: "Limite diário inválido",
        description: "Informe um número inteiro positivo.",
      });
      return;
    }
    const [iH, iM] = form.horario_disparo_inicio.split(":").map(Number);
    const [fH, fM] = form.horario_disparo_fim.split(":").map(Number);
    if (iH * 60 + iM >= fH * 60 + fM) {
      toast({
        variant: "destructive",
        title: "Horário inválido",
        description: "O início deve ser anterior ao fim.",
      });
      return;
    }

    try {
      await salvar([
        { chave: "cedrus_apikey", valor: form.cedrus_apikey.trim() },
        { chave: "cedrus_url_base", valor: form.cedrus_url_base.trim() },
        { chave: "n8n_webhook_url", valor: form.n8n_webhook_url.trim() },
        {
          chave: "uazapi_webhook_url",
          valor: form.uazapi_webhook_url.trim(),
        },
        {
          chave: "uazapi_webhook_secret",
          valor: form.uazapi_webhook_secret.trim(),
        },
        {
          chave: "limite_diario_disparos",
          valor: String(limite),
        },
        {
          chave: "horario_disparo_inicio",
          valor: form.horario_disparo_inicio,
        },
        { chave: "horario_disparo_fim", valor: form.horario_disparo_fim },
      ]);
      toast({ variant: "success", title: "Configurações salvas" });
      setSujo(false);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
    }
  }

  async function testarCedrus() {
    if (sujo) {
      toast({
        variant: "destructive",
        title: "Salve as configurações primeiro",
        description:
          "O teste usa os valores já persistidos no banco, não o formulário atual.",
      });
      return;
    }
    setTestCedrus("pendente");
    try {
      // Ping leve: busca com cod_credor improvável
      await buscarNoCedrus({ cod_credor: "_test_ping_", num_pagina: 1 });
      setTestCedrus("ok");
      toast({
        variant: "success",
        title: "Cedrus respondeu",
        description: "API acessível com a apikey atual.",
      });
    } catch (err) {
      setTestCedrus("erro");
      toast({
        variant: "destructive",
        title: "Falha no teste Cedrus",
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
    }
  }

  async function testarWebhook() {
    const url = form.n8n_webhook_url.trim();
    if (!url) {
      toast({
        variant: "destructive",
        title: "Informe a URL do webhook",
      });
      return;
    }
    setTestN8n("pendente");
    try {
      // Chamamos direto (o webhook n8n deve aceitar qualquer POST autenticado
      // ou não; o Stival pode colocar token na própria URL).
      const { data: sess } = await supabase.auth.getUser();
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teste: true,
          origem: "painel-fran",
          usuario: sess.user?.email ?? null,
        }),
      });
      if (resp.ok) {
        setTestN8n("ok");
        toast({
          variant: "success",
          title: "Webhook n8n respondeu",
          description: `HTTP ${resp.status}`,
        });
      } else {
        setTestN8n("erro");
        toast({
          variant: "destructive",
          title: `Webhook retornou HTTP ${resp.status}`,
        });
      }
    } catch (err) {
      setTestN8n("erro");
      toast({
        variant: "destructive",
        title: "Falha ao chamar webhook",
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">
          API keys, webhook n8n, limites e horários de disparo.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Integrações</CardTitle>
          <CardDescription>
            Credenciais usadas pelas Edge Functions. Mudanças só têm efeito
            depois de salvar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs">API Key do Cedrus</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showApiKey ? "text" : "password"}
                  value={form.cedrus_apikey}
                  onChange={(e) => set("cedrus_apikey", e.target.value)}
                  placeholder="••••••••••••"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showApiKey ? "Esconder" : "Mostrar"}
                >
                  {showApiKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              <Button
                variant="outline"
                onClick={testarCedrus}
                disabled={testCedrus === "pendente" || isLoading}
              >
                {testCedrus === "pendente" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <StatusIcon result={testCedrus} />
                )}
                <span className="ml-2">Testar</span>
              </Button>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">URL base da API Cedrus</Label>
            <Input
              value={form.cedrus_url_base}
              onChange={(e) => set("cedrus_url_base", e.target.value)}
              disabled={isLoading}
            />
          </div>

          <Separator />

          <div className="space-y-1">
            <Label className="text-xs">URL do webhook n8n</Label>
            <div className="flex gap-2">
              <Input
                className="flex-1"
                value={form.n8n_webhook_url}
                onChange={(e) => set("n8n_webhook_url", e.target.value)}
                placeholder="https://n8n.exemplo.com/webhook/..."
                disabled={isLoading}
              />
              <Button
                variant="outline"
                onClick={testarWebhook}
                disabled={testN8n === "pendente" || isLoading}
              >
                {testN8n === "pendente" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <StatusIcon result={testN8n} />
                )}
                <span className="ml-2">Testar</span>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Envia POST com &#123; teste: true &#125; para verificar
              acessibilidade.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>WhatsApp (UAZAPI via n8n)</CardTitle>
          <CardDescription>
            Webhook do workflow no n8n que proxia o acesso à UAZAPI. Use a
            mesma URL gerada pelo nó Webhook do workflow "Painel Fran ⇄
            UAZAPI" e o mesmo SECRET configurado lá.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs">URL do webhook UAZAPI no n8n</Label>
            <Input
              value={form.uazapi_webhook_url}
              onChange={(e) => set("uazapi_webhook_url", e.target.value)}
              placeholder="https://nwh.chelsan.com.br/webhook/painel-fran-uazapi"
              disabled={isLoading}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Secret (X-Painel-Secret)</Label>
            <Input
              type="password"
              value={form.uazapi_webhook_secret}
              onChange={(e) =>
                set("uazapi_webhook_secret", e.target.value)
              }
              placeholder="Mesmo valor configurado no n8n"
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              Deve ser igual ao valor verificado pelo nó "Validar Secret"
              do workflow. Trate como senha — não compartilhe.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Disparo</CardTitle>
          <CardDescription>
            Limite diário e janela de horário permitido (America/Sao_Paulo).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs">Limite diário</Label>
              <Input
                type="number"
                min={1}
                value={form.limite_diario_disparos}
                onChange={(e) => set("limite_diario_disparos", e.target.value)}
                disabled={isLoading}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Horário início</Label>
              <Input
                type="time"
                value={form.horario_disparo_inicio}
                onChange={(e) => set("horario_disparo_inicio", e.target.value)}
                disabled={isLoading}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Horário fim</Label>
              <Input
                type="time"
                value={form.horario_disparo_fim}
                onChange={(e) => set("horario_disparo_fim", e.target.value)}
                disabled={isLoading}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button onClick={handleSalvar} disabled={!sujo || salvando}>
          {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar configurações
        </Button>
      </div>
    </div>
  );
}

function StatusIcon({ result }: { result: TestResult }) {
  if (result === "ok") return <span className="text-green-500">✓</span>;
  if (result === "erro") return <span className="text-destructive">✕</span>;
  return <span className="text-muted-foreground">•</span>;
}
