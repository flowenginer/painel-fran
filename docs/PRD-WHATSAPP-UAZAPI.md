# PRD — Integração WhatsApp via UAZAPI + n8n Proxy

**Versão:** 1.0
**Data:** 2026-05-15
**Status:** Implementado e em produção (painel-fran v1.x)

---

## Sumário

1. [Contexto e Objetivo](#1-contexto-e-objetivo)
2. [Arquitetura](#2-arquitetura)
3. [Justificativa Técnica](#3-justificativa-técnica)
4. [Pré-requisitos](#4-pré-requisitos)
5. [Backlog de Tasks](#5-backlog-de-tasks)
6. [Contratos de API](#6-contratos-de-api)
7. [Schema e Configuração](#7-schema-e-configuração)
8. [Verificação End-to-End](#8-verificação-end-to-end)
9. [Troubleshooting](#9-troubleshooting)
10. [Anexos — Código de Referência](#10-anexos--código-de-referência)

---

## 1. Contexto e Objetivo

### O problema
Sistemas web que usam a [UAZAPI](https://uazapi.dev) para WhatsApp Business precisam permitir que o usuário **conecte/desconecte o WhatsApp diretamente pela interface**, sem precisar acessar o painel da UAZAPI separadamente. Isso envolve:

- Mostrar o **status atual** da conexão
- Exibir o **QR Code** na tela quando necessário reconectar
- **Atualizar automaticamente** quando o WhatsApp for escaneado/desconectado
- Permitir **forçar desconexão** com confirmação

### A complicação
A UAZAPI restringe o acesso por **allowlist de IPs**. Apenas hosts autorizados (geralmente o servidor onde rodam workflows automatizados como n8n) podem fazer chamadas. Edge Functions (Supabase/Vercel) **não têm IP fixo** — então uma chamada direta do backend serverless é bloqueada com `HTTP 403 host_not_allowed`.

### A solução
Usar uma instância de **n8n já autorizada** na allowlist como **proxy intermediário**. O fluxo fica:

```
Painel Web → Edge Function (autentica usuário) → Webhook n8n (IP autorizado) → UAZAPI
```

### Resultado esperado
Uma página dedicada (ex: `/whatsapp`) que exibe:
- Avatar, nome do perfil e telefone conectado
- Estado da conexão com badge colorido
- QR Code embutido quando em processo de pareamento
- Botões contextuais (Conectar / Gerar novo QR / Desconectar)
- Atualização automática com polling adaptativo (2.5s durante pareamento, 30s em estado estável)

---

## 2. Arquitetura

### Diagrama de alto nível

```
┌──────────────────────────────────────────────────────────────────┐
│                          NAVEGADOR                               │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  Página /whatsapp                                        │    │
│  │  - Card de status (avatar, telefone, badge)              │    │
│  │  - QR Code via <img src="data:image/png;base64,...">     │    │
│  │  - Botões: Conectar / Desconectar                        │    │
│  │  - useQuery com refetchInterval adaptativo               │    │
│  └──────────────────────────────────────────────────────────┘    │
└───────────────────────────────┬──────────────────────────────────┘
                                │
                                │ supabase.functions.invoke
                                │ Authorization: Bearer <user_jwt>
                                │ body: { acao: "status"|"connect"|"disconnect" }
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│              SUPABASE EDGE FUNCTION  uazapi-proxy                │
│  - Valida JWT do operador                                        │
│  - Lê uazapi_webhook_url e uazapi_webhook_secret de fran_config  │
│  - Repassa POST para o webhook do n8n com X-Painel-Secret        │
│  - Desencapsula array que o n8n devolve ([0])                    │
│  - Trata timeout, erros 4xx/5xx do n8n                           │
└───────────────────────────────┬──────────────────────────────────┘
                                │ HTTP POST
                                │ Header X-Painel-Secret: <secret>
                                │ Body: { acao }
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│       N8N WORKFLOW "Painel ⇄ UAZAPI"   (IP autorizado)           │
│                                                                  │
│  [Webhook POST] → [Valida Secret IF]                             │
│                       ├─ TRUE  → [Switch acao]                   │
│                       │             ├─ status     → [GET status] │
│                       │             ├─ connect    → [POST conn]  │
│                       │             └─ disconnect → [POST disc]  │
│                       │                  ↓                       │
│                       │         [Normaliza Code]                 │
│                       │                  ↓                       │
│                       │         [Respond Webhook]                │
│                       │                                          │
│                       └─ FALSE → [401 Unauthorized]              │
└───────────────────────────────┬──────────────────────────────────┘
                                │ Header token: <instance_token>
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│                          UAZAPI v2                               │
│              <subdomain>.uazapi.com (allowlist por IP)           │
│  - GET  /instance/status                                         │
│  - POST /instance/connect                                        │
│  - POST /instance/disconnect                                     │
└──────────────────────────────────────────────────────────────────┘
```

### Camadas de segurança

| Camada | Proteção |
|---|---|
| Navegador → Edge Function | JWT do operador (obrigatório, validado server-side) |
| Edge Function → n8n | `X-Painel-Secret` header (segredo nunca toca o frontend) |
| n8n → UAZAPI | IP autorizado na allowlist + `token` da instância |

---

## 3. Justificativa Técnica

### Por que não chamar UAZAPI direto do navegador?
- A UAZAPI bloqueia por IP (allowlist). Browsers têm IPs voláteis de clientes finais — inviável autorizar.
- Token da instância ficaria exposto no JavaScript.
- CORS provavelmente não está habilitado para `*`.

### Por que não chamar UAZAPI direto do Supabase Edge?
- Edge Functions rodam em pool dinâmico AWS — IPs imprevisíveis e mutáveis.
- Adicionar todos os ranges da AWS Lambda equivale a desativar a allowlist (perde valor).

### Por que usar n8n como proxy em vez de criar um proxy próprio?
| Opção | Vantagem | Desvantagem |
|---|---|---|
| **n8n existente** (escolhida) | Reaproveita infra que já está rodando e autorizada. Visual e fácil de manter. | Acopla 1 dependência adicional na cadeia (mas que já era usada). |
| Microserviço Express dedicado | Mais isolado | Novo container pra manter, mesmo IP do n8n. |
| Pedir pro provedor UAZAPI desativar allowlist | Caminho mais direto | Perde uma camada de defesa. Dependência humana. |

**Decisão:** usar o n8n como proxy. Curva de adoção zero, infra já existe.

---

## 4. Pré-requisitos

### Do lado da UAZAPI
- Conta ativa em `<subdomain>.uazapi.com`
- Instância criada e funcionando (você já usa para enviar mensagens via outro fluxo automatizado, por exemplo)
- **Token da instância** (vem da própria UAZAPI)
- IP do servidor que hospeda o n8n **já liberado** na allowlist (confirme com o provedor)

### Do lado do n8n
- Instância rodando em servidor com IP fixo, autorizado na UAZAPI
- Workflows habilitados, webhook em modo `Production URL` ativo
- (Opcional) Nó **Code** habilitado nas community packages

### Do lado do backend (Supabase usado como exemplo)
- Tabela tipo chave-valor para guardar configurações (ex: `fran_config`)
- Função de Edge habilitada
- Auth com JWT já funcional

### Do lado do frontend
- React (ou outro) + cliente do backend (ex: `@supabase/supabase-js`)
- TanStack Query (ou equivalente para polling)
- Sistema de roteamento e layout já estabelecido

---

## 5. Backlog de Tasks

### FASE 1 — Workflow n8n (~30 min)

#### TASK-W01: Gerar segredo compartilhado
**Critérios:**
- [ ] Gerar string aleatória com 64 caracteres hex (ex: `openssl rand -hex 32`)
- [ ] Guardar em local seguro (vai ser usado nos passos seguintes)

#### TASK-W02: Criar workflow "Painel ⇄ UAZAPI"
**Critérios:**
- [ ] Workflow novo criado no n8n com nome descritivo
- [ ] Configurar `Workflow → Settings → Save successful executions` se quiser logs

#### TASK-W03: Nó Webhook
**Critérios:**
- [ ] Type: `Webhook`
- [ ] Method: `POST`
- [ ] Path: identificador único, ex: `painel-fran-uazapi`
- [ ] Respond: `Using 'Respond to Webhook' node`
- [ ] Copiar a **Production URL** gerada (será usada no backend)

#### TASK-W04: Nó IF "Validar Secret"
**Critérios:**
- [ ] Type: `IF`
- [ ] Condition: `{{ $json.headers['x-painel-secret'] }}` is equal to `<SECRET>`
- [ ] Conectar saída **TRUE** ao Switch (próximo)
- [ ] Conectar saída **FALSE** a um `Respond to Webhook` com 401:
  - Body: `{ "ok": false, "erro": "Secret inválido" }`
  - Status Code: 401

#### TASK-W05: Nó Switch "Acao"
**Critérios:**
- [ ] Type: `Switch`
- [ ] Mode: `Rules` (não Expression — esse exige índice numérico)
- [ ] 3 regras (case-sensitive, string equals):
  - Output 0: `{{ $json.body.acao }} == "status"`
  - Output 1: `{{ $json.body.acao }} == "connect"`
  - Output 2: `{{ $json.body.acao }} == "disconnect"`
- [ ] (Opcional) Renomear outputs para legibilidade

#### TASK-W06: 3 nós HTTP Request para UAZAPI
**Critérios — para cada um:**
- [ ] Type: `HTTP Request`
- [ ] Send Headers: ✅
- [ ] Header: `Name=token`, `Value=<TOKEN_DA_INSTANCIA>`

| Branch | Method | URL |
|---|---|---|
| Status | `GET` | `<UAZAPI_URL_BASE>/instance/status` |
| Connect | `POST` | `<UAZAPI_URL_BASE>/instance/connect` |
| Disconnect | `POST` | `<UAZAPI_URL_BASE>/instance/disconnect` |

#### TASK-W07: Nó Code "Normalizar"
**Critérios:**
- [ ] Type: `Code`
- [ ] Mode: `Run Once for Each Item`
- [ ] Language: JavaScript
- [ ] Os 3 HTTP Requests da TASK-W06 convergem nesse nó
- [ ] Código transforma o array `[{instance, status}]` da UAZAPI em formato estável (ver Anexo A)

#### TASK-W08: Nó Respond final
**Critérios:**
- [ ] Type: `Respond to Webhook`
- [ ] Respond With: `JSON`
- [ ] Response Body: `={{ $json }}`
- [ ] Conectado depois do Normalizar

#### TASK-W09: Ativar e testar via curl
**Critérios:**
- [ ] Workflow ativado (toggle ON no topo)
- [ ] Testar com curl direto (ver Anexo B), retorno deve ter `ok: true` e dados do perfil
- [ ] Testar com secret errado: deve voltar 401
- [ ] Testar com ação inválida: deve cair em "no match" do switch (ver TASK-W10)

#### TASK-W10 (opcional): Branch "default" para ação inválida
**Critérios:**
- [ ] Switch configurado com saída "fallback" (n8n: marca "Fallback Output")
- [ ] Conecta em `Respond to Webhook` com 400 e mensagem clara

---

### FASE 2 — Backend (Edge Function ou equivalente) (~30 min)

#### TASK-B01: Adicionar chaves de configuração
**Critérios:**
- [ ] Tabela tipo chave-valor com 2 entradas novas:
  - `uazapi_webhook_url`: URL do webhook gerada na TASK-W03
  - `uazapi_webhook_secret`: o segredo gerado na TASK-W01
- [ ] Acesso restrito (RLS / role policy)

#### TASK-B02: Edge Function `uazapi-proxy`
**Critérios:**
- [ ] Recebe `POST` com body `{ acao: "status" | "connect" | "disconnect" }`
- [ ] Valida JWT do usuário (rejeita 401 sem)
- [ ] Lê as 2 configs do banco via service role
- [ ] Encaminha para o webhook do n8n com header `X-Painel-Secret`
- [ ] Desencapsula array retornado pelo n8n (`[0]`)
- [ ] Trata: timeout (504), URL/secret faltando (400), erro do n8n (502)
- [ ] CORS habilitado para o domínio do painel
- [ ] Mensagens de erro descritivas no body da resposta

Ver código completo no Anexo C.

#### TASK-B03: Deploy e teste isolado
**Critérios:**
- [ ] Função deployada e visível em `functions list`
- [ ] Curl autenticado direto na função retorna o mesmo JSON do n8n
- [ ] Logs estruturados aparecem no dashboard de logs

---

### FASE 3 — Frontend (~1h)

#### TASK-F01: Cliente HTTP tipado
**Critérios:**
- [ ] Arquivo `lib/uazapi.ts` com função `invocarProxy(acao)`
- [ ] Anexa JWT da sessão atual no Authorization
- [ ] Extrai mensagem de erro do body em caso de falha
- [ ] Tipo `WhatsappStatus` exportado para reuso

Ver código no Anexo D.

#### TASK-F02: Hook de status com polling adaptativo
**Critérios:**
- [ ] `useWhatsappStatus` baseado em TanStack Query (ou equivalente)
- [ ] `refetchInterval`: 2.5s quando `estado === "connecting"`, 30s caso contrário
- [ ] `refetchOnWindowFocus: true`

Ver código no Anexo E.

#### TASK-F03: Hooks de mutation
**Critérios:**
- [ ] `useConectar` chama `connect`, atualiza cache otimista, invalida status
- [ ] `useDesconectar` idem para `disconnect`

#### TASK-F04: Página dedicada (ex: `/whatsapp`)
**Critérios:**
- [ ] Card principal de status com:
  - [ ] Avatar (`profilePicUrl` ou fallback com iniciais)
  - [ ] Nome do perfil + badge "Business" se aplicável
  - [ ] Telefone formatado
  - [ ] Identificador da instância
- [ ] Badge colorido por estado:
  - [ ] Verde + ✓ — Conectado
  - [ ] Azul + spinner — Conectando
  - [ ] Vermelho + ✕ — Desconectado
- [ ] Quando `connecting` + tem `qrcode`:
  - [ ] Mostra `<img src={qrcode}>` em 256×256
  - [ ] Texto explicando como escanear
  - [ ] Aviso de expiração em ~60s
- [ ] Quando `disconnected`:
  - [ ] Mostra última desconexão (tempo relativo) e motivo
  - [ ] Botão primário "Conectar WhatsApp"
- [ ] Quando `connected`:
  - [ ] Banner verde "Conexão ativa"
  - [ ] Botão "Desconectar" (vermelho) **com confirmação** em modal
- [ ] Botão "Atualizar" no header (refetch manual)
- [ ] Loading state com skeleton
- [ ] Error state com mensagem da API

Ver código no Anexo F.

#### TASK-F05: Integração na navegação
**Critérios:**
- [ ] Item "WhatsApp" adicionado na sidebar com ícone apropriado (ex: `Smartphone`)
- [ ] Rota protegida `/whatsapp` no router
- [ ] Card explicativo na tela de Configurações com os 2 campos (URL + secret)

---

## 6. Contratos de API

### 6.1 Endpoints UAZAPI v2

| Endpoint | Método | Auth | Resposta |
|---|---|---|---|
| `/instance/status` | GET | Header `token` | array `[{instance, status}]` |
| `/instance/connect` | POST | Header `token` | array `[{connected, instance, response, status}]` |
| `/instance/disconnect` | POST | Header `token` | array `[{instance, status}]` |

#### Campos relevantes em `instance`
```typescript
{
  id: string;
  token: string;
  status: "disconnected" | "connecting" | "connected";
  name: string;            // label da instância
  qrcode: string;          // "data:image/png;base64,..." quando connecting
  paircode: string;
  profileName: string;
  profilePicUrl: string;
  isBusiness: boolean;
  owner: string;           // telefone E.164 sem +
  current_presence: "available" | "unavailable";
  lastDisconnect: string;  // ISO timestamp
  lastDisconnectReason: string;
  // ... outros campos administrativos
}
```

### 6.2 Webhook n8n

#### Request
```http
POST <WEBHOOK_URL>
Content-Type: application/json
X-Painel-Secret: <SECRET>

{ "acao": "status" | "connect" | "disconnect" }
```

#### Response (normalizada pelo Code node)
```json
{
  "ok": true,
  "estado": "disconnected",
  "nome_instancia": "qi06bK",
  "telefone": "556291507974",
  "nome_perfil": "Empresa X",
  "foto_perfil": "https://pps.whatsapp.net/...",
  "qrcode": "data:image/png;base64,..." | null,
  "paircode": null,
  "ultima_desconexao": "2026-05-15T16:19:30.120Z",
  "motivo_desconexao": "QR Code timeout",
  "current_presence": "unavailable",
  "is_business": true
}
```

#### Erros
- `401 { ok: false, erro: "Secret inválido" }` — header `X-Painel-Secret` errado/ausente

### 6.3 Edge Function `uazapi-proxy`

#### Request
```http
POST /functions/v1/uazapi-proxy
Authorization: Bearer <USER_JWT>
Content-Type: application/json

{ "acao": "status" | "connect" | "disconnect" }
```

#### Response
Mesmo formato do webhook n8n (já desencapsulado).

#### Erros
- `401 { error: "Header Authorization ausente" }`
- `401 { error: "Sessão inválida ou expirada..." }`
- `400 { error: "Ação inválida..." }`
- `400 { error: "URL do webhook UAZAPI não configurada..." }`
- `400 { error: "Secret do webhook UAZAPI não configurado..." }`
- `502 { error: "Falha de rede ao chamar webhook: ..." }`
- `502 { error: "Webhook n8n retornou HTTP <status>" }`
- `504 { error: "Timeout ao chamar webhook n8n" }`

---

## 7. Schema e Configuração

### Entradas em `fran_config` (ou tabela equivalente)

```sql
INSERT INTO fran_config (chave, valor, descricao) VALUES
  ('uazapi_webhook_url',    '<URL_DO_WEBHOOK_N8N>',    'URL do webhook UAZAPI no n8n'),
  ('uazapi_webhook_secret', '<SECRET_64_HEX>',         'Header X-Painel-Secret enviado ao n8n')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor;
```

### Variáveis sensíveis (resumo)

| Onde guarda | O que | Quem usa |
|---|---|---|
| `fran_config.uazapi_webhook_url` | URL do webhook n8n | Edge Function |
| `fran_config.uazapi_webhook_secret` | Secret X-Painel-Secret | Edge Function envia, n8n valida |
| Workflow n8n (nó IF) | Mesmo secret acima (hardcoded) | n8n |
| Workflow n8n (nó HTTP Request) | Token da instância UAZAPI | n8n |
| Provedor UAZAPI | Allowlist de IPs | Servidor onde roda o n8n |

---

## 8. Verificação End-to-End

### Passo 1 — Curl direto na UAZAPI a partir do n8n
- Execute o nó HTTP Request manualmente
- Resposta deve vir com `status` e dados da instância

### Passo 2 — Curl no webhook do n8n
```bash
curl -X POST "<WEBHOOK_URL>" \
  -H "Content-Type: application/json" \
  -H "X-Painel-Secret: <SECRET>" \
  -d '{"acao":"status"}'
```
Esperado: JSON normalizado com `ok: true`.

### Passo 3 — Curl na Edge Function
```bash
export JWT="<user_jwt_da_sessao>"

curl -i -X POST "<BACKEND_URL>/functions/v1/uazapi-proxy" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"acao":"status"}'
```
Esperado: HTTP 200 com o mesmo JSON normalizado.

### Passo 4 — UI
- Abrir `/whatsapp` no painel logado
- Conferir avatar, telefone, badge
- Clicar "Conectar" → QR aparece em ≤3s
- Escanear → status muda para "Conectado" em até 5s sem reload

### Passo 5 — Polling adaptativo
- Em DevTools → Network, filtrar por `uazapi-proxy`
- Em estado normal: 1 request a cada ~30s
- Após clicar Conectar: 1 request a cada ~2.5s
- Após conectar: volta para 30s

---

## 9. Troubleshooting

### "Failed to send a request to the Edge Function"
- Confira `supabase functions list` — a função foi deployada?
- Confira variáveis de ambiente do projeto (URL base do backend)
- Frontend foi redeployado depois de criar a função?

### `HTTP 403 host_not_allowed` em curl direto na UAZAPI
- Esperado se chamando de qualquer host fora da allowlist
- Não é problema — o n8n está na lista, é por isso que o proxy funciona

### Resposta normalizada com `ok: true` mas todos os campos `null`
- Geralmente é problema no nó Normalizar lendo errado o array
- Confira em `Run Once for Each Item` e o código testa `Array.isArray($input.item.json)`

### `HTTP 401` da Edge Function em direção ao n8n
- Secret nas duas pontas não bate **caractere a caractere**
- Confira `length(valor)` no SQL — deve ser exatamente 64 (hex puro)
- Verifique se não copiou espaço/quebra de linha junto

### Switch v3 com erro "Output expects a number but got 'status'"
- O modo `Expression` espera índice numérico — troque para `Rules`
- Em cada Rule, escolha operação `string is equal to`

### QR Code não aparece após clicar Conectar
- Verifique o nó Normalizar: campo `qrcode` precisa vir do `instance.qrcode` da UAZAPI
- O QR demora 1-3s pra ser gerado — polling de 2.5s deve pegar na segunda chamada

### Status fica preso em "connecting" mesmo após escanear
- O QR expirou (60s default da UAZAPI)
- Clicar "Gerar novo QR Code" novamente

### Toast "Webhook n8n retornou HTTP 500"
- Workflow no n8n quebrou em algum nó
- Vá em `Executions` no n8n, encontre a falha, clique nela
- Veja qual nó vermelho e o erro específico

---

## 10. Anexos — Código de Referência

### Anexo A — Código do nó Normalizar (n8n)

```javascript
// Normaliza resposta da UAZAPI v2 num formato estável p/ o painel.
const raw = Array.isArray($input.item.json) ? $input.item.json[0] : $input.item.json;
const inst = raw.instance || raw;

return {
  ok: true,
  estado: inst.status || (raw.connected ? 'connected' : 'disconnected'),
  nome_instancia: inst.name ?? null,
  telefone: inst.owner ?? null,
  nome_perfil: inst.profileName ?? null,
  foto_perfil: inst.profilePicUrl ?? null,
  qrcode: inst.qrcode || null,
  paircode: inst.paircode || null,
  ultima_desconexao: inst.lastDisconnect ?? null,
  motivo_desconexao: inst.lastDisconnectReason ?? null,
  current_presence: inst.current_presence ?? null,
  is_business: inst.isBusiness ?? null,
};
```

### Anexo B — Teste do webhook n8n

```bash
# Status
curl -X POST "<WEBHOOK_URL>" \
  -H "Content-Type: application/json" \
  -H "X-Painel-Secret: <SECRET>" \
  -d '{"acao":"status"}'

# Connect (gera QR)
curl -X POST "<WEBHOOK_URL>" \
  -H "Content-Type: application/json" \
  -H "X-Painel-Secret: <SECRET>" \
  -d '{"acao":"connect"}'

# Disconnect
curl -X POST "<WEBHOOK_URL>" \
  -H "Content-Type: application/json" \
  -H "X-Painel-Secret: <SECRET>" \
  -d '{"acao":"disconnect"}'
```

### Anexo C — Edge Function `uazapi-proxy` (Deno/Supabase)

Estrutura mínima do arquivo (omitido o boilerplate compartilhado de auth e config; ver `supabase/functions/_shared/`):

```typescript
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { lerConfig, lerEnv, validarJwt } from "../_shared/supabase-rest.ts";

type Acao = "status" | "connect" | "disconnect";
const ACOES = ["status", "connect", "disconnect"] as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Método não permitido" }, 405);

  try {
    const env = lerEnv();
    const auth = req.headers.get("Authorization");
    if (!auth) return jsonResponse({ error: "Header Authorization ausente" }, 401);
    await validarJwt(env, auth);

    const body = await req.json().catch(() => null);
    const acao = String(body?.acao ?? "");
    if (!ACOES.includes(acao as Acao)) {
      return jsonResponse({ error: `Ação inválida. Use: ${ACOES.join(", ")}` }, 400);
    }

    const cfg = await lerConfig(env, ["uazapi_webhook_url", "uazapi_webhook_secret"]);
    if (!cfg.uazapi_webhook_url) return jsonResponse({ error: "URL não configurada" }, 400);
    if (!cfg.uazapi_webhook_secret) return jsonResponse({ error: "Secret não configurado" }, 400);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30_000);
    const resp = await fetch(cfg.uazapi_webhook_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Painel-Secret": cfg.uazapi_webhook_secret,
      },
      body: JSON.stringify({ acao }),
      signal: ctrl.signal,
    }).finally(() => clearTimeout(timer));

    const texto = await resp.text();
    const json = texto ? JSON.parse(texto) : null;
    if (!resp.ok) {
      return jsonResponse({ error: `Webhook retornou ${resp.status}`, detail: json }, 502);
    }

    // n8n responde em array de 1 item — desencapsula
    return jsonResponse(Array.isArray(json) ? json[0] : json);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/AbortError|timeout/i.test(msg)) return jsonResponse({ error: "Timeout" }, 504);
    return jsonResponse({ error: msg }, 500);
  }
});
```

### Anexo D — Cliente TypeScript

```typescript
import { supabase } from "./supabase";

export type EstadoWhatsapp = "connected" | "connecting" | "disconnected" | string;

export interface WhatsappStatus {
  ok: boolean;
  estado: EstadoWhatsapp;
  nome_instancia: string | null;
  telefone: string | null;
  nome_perfil: string | null;
  foto_perfil: string | null;
  qrcode: string | null;
  paircode: string | null;
  ultima_desconexao: string | null;
  motivo_desconexao: string | null;
  current_presence: string | null;
  is_business: boolean | null;
}

async function invocarProxy(acao: "status" | "connect" | "disconnect"): Promise<WhatsappStatus> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Sessão expirou.");

  const { data, error } = await supabase.functions.invoke<WhatsappStatus>(
    "uazapi-proxy",
    {
      body: { acao },
      headers: { Authorization: `Bearer ${session.access_token}` },
    }
  );

  if (error) {
    // Extrai mensagem do body de erro da Edge Function
    const ctx = (error as { context?: Response }).context;
    if (ctx) {
      try {
        const body = await ctx.json();
        if (body?.error) throw new Error(body.error);
      } catch {}
    }
    throw new Error(error instanceof Error ? error.message : "Falha");
  }
  if (!data) throw new Error("Resposta vazia");
  return data;
}

export const uazapi = {
  status: () => invocarProxy("status"),
  connect: () => invocarProxy("connect"),
  disconnect: () => invocarProxy("disconnect"),
};
```

### Anexo E — Hook de status com polling adaptativo (TanStack Query v5)

```typescript
import { useQuery } from "@tanstack/react-query";
import { uazapi, type WhatsappStatus } from "@/lib/uazapi";

export function useWhatsappStatus() {
  return useQuery<WhatsappStatus>({
    queryKey: ["whatsapp", "status"],
    queryFn: () => uazapi.status(),
    refetchInterval: (query) => {
      const estado = query.state.data?.estado;
      if (estado === "connecting") return 2_500;
      return 30_000;
    },
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
}
```

### Anexo F — Esqueleto da página

```tsx
export function Whatsapp() {
  const { data, isLoading, refetch, isFetching } = useWhatsappStatus();
  const { mutateAsync: conectar } = useConectarWhatsapp();
  const { mutateAsync: desconectar } = useDesconectarWhatsapp();
  const [confirmandoDisconnect, setConfirmandoDisconnect] = useState(false);

  const conectado = data?.estado === "connected";
  const conectando = data?.estado === "connecting";

  return (
    <div className="space-y-6">
      {/* Header com botão Atualizar */}
      {/* Card de identificação (avatar, telefone, badge) */}
      {/* Badge de estado */}
      {/* Se connecting + qrcode: <img src={data.qrcode}> */}
      {/* Se disconnected: motivo + botão Conectar */}
      {/* Se connected: botão Desconectar (com modal de confirmação) */}
    </div>
  );
}
```

---

## Resumo executivo

| Item | Valor |
|---|---|
| **Tempo estimado** | 2 a 3 horas (workflow + backend + UI completa) |
| **Custo de infra extra** | Zero — usa n8n e backend já existentes |
| **Dependências novas** | Nenhuma — só código novo |
| **Risco para fluxos existentes** | Nulo — integração isolada da Fran/disparos |
| **Manutenibilidade** | Alta — cada camada tem 1 responsabilidade clara |
| **Reusabilidade** | Alta — pode ser adaptado a qualquer projeto que tenha n8n na allowlist da UAZAPI |

---

**Fim do PRD**
