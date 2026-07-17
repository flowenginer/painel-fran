# Arquitetura e Documentação Completa — Painel Fran

> Documento-mestre da implementação. Serve para (a) entender o sistema inteiro e
> (b) **clonar e adaptar para outro negócio**. Para temas específicos, ver também:
> [`ZERNIO_INTEGRATION.md`](./ZERNIO_INTEGRATION.md) (WhatsApp oficial),
> [`PRD-WHATSAPP-UAZAPI.md`](./PRD-WHATSAPP-UAZAPI.md) (WhatsApp não-oficial),
> [`CANAIS.md`](./CANAIS.md) (múltiplos números) e
> [`AUDITORIA-SEGURANCA.md`](./AUDITORIA-SEGURANCA.md).

---

## 1. Visão geral

**Painel Fran** é um CRM de cobrança/negociação de dívidas para a Stival Advogados.
Ele importa devedores de uma API de cobrança (Cedrus), dispara a primeira mensagem
de WhatsApp de forma controlada (gotejamento), conversa com o lead por uma **IA**
(agente de negociação rodando no n8n) e dá à operadora humana um **chat** para
assumir manualmente. Suporta **dois canais de WhatsApp**:

- **Não-oficial (UAZAPI)** — número comum, via um workflow n8n intermediário.
- **Oficial (Zernio / WhatsApp Business / Meta Cloud API)** — templates aprovados,
  janela de 24h, disparo em massa (broadcasts) e IA no canal oficial.

### Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| UI | Tailwind CSS + shadcn/ui (Radix) — tema escuro |
| Estado/fetch | TanStack Query (React Query) |
| Rotas | React Router v6 |
| Formulários | React Hook Form + Zod |
| Backend | Supabase (Auth + Postgres + Realtime + Storage + Edge Functions Deno) |
| Automação/IA | n8n (self-hosted em `nwh.chelsan.com.br`) |
| Deploy frontend | Vercel (CI faz `tsc && vite build`) |
| Agendamento | pg_cron + pg_net (dentro do Postgres do Supabase) |

### Princípios de arquitetura importantes

1. **O schema do banco vive no Supabase Cloud** e é versionado por DDLs idempotentes
   em `supabase/migrations/` — **rodados manualmente** no SQL Editor (não há
   `supabase db push` automático). Sempre `CREATE ... IF NOT EXISTS`.
2. **Edge Functions não têm deploy automático.** São deployadas manualmente (CLI
   `supabase functions deploy <nome>` ou colando o `index.ts` no Dashboard). O
   Vercel **não** builda as Edge Functions.
3. **O Vercel é o único typecheck.** `npm run build` roda `tsc` com `noUnusedLocals`;
   um import não usado quebra o build e o deploy serve o bundle antigo.
4. **Segredos ficam em `fran_config` (tabela) ou nos Secrets das Edge Functions** —
   nunca no código nem neste repositório.

---

## 2. Variáveis de ambiente e chaves

### 2.1 Frontend (Vercel / `.env`)

Só duas, ambas públicas por natureza (a anon key é feita para ir no bundle):

```
VITE_SUPABASE_URL=https://<REF>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key-do-projeto>
```

Lidas em `src/lib/supabase.ts`. Em `Dashboard Supabase → Settings → API`.

### 2.2 Edge Functions (Secrets — injetados pelo runtime)

