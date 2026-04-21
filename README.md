# Painel Fran

Sistema de gestão de devedores para **Stival Advogados**. Integra com a API do Cedrus (importação de devedores) e dispara primeira mensagem via webhook para o workflow n8n da Fran (agente de IA de negociação).

> Ver [PRD v2](./docs/PRD.md) para escopo completo.

## Stack

- **React 18** + **TypeScript** + **Vite**
- **Tailwind CSS** + **shadcn/ui** (tema escuro)
- **Supabase** (Auth + Postgres + Realtime + Edge Functions)
- **TanStack Query** para cache e fetching
- **React Router v6** para roteamento
- **React Hook Form** + **Zod** para formulários

## Pré-requisitos

- Node.js 18+ e npm
- Projeto Supabase com as tabelas criadas (ver SQLs em `/supabase/migrations`)
- Usuário admin criado em Supabase Auth

## Setup local

```bash
# 1. Instalar dependências
npm install

# 2. Copiar template de variáveis de ambiente
cp .env.example .env

# 3. Preencher .env com as credenciais do seu projeto Supabase
# VITE_SUPABASE_URL=https://seu-projeto.supabase.co
# VITE_SUPABASE_ANON_KEY=sua-anon-key

# 4. Rodar em desenvolvimento
npm run dev
```

Acessa em http://localhost:5173.

## Estrutura

```
painel-fran/
├── src/
│   ├── components/          # Componentes reutilizáveis (shadcn + custom)
│   ├── pages/               # Páginas (Login, Dashboard, Configuracoes, etc.)
│   ├── hooks/               # React hooks customizados
│   ├── lib/
│   │   ├── supabase.ts      # Client Supabase
│   │   ├── types.ts         # Types do banco
│   │   └── utils.ts         # Helpers (cn, etc.)
│   ├── App.tsx
│   └── main.tsx
├── public/
├── supabase/
│   ├── functions/           # Edge Functions (cedrus-buscar, disparar-lote)
│   └── migrations/          # SQLs
├── docs/
│   └── PRD.md
└── package.json
```

## Scripts

- `npm run dev` — servidor de desenvolvimento
- `npm run build` — build de produção (pasta `dist/`)
- `npm run preview` — preview do build

## Backlog

Acompanhamento das tasks pelo GitHub Issues com labels de fase (`fase-1-infra`, `fase-2-frontend-base`, etc.). Ver PRD para detalhes.

### Status atual

- ✅ TASK-001 a 004: Infraestrutura do banco (tabelas, RLS, Realtime)
- ✅ TASK-005: Projeto inicial (este commit)
- ✅ TASK-006: Login
- ⏳ TASK-007: Layout base
- ...

## Credenciais de acesso

Admin do painel criado no Supabase Auth:
- Email: controlemchels@gmail.com
- Senha: (armazenada de forma segura, não neste repo)

## Licença

Proprietário — Stival Advogados.
