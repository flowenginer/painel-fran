# Integração Zernio — Painel Fran

Documentação completa da integração do canal oficial WhatsApp Business (Meta Cloud API) via Zernio no Painel Fran (Stival Advogados).

---

## Índice

1. [Visão Geral](#visão-geral)
2. [Arquitetura](#arquitetura)
3. [Configuração Inicial](#configuração-inicial)
4. [O que foi implementado](#o-que-foi-implementado)
   - [Etapa 1 — Banco de dados](#etapa-1--banco-de-dados)
   - [Etapa 2 — Webhook inbound](#etapa-2--webhook-inbound)
   - [Etapa 3 — Envio outbound](#etapa-3--envio-outbound)
   - [Etapa 4 — Templates](#etapa-4--templates)
   - [Etapa 5 — Status da conta (WhatsApp)](#etapa-5--status-da-conta-whatsapp)
   - [Etapa 6 — Roteamento automático](#etapa-6--roteamento-automático)
   - [Etapa 7 — Configurações pelo painel](#etapa-7--configurações-pelo-painel)
5. [O que falta — Etapa 8 (Broadcasts)](#o-que-falta--etapa-8-broadcasts)
6. [Documentação da API Zernio](#documentação-da-api-zernio)
7. [Secrets das Edge Functions](#secrets-das-edge-functions)
8. [Como trocar o número conectado](#como-trocar-o-número-conectado)
9. [Estrutura de arquivos](#estrutura-de-arquivos)

---

## Visão Geral

O Painel Fran agora opera com **dois canais de WhatsApp em paralelo**:

| Canal | Provedor | Uso |
|---|---|---|
| **API não-oficial** | UAZAPI via n8n | Conversas em andamento, reenvios, fila de disparo |
| **API oficial** | Zernio (Meta Cloud API) | Templates aprovados, broadcasts, primeiro contato oficial |

O roteamento é **automático e transparente** — o operador não precisa escolher o canal. O sistema detecta pelo telefone qual canal usar ao responder.

---

## Arquitetura

```
Lead → WhatsApp Oficial
         ↓
   Zernio recebe
         ↓
   webhook POST → supabase/functions/zernio-webhook
         ↓
   fran_memory (session_id = telefone)
   fran_zernio_conversas (telefone ↔ conversationId)
         ↓
   Operador vê na tela /conversas (igual UAZAPI)
         ↓
   Operador responde → src/lib/mensagens.ts
         ↓
   [verifica fran_zernio_conversas]
         ↓
   tem registro? → supabase/functions/zernio-enviar → Zernio API
   não tem?     → supabase/functions/enviar-mensagem → UAZAPI via n8n
```

---

## Configuração Inicial

### Pré-requisitos

- Conta Zernio criada em [zernio.com](https://zernio.com)
- Número WhatsApp Business conectado via Embedded Signup no Zernio
- Supabase project: `dmvauscmvjycwugborjn`
- Projeto React/Vite deployado na Vercel

### Valores necessários

| Dado | Onde encontrar | Chave no banco |
|---|---|---|
| API Key | Zernio → API Keys | `zernio_api_key` |
| Account ID (WABA) | Zernio → Connections → WhatsApp → Info → Business Account → Account ID | `zernio_account_id` |
| Profile ID | `GET https://zernio.com/api/v1/profiles` | `zernio_profile_id` |
| Webhook Secret | Zernio → Settings → Webhooks → Secret Key | `ZERNIO_WEBHOOK_SECRET` (Secret da Edge Function) |

### Secrets das Edge Functions (Supabase)

Acesse: Supabase Dashboard → Edge Functions → Secrets

| Secret | Descrição |
|---|---|
| `ZERNIO_WEBHOOK_SECRET` | Usado para verificar assinatura HMAC dos webhooks do Zernio |

> **Atenção:** `ZERNIO_API_KEY`, `ZERNIO_ACCOUNT_ID` e `ZERNIO_PROFILE_ID` foram migrados para a tabela `fran_config` e são gerenciados pelo painel em **Configurações → Zernio**. Os Secrets das Edge Functions servem apenas como fallback.

### Webhook no Zernio

Configure em **Zernio → Settings → Webhooks**:

- **URL:** `https://dmvauscmvjycwugborjn.supabase.co/functions/v1/zernio-webhook`
- **Eventos a ativar:**
  - `message.received`
  - `message.delivered`
  - `message.read`
  - `whatsapp.template.status_updated`
- **Secret Key:** mesmo valor salvo como `ZERNIO_WEBHOOK_SECRET` no Supabase

> O evento `webhook.test` é isento de verificação de assinatura (o Zernio não assina pings de teste).

---

## O que foi implementado

### Etapa 1 — Banco de dados

**Arquivo:** `supabase/migrations/0017_zernio_canal.sql`

O que foi criado:

- **`fran_canais`** — adicionados dois campos:
  - `tipo TEXT` (`'uazapi'` | `'zernio'`) — identifica o provedor do canal. Default `'uazapi'` para não quebrar canais existentes.
  - `zernio_account_id TEXT` — ID da conta no Zernio.

- **`fran_zernio_conversas`** — nova tabela que mapeia `telefone ↔ zernio_conversation_id`:
  ```sql
  telefone               TEXT NOT NULL
  zernio_conversation_id TEXT NOT NULL
  zernio_account_id      TEXT NOT NULL
  created_at / updated_at TIMESTAMPTZ
  ```
  Índice único em `(telefone, zernio_account_id)`. RLS ativa — leitura por autenticado, escrita por `service_role`.

- **`fran_zernio_upsert_conversa(p_telefone, p_conversation_id, p_account_id)`** — função helper chamada pelo webhook ao receber mensagem. Faz upsert do mapeamento.

- **`fran_zernio_conversa_id(p_telefone, p_account_id)`** — função helper chamada pelo `zernio-enviar` para buscar o `conversationId` antes de responder.

**Migration da configuração:** `supabase/migrations/0018_zernio_config.sql`

Insere na `fran_config`:
- `zernio_api_key`
- `zernio_account_id`
- `zernio_profile_id`

---

### Etapa 2 — Webhook inbound

**Arquivo:** `supabase/functions/zernio-webhook/index.ts`

Recebe eventos do Zernio e processa mensagens recebidas.

**Fluxo:**
1. Verifica assinatura HMAC-SHA256 (header `X-Zernio-Signature`, hex puro sem prefixo)
2. `webhook.test` → responde 200 imediatamente (sem verificar assinatura)
3. `message.received` → extrai telefone, `conversationId` e `accountId`
4. Faz upsert em `fran_zernio_conversas` (mapeamento para envio futuro)
5. Grava na `fran_memory` com `type: "human"` e `canal: "zernio:{accountId}"`

**Suporte a tipos de mensagem:** texto, imagem, áudio, documento, vídeo, sticker, localização, contato, interativo.

**Configurações lidas:** `zernio_account_id` e `zernio_webhook_secret` da `fran_config` (fallback para Secrets).

---

### Etapa 3 — Envio outbound

**Arquivo:** `supabase/functions/zernio-enviar/index.ts`

Envia mensagens via API oficial para leads que entraram pelo canal Zernio.

**Fluxo:**
1. Autentica operador via JWT Supabase
2. Valida permissão (admin ou responsável pela conversa)
3. Busca `conversationId` via `fran_zernio_conversa_id()`
4. Envia via `POST /api/v1/inbox/conversations/{conversationId}/messages`
5. Grava na `fran_memory` com `type: "ai"`

**Payload aceito:**
```json
{
  "telefone": "5521999999999",
  "texto": "Olá, tudo bem?",
  "tipo": "texto",
  "media_url": null
}
```

**Tipos suportados:** `texto`, `imagem`, `audio`, `documento`, `video`

**Assinatura do operador:** prefixa `*Nome:*\n` no texto quando o operador tem nome cadastrado.

**Configurações lidas:** `zernio_api_key` e `zernio_account_id` da `fran_config`.

---

### Etapa 4 — Templates

**Arquivos:**
- `supabase/functions/zernio-templates/index.ts`
- `src/lib/zernio.ts`
- `src/pages/Templates.tsx`
- `src/components/templates/NovoTemplateDialog.tsx`

**Rota no painel:** `/templates` — menu lateral "Templates WA"

**Funcionalidades:**
- Listar templates com status (Aprovado, Pendente, Rejeitado, Pausado)
- Criar template com header (texto), body (com variáveis `{{1}}`), footer e até 3 botões de resposta rápida
- Deletar template (admin only)
- Templates agrupados por status na listagem

**Endpoints da Edge Function:**

| ação | Acesso | Descrição |
|---|---|---|
| `listar` | Todos | Lista todos os templates da conta |
| `criar` | Admin only | Cria e submete template para aprovação Meta |
| `deletar` | Admin only | Remove template |
| `status_conta` | Todos | Retorna status do número conectado |

**Categorias suportadas:** `UTILITY`, `MARKETING`, `AUTHENTICATION`

**Idiomas:** `pt_BR`, `en`, `es`

> **Atenção:** Templates exigem conta WhatsApp Business ativa e aprovada pela Meta. Contas com status "Declined" não conseguem criar templates.

---

### Etapa 5 — Status da conta (WhatsApp)

**Arquivos:**
- `src/components/whatsapp/ZernioCanalCard.tsx`
- `src/pages/Whatsapp.tsx` (atualizado)

**Rota no painel:** `/whatsapp`

O card do Zernio exibe:
- Badge de status (Conectado / Desconectado)
- Nome e número do WhatsApp Business
- Status de saúde da conta
- Data e hora da última conexão
- Alerta quando há limitação de envio
- Botão para abrir o painel Zernio
- Botão de atualizar status

Os canais UAZAPI continuam exibidos abaixo, separados por seção.

---

### Etapa 6 — Roteamento automático

**Arquivo:** `src/lib/mensagens.ts` (atualizado)

A função `enviarMensagem()` agora detecta automaticamente o canal correto:

```
enviarMensagem({ telefone, texto })
    ↓
[consulta fran_zernio_conversas]
    ↓
tem registro? → zernio-enviar (API oficial)
não tem?     → enviar-mensagem (UAZAPI via n8n)
```

**Totalmente transparente** — `Composer.tsx`, `useEnviarMensagem.ts` e toda a UI de conversas ficaram intactos. Nenhuma mudança visível para o operador.

---

### Etapa 7 — Configurações pelo painel

**Arquivos:**
- `src/components/configuracoes/ZernioConfigCard.tsx`
- `src/pages/Configuracoes.tsx` (atualizado)
- `supabase/migrations/0018_zernio_config.sql`

**Rota no painel:** `/configuracoes` → seção "Zernio (API Oficial WhatsApp)"

Permite ao admin atualizar pelo painel:
- **API Key** — com campo password + botão revelar
- **Account ID (WABA)** — muda ao trocar o número conectado
- **Profile ID** — geralmente fixo, mas editável

Ao salvar, as 3 Edge Functions (`zernio-webhook`, `zernio-enviar`, `zernio-templates`) leem automaticamente os novos valores do banco — sem redeploy necessário.

---

## O que falta — Etapa 8 (Broadcasts)

**Status:** ⏳ Pendente — aguardando conta WhatsApp Business ser aprovada pela Meta.

**Por que está bloqueado:** A conta `Layla Duarte Click (+55 21 99509-2890)` estava com status "Declined" durante o desenvolvimento. A Meta bloqueia criação de templates e broadcasts para contas nesse estado.

**O que precisa ser feito quando a conta normalizar:**

### 8.1 — Criar template de abertura

No painel `/templates`, criar um template de categoria `UTILITY` com:
- Body contendo as variáveis do devedor (nome, valor, instituição)
- Ex: `Olá, {{1}}! Identificamos uma pendência de R$ {{2}} referente à {{3}}. Podemos ajudá-lo a regularizar. Responda SIM para saber mais.`

Aguardar aprovação da Meta (minutos a 24h).

### 8.2 — Edge Function `zernio-broadcast`

Nova Edge Function que:
1. Recebe lista de `devedor_ids` e nome do template
2. Cria broadcast no Zernio: `POST /api/v1/broadcasts`
3. Adiciona destinatários: `POST /api/v1/broadcasts/{id}/recipients`
4. Dispara: `POST /api/v1/broadcasts/{id}/send`
5. Grava em `fran_disparos` com `canal: "zernio"`

**Payload do Zernio para broadcast:**
```json
{
  "profileId": "6a504a89648fd83e57ebda9e",
  "accountId": "3209910152529443",
  "platform": "whatsapp",
  "name": "Campanha Julho 2026",
  "template": {
    "name": "negociacao_divida_v1",
    "language": "pt_BR",
    "components": [{
      "type": "body",
      "parameters": [
        { "type": "text", "text": "{{nome}}" },
        { "type": "text", "text": "{{valor}}" },
        { "type": "text", "text": "{{instituicao}}" }
      ]
    }]
  }
}
```

### 8.3 — UI de Broadcast

Nova seção na página `/fila` ou página dedicada `/broadcast` com:
- Seletor de template (lista os aprovados da API)
- Preview do template com variáveis preenchidas
- Seleção de devedores (integrado com o seletor existente no Dashboard)
- Botão "Disparar via API Oficial"

### 8.4 — Integração com fila existente

Opcionalmente, adicionar na `fran_fila_disparo` um campo `canal` (`'uazapi'` | `'zernio'`) para que a `processar-fila` possa rotear automaticamente pelo canal correto.

---

## Documentação da API Zernio

**Base URL:** `https://zernio.com/api/v1`

**Autenticação:** Bearer Token no header `Authorization: Bearer {API_KEY}`

**SDKs oficiais:** Node.js (`@zernio/node`), Python, Go, Ruby, Java, PHP, .NET, Rust

### Endpoints utilizados no projeto

#### Templates

```
GET    /v1/whatsapp/templates?accountId={id}
POST   /v1/whatsapp/templates
DELETE /v1/whatsapp/templates/{name}?accountId={id}
```

**Body para criação:**
```json
{
  "profileId": "string",
  "accountId": "string",
  "name": "nome_do_template",
  "category": "UTILITY | MARKETING | AUTHENTICATION",
  "language": "pt_BR | en | es",
  "components": [
    { "type": "HEADER", "format": "TEXT", "text": "Título" },
    { "type": "BODY", "text": "Corpo com {{1}} variáveis" },
    { "type": "FOOTER", "text": "Rodapé" },
    {
      "type": "BUTTONS",
      "buttons": [{ "type": "QUICK_REPLY", "text": "Sim" }]
    }
  ]
}
```

#### Mensagens (Inbox)

```
POST /v1/inbox/conversations/{conversationId}/messages
```

**Body para texto:**
```json
{ "accountId": "string", "type": "text", "text": "Mensagem" }
```

**Body para mídia:**
```json
{ "accountId": "string", "type": "image", "mediaUrl": "https://...", "caption": "Legenda" }
```

**Body para template (fora da janela 24h):**
```json
{
  "accountId": "string",
  "template": {
    "elements": [{
      "name": "nome_template",
      "language": "pt_BR",
      "components": [{ "type": "body", "parameters": [{ "type": "text", "text": "valor" }] }]
    }]
  }
}
```

#### Número de telefone

```
GET /v1/whatsapp/phone-numbers?accountId={id}
```

**Resposta:**
```json
{
  "connected": [{
    "accountId": "string",
    "phoneNumber": "+55 21 99509-2890",
    "displayName": "Layla Duarte Click",
    "profileId": "string",
    "connectedAt": "2026-07-09T02:31:40.640Z"
  }],
  "numbers": [],
  "sandbox": { ... }
}
```

#### Broadcasts

```
POST   /v1/broadcasts                          — Criar broadcast
POST   /v1/broadcasts/{id}/recipients          — Adicionar destinatários
POST   /v1/broadcasts/{id}/send                — Disparar
GET    /v1/broadcasts                          — Listar broadcasts
GET    /v1/broadcasts/{id}                     — Status do broadcast
```

#### Perfis

```
GET /v1/profiles         — Lista perfis (contém profileId)
GET /v1/profiles/{id}    — Detalhe de um perfil
```

### Webhooks do Zernio

**Header de assinatura:** `X-Zernio-Signature: {hex}` (HMAC-SHA256, hex puro sem prefixo `sha256=`)

**Eventos disponíveis:**

| Evento | Descrição |
|---|---|
| `webhook.test` | Ping de verificação (sem assinatura) |
| `message.received` | Mensagem recebida de um contato |
| `message.sent` | Mensagem enviada com sucesso |
| `message.delivered` | Entregue ao dispositivo |
| `message.read` | Lida pelo destinatário |
| `message.failed` | Falha no envio |
| `whatsapp.template.status_updated` | Status do template mudou (aprovado/rejeitado) |
| `whatsapp.number.activated` | Número ativado |
| `whatsapp.number.declined` | Número recusado pela Meta |
| `conversation.started` | Nova conversa iniciada |

**Payload de `message.received`:**
```json
{
  "event": "message.received",
  "accountId": "string",
  "conversationId": "string",
  "platform": "whatsapp",
  "sender": {
    "id": "string",
    "name": "Nome do Contato",
    "phoneNumber": "+5521999999999"
  },
  "message": {
    "id": "string",
    "type": "text",
    "text": "Conteúdo da mensagem",
    "timestamp": "2026-07-10T01:58:11.931Z"
  }
}
```

### Rate limits e limites da Meta

| Limite | Valor |
|---|---|
| Mensagens por segundo | 80 msg/s (Standard throughput) |
| Conversas iniciadas por dia | Depende do tier da conta (começa em 250/dia) |
| Templates por WABA | Até 250 templates |
| Destinatários por broadcast (por chamada) | 100 por request |
| Janela de atendimento | 24h após última mensagem do contato |

---

## Secrets das Edge Functions

| Secret | Edge Functions | Descrição |
|---|---|---|
| `ZERNIO_WEBHOOK_SECRET` | `zernio-webhook` | Verificação HMAC dos webhooks |
| `ZERNIO_API_KEY` | Todas (fallback) | Fallback se `fran_config` não tiver o valor |
| `ZERNIO_ACCOUNT_ID` | Todas (fallback) | Fallback se `fran_config` não tiver o valor |
| `ZERNIO_PROFILE_ID` | `zernio-templates` (fallback) | Fallback se `fran_config` não tiver o valor |

> As configs principais vivem na `fran_config` e são editáveis pelo painel em Configurações → Zernio.

---

## Como trocar o número conectado

1. Acesse **[zernio.com/dashboard/connections](https://zernio.com/dashboard/connections)**
2. Clique no número atual → **Disconnect**
3. Clique em **Connect WhatsApp** → siga o Embedded Signup com o número novo
4. Após conectar, anote o novo **Account ID** (aba Info → Business Account → Account ID)
5. Acesse **Painel Fran → Configurações → Zernio**
6. Atualize o **Account ID** e salve
7. Se o **Profile ID** mudou (raro), atualize também

Nenhum redeploy de Edge Function é necessário.

---

## Estrutura de arquivos

```
painel-fran/
├── supabase/
│   ├── functions/
│   │   ├── zernio-webhook/
│   │   │   └── index.ts          # Recebe mensagens do Zernio
│   │   ├── zernio-enviar/
│   │   │   └── index.ts          # Envia mensagens via API oficial
│   │   └── zernio-templates/
│   │       └── index.ts          # Templates + status da conta
│   └── migrations/
│       ├── 0017_zernio_canal.sql  # Tabelas e funções helper
│       └── 0018_zernio_config.sql # Chaves na fran_config
│
└── src/
    ├── lib/
    │   ├── mensagens.ts           # Roteamento automático UAZAPI/Zernio
    │   └── zernio.ts              # Cliente da API Zernio (frontend)
    ├── pages/
    │   ├── Templates.tsx          # Página /templates
    │   ├── Whatsapp.tsx           # Página /whatsapp (atualizada)
    │   └── Configuracoes.tsx      # Página /configuracoes (atualizada)
    └── components/
        ├── templates/
        │   └── NovoTemplateDialog.tsx
        ├── whatsapp/
        │   └── ZernioCanalCard.tsx
        └── configuracoes/
            └── ZernioConfigCard.tsx
```