O runtime do Supabase injeta automaticamente, sem configuração manual:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` ← chave de serviço (bypassa RLS). **Nunca exponha.**

Opcionalmente, como fallback, algumas funções aceitam Secrets próprios
(`ZERNIO_API_KEY`, `ZERNIO_ACCOUNT_ID`, `ZERNIO_WEBHOOK_SECRET`), mas o padrão é
lê-los de `fran_config`.

### 2.3 Chaves de negócio — tabela `fran_config`

`fran_config(chave, valor, descricao)` guarda toda a configuração e os segredos de
integração, editáveis por SQL ou pela tela **Configurações** do painel. **Nenhum
valor real está neste repositório** — a lista abaixo é o *contrato* das chaves.

| chave | Default | Usada por | Descrição |
|---|---|---|---|
| `cedrus_apikey` | — | `cedrus-buscar` | APIKEY da API de cobrança Cedrus (Basic Auth) |
| `cedrus_url_base` | `https://api.sistemadecobranca.com.br:3001/v1` | `cedrus-buscar` | Base da API Cedrus |
| `n8n_webhook_url` | — | `disparar-lote`, `processar-fila` | Webhook do n8n que recebe o disparo da 1ª mensagem |
| `limite_diario_disparos` | `40` | disparo/fila | Teto diário de 1ª mensagem |
| `horario_disparo_inicio` | `08:00` | disparo/fila | Início da janela de disparo (America/Sao_Paulo) |
| `horario_disparo_fim` | `20:00` | disparo/fila | Fim da janela de disparo |
| `fila_ativa` | `false` | `processar-fila` | Liga/desliga o gotejamento da fila |
| `fila_disparos_por_hora` | `10` | `processar-fila` | Ritmo da fila (msgs/hora) |
| `fila_dias_semana` | `1,2,3,4,5` | `processar-fila` | Dias permitidos (0=dom..6=sáb) |
| `fila_cron_secret` | — | `processar-fila` | Segredo do pg_cron (header `x-cron-secret`) |
| `distribuicao_metodo` | `round_robin` | RPC distribuição | Método de atribuição de leads a operadores |
| `uazapi_webhook_url` | — | `uazapi-proxy`, `enviar-mensagem` | Webhook n8n do canal **não-oficial** (UAZAPI) |
| `uazapi_webhook_secret` | — | idem | Valor validado em `X-Painel-Secret` no n8n |
| `zernio_api_key` | — | funções `zernio-*` | API key do Zernio (Bearer) — canal **oficial** |
| `zernio_account_id` | — | funções `zernio-*` | **accountId interno** do Zernio (não é o WABA da Meta) |
| `zernio_profile_id` | — | `zernio-templates` | profileId do Zernio |
| `zernio_webhook_secret` | — | `zernio-webhook` | HMAC do webhook do Zernio |
| `zernio_broadcast_ativo` | `false` | `zernio-broadcast` | Liga/desliga o envio de broadcasts |
| `zernio_broadcast_limite_diario` | `1000` | `zernio-broadcast` | Teto diário global (proteção do número) |
| `zernio_broadcast_por_hora` | `60` | (legado/fallback) | Ritmo global; hoje o ritmo é **por campanha** (coluna `por_hora`) |
| `zernio_broadcast_cron_secret` | — | `zernio-broadcast` | Segredo do pg_cron do broadcast |

> **IDs do Zernio (cuidado):** o `zernio_account_id` é o **accountId interno do
> Zernio** (ex.: `6a50598c...`), **não** o WABA ID da Meta. Usar o WABA causa
> "conversa não encontrada" no envio. Há ainda o `profileId` e, no lado Meta, o
> WABA ID — todos distintos.

---

## 3. Banco de dados (Postgres / Supabase)

Todas as tabelas usam o prefixo `fran_` e têm **RLS habilitada**. O acesso do
frontend é sempre como usuário autenticado (anon key + JWT); as Edge Functions
usam a service role (bypassa RLS) para tarefas administrativas.

### 3.1 Tabelas

#### `fran_devedores` — o lead/devedor (tabela central)
Schema completo em `src/lib/types.ts` (interface `Devedor`). Principais colunas:

- **Identificação:** `id` (PK), `id_devedor`, `cod_credor`, `cod_devedor`, `cpf`,
  `nome_devedor`, `primeiro_nome`, `tratamento`, `email`.
- **Contato:** `telefone`, `telefone_2`, `telefone_3`, `endereco`, `bairro`,
  `cidade`, `estado`, `cep`.
- **Dívida:** `instituicao`, `nome_aluno`, `valor_original`, `valor_atualizado`,
  `valor_correcao`, `valor_juros`, `valor_multa`, `valor_honorarios`,
  `valor_com_desconto`, `percentual_desconto`, `entrada_sugerida`,
  `entrada_minima`, `parcelas_sugeridas`, `qtd_parcelas_aberto`,
  `ano_inicial_dividas`, `ano_final_dividas`, `acordo_anterior`.
