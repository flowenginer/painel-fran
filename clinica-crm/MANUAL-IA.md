# Manual da IA — CRM Clínica (Odontologia)

Este é o manual de trabalho para a IA que desenvolve **dentro do repositório
`clinica-crm`**. Leia por completo antes de agir. Marque as tarefas (`- [ ]` →
`- [x]`) conforme conclui, e faça commit do manual junto com a mudança.

---

## 0. Regra de ouro — consulte SEMPRE o painel-fran

Este CRM é um **fork enxuto do "Painel Fran"**. Sempre que for implementar ou
ajustar algo (padrão de código, integração WhatsApp, RLS, Edge Function, UI),
**consulte primeiro o repositório de referência**:

> **Referência:** https://github.com/flowenginer/painel-fran

Regras:
1. **Antes de codar qualquer coisa de WhatsApp/Zernio/uazapi**, leia no painel-fran:
   `docs/ZERNIO_INTEGRATION.md`, `docs/PRD-WHATSAPP-UAZAPI.md`, `docs/ARQUITETURA.md`
   e a função correspondente em `supabase/functions/`. **Não invente formato de
   payload** — o formato do Zernio foi difícil de acertar (ver item abaixo).
2. **Formato do Zernio (crítico):** ao mandar template com variáveis, o campo é
   `templateParams` = **array plano de strings** (valores das variáveis em ordem:
   header → body → botões URL). O endpoint de cold-start é
   `POST https://zernio.com/api/v1/inbox/conversations` com
   `{ accountId, participantId, templateName, templateLanguage, templateParams? }`.
3. **Diferenças que este projeto mantém em relação ao painel-fran:**
   - **Sem IA de conversa** (atendimento 100% humano). NÃO portar `fran_memory`,
     `sugerir-resposta`, nem nada de LangChain.
   - **Modelo relacional**: `canais` → `conversas` → `mensagens` (não é `fran_memory`).
   - **Multi-unidade**: isolamento por `unidade_id` via RLS (`crm_is_admin()` /
     `crm_minha_unidade()`), no lugar do "por dono/operador" do painel-fran.
   - Prefixo de tabelas **sem** `fran_` (ex.: `pacientes`, não `fran_devedores`).

---

## 1. Convenções de código (obrigatórias)

- **Stack:** Vite + React 18 + TS + shadcn/ui + Tailwind + Supabase + React Query
  + React Router. Mesmo do painel-fran.
- **Build:** `tsc && vite build`. O `tsconfig` tem `strict`, `noUnusedLocals` e
  `noUnusedParameters` — **não deixe import/variável sem uso** (quebra o build da
  Vercel). Não use `React.ReactNode`; importe `type { ReactNode } from "react"`.
- **Tipagem do supabase-js:** sem tipos gerados do banco, faça cast dos retornos
  via `as unknown as Tipo`.
