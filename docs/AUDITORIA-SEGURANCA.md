# Auditoria de Segurança — Painel Fran

**Foco:** impedir extração indevida de dados (leads, conversas, segredos).
**Escopo:** RLS do banco, Edge Functions, Storage, segredos e exposição no cliente.

## Resumo

O ponto forte já existente: **n8n e Edge Functions usam `service_role`** (que
ignora RLS) e o frontend usa **apenas a anon key + JWT do usuário**. Não há
segredo nem `service_role` no código do cliente. As tabelas de leads/conversas
(`fran_devedores`, `fran_memory`, `fran_conversas`) já têm **RLS por dono**
(Fase 5).

Os riscos encontrados estavam em **tabelas auxiliares com RLS permissiva ou não
verificada**, que permitiam a um usuário autenticado (operador) — ou, no pior
caso de RLS desligada, até anônimo — ler dados além do seu escopo.

## Achados e correções (migração `0012_hardening_rls.sql`)

| # | Severidade | Achado | Correção |
|---|---|---|---|
| 1 | **ALTA** | `fran_config` legível por qualquer autenticado → operador podia ler **segredos** (`cedrus_apikey`, `uazapi_webhook_secret`, `uazapi_webhook_url`, `n8n_webhook_url`, `fila_cron_secret`). Com o secret do webhook, dava pra **enviar WhatsApp como a empresa**. | RLS estrita: segredos só para **admin**; chaves operacionais (limites/horários/fila) seguem legíveis. Escrita só admin. |
| 2 | **MÉDIA-ALTA** | `fran_disparos` (telefones/contatos de todos os leads) com RLS permissiva → operador podia **enumerar todos os leads**, furando o isolamento por dono. | RLS: `SELECT` só do **admin** ou do **dono** do lead (join em `responsavel_id`). Escrita só admin (gravação real é via `service_role`). |
| 3 | **MÉDIA-ALTA** | `fran_fila_disparo` (mesma exposição de leads). | Igual ao #2. |
| 4 | **MÉDIA** | `fran_instituicoes` sem RLS verificada → risco de leitura **anônima** se a RLS estivesse desligada. | RLS habilitada; leitura por autenticado, escrita por admin. |

> A migração **habilita RLS** nessas tabelas de forma idempotente — fechando
> inclusive o pior caso (RLS desligada = leitura anônima via anon key, que é
> pública por estar no frontend).

## Observações / hardening recomendado (não bloqueante)

- **MÉDIA — Mídia em bucket público (`crm-midia`):** quem tiver a URL lê o
  arquivo (sem auth). Mitigações atuais: caminho com **UUID** (não enumerável)
  e a URL fica só na `fran_memory` (protegida por RLS). Como o n8n/UAZAPI
  precisam puxar a URL para enviar, o bucket é público de propósito. Evolução
  recomendada: bucket **privado + signed URLs** geradas na leitura.
- **BAIXA — `fran_listar_operadores`** expõe nome/e-mail/papel dos usuários
  ativos a qualquer autenticado (necessário para o seletor de transferência).
  Aceitável para uso interno; dá para esconder o e-mail de não-admin.
- **BAIXA — Página Configurações:** mesmo com a RLS de segredos, vale deixá-la
  **só para admin** no menu (hoje é delegável por permissão).
- **BAIXA — Senha mínima 6 caracteres** (Supabase Auth). Considerar exigir
  mais e ativar proteção contra senhas vazadas no Supabase Auth.
- **INFO — CORS `*` nas Edge Functions:** ok, pois exigem JWT (Bearer), não
  cookies — sem risco de CSRF.
- **INFO — n8n:** o `uazapi_webhook_secret` valida o chamador; mantenha-o
  forte e rotacione se vazar. As Edge Functions já propagam só o necessário.

## O que NÃO é problema (verificado)

- Sem `service_role`/segredos no frontend.
- Edge Functions validam JWT e checam papel de admin onde necessário.
- Interpolações em queries usam valores saneados (telefone só dígitos, ids
  numéricos, uuid do JWT) ou parâmetros — sem injeção de SQL aparente.
- RPCs `SECURITY DEFINER` têm checagem de permissão interna e `EXECUTE`
  restrito (a de atribuição é só `service_role`).

## Importante

Nenhum sistema é "100% impossível de invadir". Esta auditoria fecha os
vetores de **extração de dados** conhecidos no código atual. Recomenda-se,
além da migração: ativar MFA/proteções do Supabase Auth, monitorar logs, e
rotacionar segredos periodicamente.