- **Negociação:** `status_negociacao` (`pendente|primeira_msg|em_negociacao|acordo_aceito|escalado|sem_acordo|aguardando_retorno`),
  `status` (**flag administrativa** — `"Block IA"` faz a IA ignorar o lead),
  `observacoes_negociacao`, campos `acordo_*` (valores do acordo fechado).
- **Atribuição:** `responsavel_id` (operador dono — `auth.users.id`), `campanha`,
  `data_primeiro_disparo`, `data_ultimo_contato`, `tentativas_contato`.

> A tabela `fran_devedores` foi criada pela UI do Supabase (não há migration de
> `CREATE`); a fonte da verdade das colunas é a interface `Devedor`.

#### `fran_memory` — histórico unificado de conversas (o "chat")
Store único de mensagens de **todos os canais** (UAZAPI e Zernio). Colunas:

- `session_id` TEXT — **telefone só com dígitos** (chave da conversa).
- `message` JSONB — `{ "type": "human"|"ai", "content": "...", "additional_kwargs": {...} }`.
  `human` = mensagem recebida do lead; `ai` = enviada (pela IA ou operadora).
- `canal` TEXT — de qual número/instância veio/saiu (ex.: `zernio:<accountId>`
  para o oficial, ou o nome da instância UAZAPI). Adicionada em `0013_canais.sql`.
- `created_at` TIMESTAMPTZ, `enviado_por` UUID (operador, se manual) — `0009`.

Usada pelo agente de IA do n8n como memória (LangChain memory, sessionKey = telefone).
Habilitada no **Realtime** (`0010`) para o chat atualizar ao vivo.

#### `fran_instituicoes` — credores/instituições
`id`, `cod_credor` (unique), `nome`, `ativo`, timestamps.

#### `fran_config` — configuração e segredos
`id`, `chave` (unique), `valor`, `descricao`, `updated_at`. Ver seção 2.3.

#### `fran_disparos` — log de 1ª mensagem
`id`, `devedor_id`, `telefone`, `data_disparo`, `status_envio` (`enviado|erro`),
`erro_detalhes`, `webhook_response` JSONB, `campanha`, `usuario_id`, `created_at`.

#### `fran_fila_disparo` — fila de gotejamento (0001)
`id`, `devedor_id`, `status` (`na_fila|enviado|erro|cancelado`), `prioridade`,
`campanha`, `tentativas`, `reenvio` (0016), `erro_detalhes`, `enfileirado_por`,
`data_processado`, timestamps. Índice parcial impede o mesmo devedor duplicado
enquanto `na_fila`.

#### `fran_usuarios` — perfis do painel (0004)
1:1 com `auth.users`. `id` (UUID FK), `nome`, `email`, `role` (`admin|operador`),
`ativo`, `recebe_distribuicao`, `permissoes` JSONB (`{paginas:[], acoes:[]}`),
`ultima_atribuicao_em`, `peso` (0008), `total_atribuidos` (0008), timestamps.
Trigger `on_auth_user_created` cria o perfil ao criar o usuário no Auth.

#### `fran_conversas` — metadados/dono da conversa (0007)
Liga um telefone normalizado ao `responsavel_id`. Base do isolamento por dono
(RLS) e da transferência. RPCs `fran_sync_conversa`, `fran_atribuir_responsavel`.

#### `fran_conversa_transferencias` — log de transferências (0006)
Histórico de troca de responsável entre operadores.

#### `fran_canais` + `fran_canal_token` — múltiplos números (0013–0015)
`fran_canais`: cada número/instância de WhatsApp (nome, `usar_no_disparo`,
`total_disparos`, `ultimo_disparo_em`, `conectado`, `status_em`). `fran_canal_token`
guarda o token da instância. RPC `fran_proximo_canal_disparo()` faz rodízio de
números no disparo. Ver `CANAIS.md`.

#### `fran_zernio_conversas` — conversas do canal oficial
Mapeia telefone → `conversationId` do Zernio + `accountId` (criada via UI).
Preenchida por `fran_zernio_upsert_conversa(p_telefone, p_conversation_id, p_account_id)`;
lida por `fran_zernio_conversa_id(p_telefone, p_account_id)` (usada pelo
`zernio-enviar` para achar a conversa ao responder).

