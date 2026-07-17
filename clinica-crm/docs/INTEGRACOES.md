# Integrações externas — CRM Clínica

Guia de setup das integrações que dependem de infra fora do código
(WhatsApp e Google Calendar). O código (Edge Functions) já está no repo; aqui
está o que configurar de fora.

---

## 1. WhatsApp — canal NÃO-OFICIAL (uazapi via n8n)

Fluxo: **envio** painel → `mensagem-enviar` → n8n → uazapi; **recebimento**
uazapi → n8n → `uazapi-webhook` → banco.

1. **Cadastre o canal** em Configurações → Novo canal → tipo *Não-oficial*:
   - Instância (nome que o n8n usa pra rotear), número, unidade.
   - Token da instância, Secret do webhook, **URL do n8n (envio)**.
2. **n8n — envio:** crie um webhook que recebe do `mensagem-enviar` o corpo
   `{ acao:"enviar", instancia, token, telefone, tipo, texto, media_url }`,
   confere o header `X-Painel-Secret`, e chama a uazapi
   (`<sub>.uazapi.com`, header `token`, endpoint de enviar texto/mídia).
3. **n8n — recebimento:** no fluxo que recebe da uazapi, normalize e faça
   `POST` para a função **`uazapi-webhook`** com
   `{ instancia, telefone, texto, tipo?, media_url?, provider_msg_id? }` e o
   header `X-Painel-Secret: <secret do canal>`.

---

## 2. WhatsApp — canal OFICIAL (Zernio/Late)

Fluxo: **envio** dentro da janela 24h → `mensagem-enviar` → Zernio; **cold
start** (template) fica pra uma fase de broadcast; **recebimento** Zernio →
`zernio-webhook` → banco (com atribuição de anúncio).

1. **Cadastre o canal** em Configurações → tipo *Oficial*: accountId do Zernio,
   API key (Bearer), Webhook secret (HMAC), unidade.
2. **No painel do Zernio**, aponte o webhook de mensagens para a URL da função
   **`zernio-webhook`**. Ela valida a assinatura (`x-zernio-signature` /
   `x-late-signature`) com o *Webhook secret* do canal.
3. **Atribuição de anúncio (Click-to-WhatsApp):** o `zernio-webhook` já lê o
   `referral` da mensagem e grava `origem_campanha` / `origem_criativo` /
   `origem_anuncio_id` no paciente (first-touch). Aparece no Dashboard e no
   painel do lead.

---

## 3. Google Calendar (agenda bidirecional via n8n)

O n8n detém o OAuth do Google. Duas direções:

### Painel → Google (`agenda-sync`)
Já é chamada pelo app a cada criar/editar/remover agendamento.
1. **Secrets da função `agenda-sync`** (Edge Functions → Settings):
   - `N8N_AGENDA_URL` — webhook do n8n que fala com o Google.
   - `N8N_AGENDA_SECRET` — segredo compartilhado (header `X-Painel-Secret`).
   Sem `N8N_AGENDA_URL`, a agenda local funciona e o sync fica desligado.
2. **n8n:** o webhook recebe
   `{ acao, agendamento_id, google_event_id, google_color_id, titulo,
      descricao, inicio, fim, status, paciente_nome, paciente_telefone }`,
   cria/atualiza/apaga o evento no Google (usando `colorId = google_color_id`)
   e **responde `{ google_event_id }`** — o app grava esse id pra casar depois.

### Google → Painel (`agenda-webhook`)
Sincroniza de volta (evento criado/movido/apagado no Google).
1. **Secret** `N8N_AGENDA_SECRET` na função `agenda-webhook`.
2. **n8n:** um trigger do Google Calendar (ou polling) faz `POST` para a função
   **`agenda-webhook`** com
   `{ acao:"upsert"|"delete", google_event_id, unidade_id?, titulo?, descricao?,
      inicio?, fim?, status? }` e o header `X-Painel-Secret`.

### Cores
As categorias (Configurações/seed: Tráfego=roxo, Clínica=azul, Cobrança=vermelho)
mapeiam para os 11 `colorId` do Google (ver `src/lib/google-cores.ts`). A
recepção escolhe a categoria no agendamento e a cor vai junto pro Google.

---

## Resumo das Edge Functions

| Função           | Direção            | Autenticação                    |
|------------------|--------------------|---------------------------------|
| `mensagem-enviar`| envio WhatsApp     | JWT do usuário (admin/unidade)  |
| `uazapi-webhook` | recebe não-oficial | `X-Painel-Secret` do canal      |
| `zernio-webhook` | recebe oficial     | HMAC (`x-*-signature`)          |
| `agenda-sync`    | painel → Google    | JWT do usuário                  |
| `agenda-webhook` | Google → painel    | `N8N_AGENDA_SECRET`             |

Todas são autossuficientes — dá pra colar e deployar pelo editor do Dashboard.