- **Edge Functions:** **autossuficientes** (sem `../_shared`), para colar e
  deployar pelo editor do Supabase Dashboard. Usam `SUPABASE_URL`,
  `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (já disponíveis) + PostgREST.
- **RLS:** toda tabela nova de domínio leva `unidade_id` e política
  `crm_is_admin() OR unidade_id = crm_minha_unidade()`. Escrita de mensagens/
  inbound é feita por `service_role` (Edge), nunca pelo front.
- **Migrations:** SQL **idempotente** (`IF NOT EXISTS`, `DROP POLICY IF EXISTS`,
  `ON CONFLICT`), numeradas em sequência (`000N_nome.sql`). Nunca reescreva uma
  migração já aplicada; crie a próxima.
- **SEGREDOS:** **nunca** commite token/api key/senha. Credenciais ficam em
  `canal_secrets` (banco, admin-only) ou em env/Secrets das Edge Functions.
- **Permissões:** catálogo em `src/lib/permissoes.ts` (`PAGINAS`/`ACOES`); use
  `temPermissao("pagina"|"acao", id)` do `AuthContext`.

### Fluxo de entrega
1. Faça a mudança no repo `clinica-crm`.
2. Se criou migração/Edge, descreva no PR/commit o que rodar no Supabase.
3. Rode o build mentalmente: cheque imports e parênteses/JSX.
4. Marque as tasks deste manual e faça commit.

---

## 2. Mapa de referência (clinica-crm ⇄ painel-fran)

Ao construir um item do backlog, olhe o equivalente no painel-fran:

| Tema | No painel-fran (referência) | No clinica-crm |
|---|---|---|
| Envio WhatsApp | `functions/enviar-mensagem`, `functions/zernio-enviar` | `functions/mensagem-enviar` |
| Recebimento oficial | `functions/zernio-webhook` | `functions/zernio-webhook` |
| Templates (Meta) | `functions/zernio-templates`, `pages/Templates.tsx`, `components/templates/` | (backlog) |
| Broadcast/disparo | `functions/zernio-broadcast`, `pages/Broadcasts.tsx`, `lib/broadcasts.ts` | (backlog) |
| Status/QR uazapi | `functions/uazapi-proxy`, `pages/Whatsapp.tsx`, `lib/uazapi.ts` | (backlog) |
| Transferir conversa | `fran_transferir_conversa`, `components/conversas/TransferirConversaDialog` | (backlog) |
| Notificação desktop | `hooks/useNotificacoesMensagens` | (backlog) |
| Import CSV | `lib/csv-*`, `components/instituicoes/ImportarCsvDialog` | (backlog) |

---

## 3. Checklist — INFRA / DEPLOY (dono + IA)

Rodar no projeto Supabase **onde o login funciona** (mesma `VITE_SUPABASE_URL`
da Vercel). Migrations na ordem, no SQL Editor:

- [ ] Migração `0001_fundacao.sql`
- [ ] Migração `0002_conversas.sql`
- [ ] Migração `0003_inbound.sql`
- [ ] Migração `0004_agenda.sql`
- [ ] Migração `0005_storage.sql`
- [ ] Migração `0006_lembretes.sql`
- [ ] Deploy Edge `admin-usuarios`
- [ ] Deploy Edge `mensagem-enviar`
- [ ] Deploy Edge `zernio-webhook`
- [ ] Deploy Edge `uazapi-webhook`
- [ ] Deploy Edge `agenda-sync`
- [ ] Deploy Edge `agenda-webhook`
- [ ] Deploy Edge `processar-lembretes`
- [ ] Envs na Vercel: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (+ redeploy)
- [ ] 1º admin promovido (`UPDATE public.usuarios SET role='admin' ...`)

---

## 4. Checklist — CONFIGURAÇÃO DAS CONTAS (amanhã / mais tarde)

O dono vai criar as contas **Zernio** e **Uazapi** e configurar no CRM.
Referência completa: `docs/INTEGRACOES.md`.

### 4.1 Uazapi (canal NÃO-OFICIAL — atendimento)
- [ ] Criar conta/instância na Uazapi e obter o **token da instância**.
- [ ] Ter um **n8n** rodando (pode ser o mesmo do painel-fran).
- [ ] n8n — fluxo de **envio**: recebe do `mensagem-enviar`
      `{ acao:"enviar", instancia, token, telefone, tipo, texto, media_url }`,
      confere `X-Painel-Secret`, chama a uazapi.
- [ ] n8n — fluxo de **recebimento**: normaliza o inbound da uazapi e faz `POST`
      para a Edge `uazapi-webhook` com `{ instancia, telefone, texto, tipo?,
      media_url? }` + header `X-Painel-Secret`.
- [ ] Cadastrar o canal em **Configurações → Novo canal** (tipo *Não-oficial*):
      instância, número, unidade, token, webhook secret, **URL do n8n (envio)**.
- [ ] Testar: mandar mensagem no WhatsApp da instância → ver aparecer no inbox;
      responder pelo composer → chegar no WhatsApp.

### 4.2 Zernio (canal OFICIAL — captação + atribuição de anúncio)
- [ ] Criar conta na Zernio, conectar o WhatsApp Business e obter **accountId**,
      **API key** e definir um **webhook secret** (HMAC).
- [ ] No painel do Zernio, apontar o webhook de mensagens para a URL da Edge
      `zernio-webhook`.
- [ ] Cadastrar o canal em **Configurações → Novo canal** (tipo *Oficial*):
      accountId, API key, webhook secret, unidade.
- [ ] Testar recebimento (a assinatura HMAC precisa bater com o webhook secret).
- [ ] Confirmar **atribuição de anúncio**: lead vindo de anúncio (Click-to-WhatsApp)
      grava `origem_campanha/criativo/anuncio_id` no paciente (ver Dashboard e
      painel do lead).

### 4.3 Google Calendar (agenda bidirecional)
- [ ] OAuth do Google no n8n.
- [ ] n8n — `agenda-sync`: recebe o evento do painel e cria/atualiza no Google
      (usar `colorId = google_color_id`); **responder `{ google_event_id }`**.
- [ ] n8n — `agenda-webhook`: trigger do Google → `POST` na Edge com o evento.
- [ ] Secrets nas Edges `agenda-sync`/`agenda-webhook`: `N8N_AGENDA_URL`,
      `N8N_AGENDA_SECRET`.

### 4.4 Lembretes (cron)
- [ ] Setar env `LEMBRETES_CRON_SECRET` na Edge `processar-lembretes`.
- [ ] Agendar o cron diário (comando no fim de `0006_lembretes.sql`).
- [ ] Em **Configurações → Lembretes**, escolher o **canal** de cada regra
      (recomendado: uazapi) e ajustar as mensagens.

---

## 5. Checklist — FUNCIONALIDADES

### Prontas (não refazer)
- [x] Fundação: auth, `unidades`, `usuarios`, `pacientes`, RLS por unidade
- [x] Página **Usuários** (criar/editar atendentes, unidade, permissões, senha)
- [x] Página **Pacientes** (CRUD, funil, pré-cadastro, busca/filtro)
- [x] **Inbox** (`canais`/`conversas`/`mensagens`, realtime, filtros)
- [x] **Painel do lead** nas Conversas (info, status, botão Agendar, editar)
- [x] **Mídia no chat** (emoji, anexo, gravação de áudio) + bucket `crm-midia`
- [x] **Envio** (`mensagem-enviar`) roteando uazapi/Zernio
- [x] **Recebimento** (`zernio-webhook` com HMAC + referral, `uazapi-webhook`)
- [x] **Dashboard** (KPIs, funil, origem de anúncio)
- [x] **Agenda** (dia, realtime, categorias/cores) + sync Google
      (`agenda-sync`/`agenda-webhook`)
- [x] **Lembretes automáticos** (retorno 6/6, Clube do Sorriso 4/4)

### Backlog (implementar consultando o painel-fran — ver mapa na seção 2)
- [ ] **Gestão de unidades** (UI para criar/editar `unidades`; hoje só há seed
      "Matriz"). RLS: escrita só admin.
- [ ] **Conectar instância uazapi (QR code / status)** — portar de
      `uazapi-proxy` + `pages/Whatsapp.tsx`. Adaptar para `canais`/`canal_secrets`.
- [ ] **Templates oficiais (Meta via Zernio)** — portar `zernio-templates` +
      `pages/Templates.tsx` + `components/templates/`. Necessário para reengajar
      fora da janela 24h.
- [ ] **Broadcast/campanhas** (disparo em massa oficial com template) — portar
      `zernio-broadcast` + `pages/Broadcasts.tsx` + `lib/broadcasts.ts`. Adaptar
      alvos para `pacientes` + `unidade_id`.
- [ ] **Transferir conversa** entre atendentes — RPC estilo
      `fran_transferir_conversa` + dialog; usar a ação `transferir_conversa`.
- [ ] **Notificação desktop** de mensagem nova — portar
      `useNotificacoesMensagens` (montar no AppLayout).
- [ ] **Filtro por período** nas Conversas (portar `FiltroPeriodo`/`lib/periodo`).
- [ ] **Importar pacientes por CSV** (portar `csv-*` + dialog de importação).
- [ ] **Reagendamento a partir do lembrete** (botão que abre o AgendamentoDialog
      já com o paciente).

> Ao concluir um item, **mova-o para "Prontas"** e marque `- [x]`.

---

## 6. Onde as coisas estão (clinica-crm)

- `src/pages/` — telas (Dashboard, Pacientes, Conversas, Agenda, Configuracoes,
  Usuarios, Login).
- `src/components/{conversas,agenda,config,usuarios,pacientes,ui,layout}/`.
- `src/lib/` — acesso a dados e helpers (`conversas`, `mensagens`, `agenda`,
  `lembretes`, `pacientes`, `canais`, `usuarios`, `dashboard`, `storage`,
  `google-cores`, `pacientes-funil`, `dates`, `formatters`, `permissoes`,
  `types`, `supabase`).
- `supabase/migrations/` — `0001`..`0006`.
- `supabase/functions/` — `admin-usuarios`, `mensagem-enviar`, `zernio-webhook`,
  `uazapi-webhook`, `agenda-sync`, `agenda-webhook`, `processar-lembretes`.
- `docs/INTEGRACOES.md` — setup externo (uazapi/n8n, Zernio, Google, cron).
- `README.md` — setup geral do projeto.

Dúvida de padrão? Volte à **seção 0**: consulte
https://github.com/flowenginer/painel-fran.