#### `fran_zernio_broadcasts` — campanhas de disparo em massa oficial (0019, 0022, 0023)
`id`, `nome`, `template_name`, `template_language` (default `pt_BR`),
`template_body` (0022 — corpo do template p/ exibir o texto real),
`variaveis` JSONB (`{"1":"primeiro_nome"}` → índice da variável → campo do devedor),
`por_hora` INT (0023 — ritmo desta campanha), `status`
(`rascunho|ativo|pausado|concluido|cancelado`), `total_alvos`, `total_enviados`,
`total_erros`, `criado_por`, timestamps.

#### `fran_zernio_broadcast_itens` — 1 alvo por linha (0019)
`id`, `broadcast_id` (FK), `devedor_id` (FK), `telefone`, `status`
(`na_fila|enviado|erro|cancelado`), `tentativas`, `erro_detalhes`,
`zernio_message_id`, `data_processado`, timestamps. Índice único parcial impede o
mesmo devedor duplicado `na_fila` na mesma campanha.

### 3.2 Funções (RPC) do banco

| Função | Migration | Papel |
|---|---|---|
| `fran_is_admin()` | 0004 | Retorna se o `auth.uid()` atual é admin ativo (usada em RLS) |
| `handle_new_user()` + trigger | 0004 | Cria `fran_usuarios` ao criar usuário no Auth |
| `fran_tel_variantes(tel)` | 0007 | Gera variações do telefone (com/sem 9, DDI) p/ casar conversas |
| `fran_sync_conversa(devedor_id)` | 0007 | Garante linha em `fran_conversas` |
| `fran_atribuir_responsavel(devedor_id)` | 0005/0007/0008 | Round-robin de operadores (respeita `recebe_distribuicao`, `peso`) |
| `fran_listar_operadores()` | 0006 | Lista operadores p/ transferência |
| `fran_transferir_conversa(...)` | 0006/0007 | Troca o responsável de uma conversa + log |
| `fran_listar_distribuicao()` / `fran_set_distribuicao(...)` | 0008 | Lê/edita pesos da distribuição |
| `fran_canal_conversa(p_tel)` | 0013 | Descobre o canal de uma conversa |
| `fran_proximo_canal_disparo()` | 0014/0015 | Rodízio de números no disparo |
| `fran_excluir_conversas(p_tels TEXT[])` | 0020 | **Admin** — apaga `fran_memory` por telefone (multi-seleção) |
| `fran_zernio_upsert_conversa(...)` | UI | Upsert conversa oficial (telefone↔conversationId) |
| `fran_zernio_conversa_id(...)` | UI | Retorna o conversationId oficial de um telefone |

### 3.3 Migrations (ordem)

`0001` fila de disparo · `0002` dias da semana · `0003` policy insert config ·
`0004` usuários/perfis · `0005` round-robin · `0006` transferências · `0007` RLS por
dono + `fran_conversas` · `0008` config de distribuição · `0009` colunas CRM em
`fran_memory` · `0010` realtime `fran_memory` · `0011` Storage `crm-midia` · `0012`
hardening RLS · `0013` canais · `0014` canais no disparo + token · `0015` flag
conectado · `0016` reenvio · `0019` broadcasts Zernio · `0020` excluir conversas ·
`0021` limites broadcast · `0022` corpo do template · `0023` ritmo por campanha.
(0017/0018 não existem.)

---

## 4. Edge Functions (Deno)

Todas em `supabase/functions/<nome>/index.ts`. Contratos detalhados em
`supabase/README.md`. Resumo:

