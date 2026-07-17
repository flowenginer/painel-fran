# CRM Clínica (Odontologia)

Mini CRM para clínica odontológica — leads de tráfego chegam no WhatsApp, a
recepção atende, marca a visita e agenda; outra atendente completa o cadastro
quando o paciente chega. **Multi-unidade** (uma instância para todas as
unidades) e atendimento **100% humano** (sem IA de conversa).

É um **fork do Painel Fran** (mesmo stack e mesmas primitivas de auth, layout e
UI), enxugado para o domínio da clínica.

> ⚠️ **Esta pasta é um _staging_ dentro do repositório `painel-fran`.** Ela foi
> montada aqui só porque não deu para clonar o repo novo direto na sessão. O
> destino é o repositório **próprio** `flowenginer/clinica-crm`: baixe o
> conteúdo de `clinica-crm/` e suba na **raiz** desse repo novo (esta pasta
> **não** faz parte do build do painel-fran e não deve ser mesclada nele).

---

## Stack

- **Vite + React 18 + TypeScript**
- **Tailwind + shadcn/ui** (primitivas em `src/components/ui/`)
- **Supabase** (Postgres + RLS + Auth + Edge Functions Deno)
- **React Query** + **React Router v6**
- Deploy do frontend na **Vercel** (`tsc && vite build`).

## O que já existe (Fundação)

Só o **esqueleto** do fork. As partes novas vêm em fases seguintes (ver abaixo).

- **Auth multiusuário + papéis:** `admin` (dona, vê todas as unidades) e
  `atendente` (recepção, vê só a unidade dela). `AuthContext`/`useAuth`,
  `ProtectedRoute`, `PermissionRoute` e catálogo de permissões
  (`src/lib/permissoes.ts`).
- **Multi-unidade:** tabela `unidades`; `unidade_id` nas tabelas core; RLS por
  unidade (helpers `crm_is_admin()` / `crm_minha_unidade()`).
- **`pacientes`:** pré-cadastro (só telefone + origem) → cadastro completo
  (nome, email, procedimento) + `status_funil`
  (`lead_novo → em_atendimento → agendou → compareceu → paciente | perdido`) +
  campos de atribuição de anúncio (`origem_*`, preenchidos em fase futura).
- **Layout base** (`AppLayout`/`Header`/`Sidebar`) e **páginas-esqueleto** com
  rotas e permissões: Dashboard, Pacientes, Conversas, Agenda, Configurações,
  Usuários.
- **Edge Function `admin-usuarios`:** o admin cria/edita/remove atendentes e
  define a unidade e as permissões de cada uma (com salvaguarda do "último
  admin").

## Fora do escopo desta fundação (fases seguintes)

- Inbox funcional (Conversas) com os **dois canais** de WhatsApp (oficial p/
  captação+atribuição, não-oficial p/ atendimento).
- Atribuição de anúncio (parsear o `referral` do Click-to-WhatsApp no webhook do
  canal oficial → `origem_campanha`/`origem_criativo`).
- Agenda com **sync bidirecional ao Google Calendar** (via n8n) + cores
  configuráveis pelas recepcionistas (mapeadas aos `colorId` fixos do Google).
- Lembretes automáticos (retorno de 6 em 6 meses, Clube do Sorriso de 4 em 4).
- Dashboard do gestor de tráfego.

---

## Setup

### 1. Supabase

1. Crie um projeto novo no [Supabase](https://supabase.com).
2. No **SQL Editor**, rode a migração `supabase/migrations/0001_fundacao.sql`
   (idempotente — pode rodar de novo sem problema). Ela cria `unidades`,
   `usuarios`, `pacientes`, os helpers de RLS, o trigger que provisiona o perfil
   no signup e uma unidade inicial ("Matriz").
3. Faça o deploy da Edge Function `admin-usuarios` (cole o conteúdo de
   `supabase/functions/admin-usuarios/index.ts` no editor de Edge Functions do
   Dashboard, ou use a CLI). Ela usa `SUPABASE_URL`, `SUPABASE_ANON_KEY` e
   `SUPABASE_SERVICE_ROLE_KEY`, que já ficam disponíveis para a função.

### 2. Primeiro admin (bootstrap)

1. Crie o usuário da dona em **Authentication > Users** (ou pela tela de login,
   se o signup estiver habilitado). O trigger cria o perfil em `usuarios`
   automaticamente.
2. Promova-o a admin **uma vez**, no SQL Editor:
   ```sql
   UPDATE public.usuarios SET role = 'admin', ativo = true
    WHERE email = 'dona@clinica.com';
   ```
3. A partir daí, a dona cria as demais atendentes pela tela **Usuários** (via a
   Edge Function `admin-usuarios`).

### 3. Frontend (local)

```bash
npm install
cp .env.example .env   # preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm run dev
```

Build de produção:

```bash
npm run build   # tsc && vite build
```

### 4. Deploy (Vercel)

- Importe o repo `flowenginer/clinica-crm` na Vercel.
- Framework: **Vite**. Build: `npm run build`. Output: `dist`.
- Variáveis de ambiente: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- O `vercel.json` já faz o rewrite de SPA (todas as rotas → `index.html`).

---

## Estrutura

```
clinica-crm/
├── index.html
├── package.json
├── vite.config.ts · tsconfig*.json · tailwind.config.ts · postcss.config.js
├── vercel.json
├── .env.example
├── src/
│   ├── main.tsx · App.tsx · index.css
│   ├── lib/           supabase, utils, types, permissoes
│   ├── contexts/      AuthContext (usuarios + unidade_id)
│   ├── hooks/         useAuth
│   ├── components/     ProtectedRoute, PermissionRoute, ui/*, layout/*
│   └── pages/         Login, Dashboard, Pacientes, Conversas, Agenda,
│                      Configuracoes, Usuarios (esqueletos)
└── supabase/
    ├── migrations/    0001_fundacao.sql
    └── functions/     admin-usuarios/
```

## Modelo de dados (resumo)

- **`unidades`** — `id`, `nome`, `ativo`.
- **`usuarios`** (1:1 com `auth.users`) — `role` (`admin`|`atendente`),
  `unidade_id` (NULL p/ admin), `permissoes` (JSONB `{paginas, acoes}`), `ativo`.
- **`pacientes`** — `unidade_id`, `telefone` (único por unidade), `nome`,
  `email`, `procedimento`, `status_funil`, `responsavel_id`, `origem_*`.

**RLS por unidade:** admin vê tudo (`crm_is_admin()`); atendente vê só a sua
(`unidade_id = crm_minha_unidade()`).