| Função | Auth | O que faz |
|---|---|---|
| `cedrus-buscar` | JWT | Busca devedores na API Cedrus (Basic Auth), normaliza e devolve p/ revisão |
| `disparar-lote` | JWT | Disparo manual da 1ª msg: valida limites/horário → POST n8n → grava `fran_disparos` |
| `processar-fila` | `x-cron-secret` **ou** JWT | Gotejamento da fila (pg_cron a cada 10min); respeita `fila_ativa`, dias, horário, ritmo, limite diário |
| `enviar-mensagem` | JWT (dono/admin) | Operadora → lead (UAZAPI via n8n) + grava `fran_memory`. Aceita `canal` p/ rotear o número |
| `sugerir-resposta` | JWT | Sugestão de resposta (IA) para a operadora |
| `uazapi-proxy` | JWT | Proxy p/ o n8n do canal não-oficial (status/connect/disconnect da instância) |
| `admin-usuarios` | JWT admin | CRUD de usuários do painel (cria no Auth, papéis, permissões, senha) |
| `zernio-webhook` | HMAC | Recebe mensagens do canal **oficial**, grava `fran_memory`, upsert conversa, repassa p/ IA no n8n |
| `zernio-enviar` | JWT (dono/admin) | Operadora → lead no **oficial** (texto/mídia) na conversa existente |
| `zernio-templates` | JWT (admin p/ criar) | Proxy de templates do Zernio (listar/criar/deletar/status) |
| `zernio-broadcast` | `x-cron-secret` **ou** JWT admin | Processa a fila de broadcasts: cold-start via template, grava `fran_memory`, ritmo por campanha |
| `_shared/` | — | `cors.ts` e `disparo-core.ts` (lógica de disparo compartilhada) |

### 4.1 Detalhe — funções do canal oficial (Zernio)

- **Receber (`zernio-webhook`):** valida HMAC (`zernio_webhook_secret`), lê o payload
  aninhado (`payload.message.text`, `.sender.phoneNumber`, `.conversationId`,
  `payload.account.id`), grava `fran_memory` (`type:"human"`, `canal:zernio:<accountId>`),
  faz upsert em `fran_zernio_conversas` e **repassa a mensagem para o n8n**
  (`N8N_IA_OFICIAL_URL`, default `https://nwh.chelsan.com.br/webhook/ia-api-oficial`).
- **Enviar texto/mídia (`zernio-enviar`):** `POST https://zernio.com/api/v1/inbox/conversations/{conversationId}/messages`
  com `{ accountId, message }` (texto) ou `{ accountId, attachmentUrl, message? }` (mídia).
- **Templates (`zernio-templates`):** `.../api/v1/whatsapp/templates` — tipos de
  componente em **minúsculo** (`body`, `header`...), sem `profileId` no create.
- **Broadcast/cold-start (`zernio-broadcast`):** para número **frio** (sem conversa),
  `POST https://zernio.com/api/v1/inbox/conversations` com
  `{ accountId, participantId:<telefone>, templateName, templateLanguage, templateParams?:string[] }`
  — cria a conversa **e** dispara o template. Ritmo por campanha (`por_hora`) + teto
  diário global; retenta até 3×; reconcilia contadores/estado.

### 4.2 Zernio — formatos que funcionam (lições aprendidas)

A Zernio é um **whitelabel da Late API** (`docs.getlate.dev`; o webhook assina com
`x-late-signature`). O **OpenAPI oficial** é a fonte da verdade dos formatos. Pontos
que custaram a acertar e **não** devem ser redescobertos:

- **Enviar template com variáveis (cold-start):** as variáveis vão no campo
  **`templateParams`** — um **array plano de strings** com os valores **na ordem**
  (variáveis do header → do body → um valor por botão de URL dinâmico). Ex.: body com
  `{{1}} {{2}}` → `templateParams: ["Michel", "CCBEU..."]`.
  - ❌ **NÃO** é `templateComponents` (estrutura Meta `[{type:"body",parameters:[...]}]`)
    → dá `Template parameter count mismatch` (o Zernio conta o array aninhado como 1).
  - ❌ **NÃO** é um objeto `template:{...}` nem `template:{elements:[...]}`
    → dá `Message, attachment, or template is required`.
- **Sem variáveis:** basta `templateName` + `templateLanguage` (sem `templateParams`).
- **IDs:** `zernio_account_id` é o **accountId interno do Zernio** (ex.: `6a50598c...`),
  **não** o WABA da Meta. Usar o WABA dá "conversa não encontrada".
- **Criar template (`/v1/whatsapp/templates`):** tipos de componente em **minúsculo**
  (`body`, `header`...), **sem** `profileId`, e — quando há variável — **com** o
  `example.body_text` (senão a Meta recusa com "Invalid input").
- **Janela de 24h:** dentro de 24h da última msg do lead → texto livre pelo
  `/messages`. Fora → só template (é o próprio cold-start que reabre o contato).
- **Diagnóstico:** o `erro_detalhes` do item de broadcast guarda a resposta crua do
  Zernio; os **logs da Edge Function** e o **API log do Zernio** (painel) mostram o
  request/response exatos — foi assim que fechamos o formato.

---

## 5. Integrações externas

### 5.1 Cedrus (importação de devedores)
API de cobrança (Basic Auth). `cedrus-buscar` consulta por credor/CPF/id, normaliza
telefones (prioriza celular), valores BR (`"1.500,00"→1500.00`) e alunos, e devolve
`DevedorNormalizado` para a tela de revisão/importação.

### 5.2 UAZAPI — WhatsApp não-oficial (via n8n)
A UAZAPI restringe acesso por IP; por isso o painel **não** fala direto com ela — fala
com um workflow n8n ("Painel Fran ⇄ UAZAPI") que está na allowlist. O painel envia
`{acao: status|connect|disconnect|enviar, ...}` com header `X-Painel-Secret`. O n8n
tem um `Switch(acao)` que roteia para os endpoints da UAZAPI. Ver `PRD-WHATSAPP-UAZAPI.md`.

### 5.3 Zernio — WhatsApp oficial (Meta Cloud API)
Provedor whitelabel de WhatsApp Business. Base `https://zernio.com/api/v1`. Cobre
inbox (enviar/receber), templates e criação de conversa por template. A **janela de
24h** da Meta é refletida no chat (pill + trava do texto livre). Ver `ZERNIO_INTEGRATION.md`.

### 5.4 n8n — cérebro de IA
Dois fluxos de IA (não-oficial e oficial) compartilham o **mesmo banco** (`fran_memory`
como memória, `fran_devedores` para dados/status). O gate é `fran_devedores.status ==
"Block IA"`: quando a operadora bloqueia, a IA para e o humano assume. O fluxo oficial
(`IA | API OFICIAL`) recebe do `zernio-webhook`, pensa com o mesmo cérebro e responde
via Zernio.

---

## 6. Agendamento (pg_cron + pg_net)

Dois jobs rodam **dentro do Postgres** (extensões `pg_cron` e `pg_net`), chamando
Edge Functions por HTTP com `x-cron-secret`:

| Job | Frequência | Chama | Secret |
|---|---|---|---|
| `processar-fila-disparo` | `*/10 * * * *` | `processar-fila` | `fila_cron_secret` |
| `processar-zernio-broadcast` | `*/2 * * * *` | `zernio-broadcast` | `zernio_broadcast_cron_secret` |

Diagnóstico: `SELECT * FROM cron.job;` e `SELECT * FROM cron.job_run_details ORDER BY
start_time DESC;`. Obs.: `status=succeeded` do job significa que o **HTTP foi disparado**,
não que o envio deu certo — confirme pelos contadores/logs da função.

---

## 7. Fluxos principais (ponta a ponta)

1. **Importar devedores:** Configurações (Cedrus key) → tela Adicionar Devedor →
   `cedrus-buscar` → revisão → grava em `fran_devedores`.
2. **1ª mensagem (gotejamento):** enfileira em `fran_fila_disparo` → `processar-fila`
   (pg_cron) respeita ritmo/limites → POST n8n → `fran_disparos` + atualiza devedor →
   IA assume no n8n.
3. **Conversa/IA:** lead responde → n8n (UAZAPI ou `zernio-webhook`) grava em
   `fran_memory` → IA responde (mesmo cérebro) até fechar acordo ou escalar.
4. **Operadora assume:** botão **Bloquear IA** (`status="Block IA"`) → operadora
   responde pelo chat (`enviar-mensagem` / `zernio-enviar`), escolhendo o canal.
5. **Broadcast oficial:** cria campanha (template + variáveis + público + ritmo) →
   enfileira `fran_zernio_broadcast_itens` → `zernio-broadcast` (pg_cron) faz cold-start
   por template, grava na thread e atualiza a barra de progresso ao vivo.
6. **Janela de 24h:** no canal oficial, o chat mostra o tempo restante e **trava o
   texto livre** quando fecha (só template reabre).

---

## 8. Frontend

SPA React 18 + Vite. `src/main.tsx` monta `QueryClientProvider` (staleTime 1min,
sem refetch-on-focus) → `BrowserRouter` → `AuthProvider`. `src/App.tsx` define as
rotas: `/login` pública; o resto sob `ProtectedRoute` (sessão) + `AppLayout`, cada
página envolta em `PermissionRoute pagina="..."`. A rota índice usa
`RedirecionarInicio` (leva à primeira página permitida).

### 8.1 Rotas → página → permissão

| Rota | Página | Permissão |
|---|---|---|
| `/login` | `Login` | pública |
| `/` | `RedirecionarInicio` | 1ª página permitida |
| `/dashboard` | `Dashboard` | `dashboard` |
| `/fila` | `Fila` | `fila` |
| `/conversas` | `Conversas` | `conversas` |
| `/instituicoes` | `Instituicoes` | `instituicoes` |
| `/whatsapp` | `Whatsapp` | `whatsapp` |
| `/templates` | `Templates` | `templates` |
| `/broadcasts` | `Broadcasts` | `broadcasts` |
| `/configuracoes` | `Configuracoes` | `configuracoes` |
| `/usuarios` | `Usuarios` | `usuarios` (adminOnly) |

### 8.2 Páginas (`src/pages/`)

- **Login** — login e-mail/senha (react-hook-form + zod) + reset de senha.
- **Dashboard** — KPIs + tabela de devedores (filtros, busca, ordenação, paginação);
  ponto de entrada para adicionar/editar/remover devedor e disparar 1ª mensagem.
- **Fila** — fila de distribuição (`fran_fila_disparo`): enfileirar, cancelar, esvaziar,
  pausar/ativar, "processar agora".
- **Conversas** — inbox/CRM de WhatsApp: lista de conversas, thread, composer, painel do
  lead, sugestão de IA, filtro de período, transferência.
- **Instituicoes** — CRUD de credores (`fran_instituicoes`) + import CSV.
- **Whatsapp** — status/conexão dos canais (UAZAPI + Zernio).
- **Templates** — templates do WhatsApp Business via Zernio (listar/criar/deletar; criar
  é admin).
- **Broadcasts** — campanhas de disparo em massa oficial (template → variáveis → público
  → ritmo → progresso ao vivo).
- **Configuracoes** — `fran_config`: cartões de canais, distribuição e Zernio.
- **Usuarios** — admin: CRUD de usuários, reset de senha, editor de permissões granulares.

### 8.3 Camada de dados (`src/lib/`)

Um "client" por integração, todos chamando Supabase (tabela/RPC) ou Edge Function:
`supabase.ts` (client), `types.ts` (tipos do banco), `permissoes.ts` (catálogo
`PAGINAS`/`ACOES`), `utils.ts`, `formatters.ts`, `dates.ts`, `periodo.ts`,
`csv-parser.ts`, `csv-devedores.ts`, `supabase-pagination.ts` (contorna o limite de
1000 linhas do PostgREST), `storage.ts` (upload p/ bucket `crm-midia`), `conversas.ts`,
`conversas-transfer.ts`, `mensagens.ts` (roteia Zernio × UAZAPI), `canais.ts`,
`distribuicao.ts`, `disparo.ts`, `processar-fila.ts`, `cedrus.ts`, `sugestao.ts`,
`uazapi.ts`, `usuarios.ts`, `zernio.ts`, `broadcasts.ts`.

### 8.4 Hooks (`src/hooks/`)

React Query em torno das tabelas/RPCs/functions. Destaques: `useAuth`, `useDevedores`
(+`Filters`/`Realtime`/`Mutations`), `useUpsertDevedor`, `useImportarDevedores`,
`useKpis`, `useInstituicoes(+Mutations)`, `useFila(+Mutations/Stats)`, `useConversas`
(+`Realtime`), `useMensagensConversa`, `useEnviarMensagem` (bolha otimista),
`useExcluirConversas`, `useTransferirConversa`, `useOperadores`, `useSugestao`,
`useCanais`, `useWhatsappStatus(+Mutations)`, `useDistribuicao`, `useConfig`/`useSaveConfig`,
`useBroadcasts`, `useUsuarios(+Mutations)`.

### 8.5 Auth e permissões (frontend)

- Único contexto: `AuthContext`. Após a sessão do Supabase Auth, carrega o **perfil**
  de `fran_usuarios`. Expõe `session`, `user`, `perfil`, `isAdmin`, `temPermissao(tipo,id)`,
  `signIn`, `signOut`, `resetPassword`.
- Papéis: `admin` | `operador`. `isAdmin = role==="admin" && ativo`.
- `temPermissao`: admin sempre true; inativo/sem perfil false; senão checa em
  `perfil.permissoes.paginas`/`.acoes`.
- Guards: `ProtectedRoute` (sessão) e `PermissionRoute` (permissão por página; `adminOnly`
  em `/usuarios`; mostra "Sem acesso" em vez de redirecionar, evitando loop).
- Catálogo em `lib/permissoes.ts`: `PAGINAS` (dashboard, fila, conversas, instituicoes,
  whatsapp, templates, broadcasts, configuracoes — `usuarios` é admin-exclusivo) e
  `ACOES` (disparar, adicionar_devedor, editar_devedor, remover_devedor, gerenciar_fila,
  gerenciar_broadcasts, gerenciar_instituicoes, gerenciar_whatsapp, gerenciar_config,
  transferir_conversa).

### 8.6 Componentes (`src/components/`)

Por pasta: `adicionar-devedor/` (add manual, revisão, import CSV, `salvar-lote.ts`),
`configuracoes/` (cartões de canais/distribuição/Zernio), `conversas/` (lista, thread,
bolhas, composer, emoji, mídia, painel do lead, sugestão, transferência), `dashboard/`
(tabela + KPIs + filtros + diálogos de ação), `fila/` (`FilaConfigCard`), `instituicoes/`
(edit + import), `layout/` (`AppLayout`, `Header`, `Sidebar`, `nav-items`), `templates/`
(diálogo de novo template), `usuarios/` (diálogos + editor de permissões), `whatsapp/`
(cartões UAZAPI + Zernio), `ui/` (primitivas shadcn). No topo: `ProtectedRoute` e
`PermissionRoute`.

---

## 9. Como adaptar para outro negócio

O sistema é genérico o suficiente para virar "CRM de WhatsApp com IA + disparo" de
qualquer nicho. Roteiro sugerido:

1. **Fork/clone** do repo e **novo projeto Supabase**. Rode os DDLs de `migrations/`
   em ordem no SQL Editor. Crie as tabelas sem migration de `CREATE` (`fran_devedores`,
   `fran_zernio_conversas`) a partir das interfaces em `src/lib/types.ts` e das RPCs
   referenciadas.
2. **Renomeie o domínio.** `fran_devedores` é só "o lead/contato". Ajuste as colunas de
   dívida para os campos do seu negócio (ou ignore-as). O prefixo `fran_` pode ficar ou
   ser trocado (busque/renomeie com cuidado — está em migrations, functions e no
   frontend).
3. **Preencha `fran_config`** com as chaves da seção 2.3 do **seu** ambiente (nunca
   reutilize segredos de outro cliente). Configure `VITE_*` no Vercel.
4. **Escolha os canais.** Só oficial (Zernio), só não-oficial (UAZAPI), ou ambos.
   Deploie apenas as Edge Functions que for usar.
5. **Recrie os fluxos de IA no n8n** apontando para o **seu** banco e prompt. Ajuste o
   gate (`status=="Block IA"`) se quiser outra convenção.
6. **Deploy:** Vercel (frontend) + `supabase functions deploy` (cada função) + rode os
   blocos de `pg_cron` (com os secrets do seu projeto).
7. **Segurança:** rode o checklist de `AUDITORIA-SEGURANCA.md`. Confirme RLS em todas
   as tabelas, e que nenhum segredo real foi commitado.

### Checklist de segredos (nunca commitar)
`SUPABASE_SERVICE_ROLE_KEY`, `zernio_api_key`, `zernio_webhook_secret`,
`*_cron_secret`, `uazapi_webhook_secret`, `cedrus_apikey`, tokens de sessão/anon de
usuários. Todos moram em `fran_config` ou nos Secrets do Supabase — **não** no código.
