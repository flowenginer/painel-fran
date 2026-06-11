# Supabase — Painel Fran

Esta pasta contém as Edge Functions do painel. O schema do banco (tabelas
`fran_devedores`, `fran_instituicoes`, `fran_config`, `fran_disparos`,
`fran_fila_disparo`, `fran_memory`) vive diretamente no Supabase Cloud e é
mantido via UI do projeto. DDLs versionados ficam em `migrations/`.

## Estrutura

```
supabase/
├── functions/
│   ├── _shared/
│   │   └── cors.ts                      # helpers CORS
│   ├── cedrus-buscar/
│   │   ├── index.ts                     # entry point da Edge Function
│   │   ├── cedrus-client.ts             # GET autenticado (Basic Auth) com timeout
│   │   ├── telefones.ts                 # normalização + priorização de celular
│   │   ├── valores.ts                   # parse BR ("1.500,00" → 1500.00)
│   │   ├── alunos.ts                    # extração de nomes + acordo anterior
│   │   ├── transform.ts                 # devedor bruto → DevedorNormalizado
│   │   └── deno.json                    # config do Deno
│   ├── _shared/
│   │   └── disparo-core.ts              # lógica de disparo compartilhada
│   ├── disparar-lote/
│   │   ├── index.ts                     # disparo manual: valida limites + POST n8n
│   │   └── deno.json
│   ├── processar-fila/
│   │   ├── index.ts                     # drip automático da fila (chamado pelo pg_cron)
│   │   └── deno.json
│   └── uazapi-proxy/
│       ├── index.ts                     # proxy para o webhook UAZAPI no n8n
│       └── deno.json
└── README.md                            # este arquivo
```

## Deploy da Edge Function `uazapi-proxy`

Proxy que repassa chamadas do painel para um workflow do n8n da Chelsan
("Painel Fran ⇄ UAZAPI"). A indireção é necessária porque a UAZAPI
restringe acesso por IP — o n8n da Chelsan já está na allowlist, o
Supabase Edge não.

```bash
supabase functions deploy uazapi-proxy
```

Pré-requisitos em `fran_config`:
- `uazapi_webhook_url` — URL do nó Webhook do workflow no n8n
- `uazapi_webhook_secret` — valor que o nó IF do workflow valida em
  `X-Painel-Secret`

Contrato:
```json
// Request
POST /functions/v1/uazapi-proxy
Authorization: Bearer <user-jwt>
{ "acao": "status" | "connect" | "disconnect" }

// Response (já desencapsulado do array do n8n)
{
  "ok": true,
  "estado": "connected" | "connecting" | "disconnected",
  "nome_instancia": "qi06bK",
  "telefone": "556291507974",
  "nome_perfil": "Stival Advogados",
  "foto_perfil": "https://...",
  "qrcode": "data:image/png;base64,..." | null,
  "paircode": null,
  "ultima_desconexao": "...",
  "motivo_desconexao": "...",
  "current_presence": "available" | "unavailable",
  "is_business": true
}
```

## Deploy da Edge Function `cedrus-buscar`

### Pré-requisitos

1. [Supabase CLI](https://supabase.com/docs/guides/cli) instalado:
   ```bash
   brew install supabase/tap/supabase
   ```
2. Login:
   ```bash
   supabase login
   ```
3. Link do projeto (na raiz do repo):
   ```bash
   supabase link --project-ref <REF-DO-PROJETO>
   ```

### Passo a passo

```bash
# 1. Deploy da função
supabase functions deploy cedrus-buscar

# 2. As variáveis de ambiente SUPABASE_URL, SUPABASE_ANON_KEY e
#    SUPABASE_SERVICE_ROLE_KEY são injetadas automaticamente pelo
#    runtime do Supabase — não precisa setar manualmente.

# 3. Antes do primeiro uso, preencha em fran_config:
#    - cedrus_apikey  → APIKEY do Cedrus
#    - cedrus_url_base (opcional, padrão "https://api.sistemadecobranca.com.br:3001/v1")
#
#    Pode ser feito direto na UI do Supabase (SQL Editor) ou, após
#    concluir a TASK-019, pela tela de Configurações do painel.
```

### Teste via curl

```bash
curl -i -X POST \
  "https://<REF>.supabase.co/functions/v1/cedrus-buscar" \
  -H "Authorization: Bearer <USER-JWT>" \
  -H "Content-Type: application/json" \
  -d '{ "cod_credor": "2024", "status": "A", "num_pagina": 1 }'
```

### Contrato da função

**Request body** (POST JSON):
- `id_devedor`? string — busca individual
- `cod_credor`? string — busca em lote por credor
- `cod_devedor`? string — complementa cod_credor
- `cnpj_cpf`? string — busca individual por CPF (só dígitos)
- `status`? "A" | "P" | "C" | "S" — padrão `A`
- `dt_vencimento_de`? "dd/mm/yyyy"
- `dt_vencimento_ate`? "dd/mm/yyyy"
- `num_pagina`? number — padrão 1, 50 devedores por página

Pelo menos um entre `id_devedor`, `cod_credor`, `cod_devedor` ou
`cnpj_cpf` é obrigatório.

**Response 200**:
```json
{
  "devedores": [
    {
      "id_devedor": "123",
      "cod_credor": "2024",
      "cod_devedor": "9876",
      "cpf": "51797836153",
      "nome_devedor": "Claydson Silva Rodrigues",
      "email": "...",
      "telefone": "5562991357861",
      "telefone_2": "5564984270735",
      "telefone_3": "556232905913",
      "endereco": "Rua X, 123",
      "bairro": "...",
      "cidade": "...",
      "estado": "GO",
      "cep": "74000000",
      "nome_aluno": "Abraão; Calebe",
      "valor_original": 45000.00,
      "valor_atualizado": 66215.00,
      "qtd_parcelas_aberto": 48,
      "ano_inicial_dividas": 2010,
      "ano_final_dividas": 2026,
      "acordo_anterior": "sim",
      "categoria": "COBRANÇA ARQUIVADA",
      "dado_adicional": "..."
    }
  ],
  "pagina": 1,
  "tamanhoPagina": 50,
  "possuiProximaPagina": false,
  "total": 1,
  "message": null
}
```

**Erros**:
- `400` — validação de filtros
- `401` — não autenticado
- `500` — API key não configurada ou erro interno
- `502` — falha de rede com Cedrus
- `504` — timeout (60s)

## Deploy da Edge Function `disparar-lote`

Mesma sequência do `cedrus-buscar`:

```bash
supabase functions deploy disparar-lote
```

> Esta função é **autossuficiente** (sem imports de `_shared`), então também
> pode ser deployada colando o `index.ts` no editor de Edge Functions do
> Dashboard, sem CLI. A lógica de disparo é compartilhada por cópia com
> `processar-fila` — ao alterá-la, replicar nas duas.

### Contrato

**Request** (POST JSON, requer JWT do operador):
```json
{
  "devedor_ids": [123, 456, 789],
  "campanha": "cobranca_abr_2026"
}
```

**Response 200**:
```json
{
  "ok": true,
  "enviados": 3,
  "erros": 0,
  "inelegiveis": [],
  "limite_diario": 40,
  "limite_restante": 37,
  "webhook_error": null
}
```

**Response 400** (validação falhou antes de chamar n8n):
- Limite diário atingido ou ultrapassado pela seleção
- Fora do horário (fran_config.horario_disparo_inicio/fim em SP)
- URL do webhook n8n não configurada
- Nenhum devedor elegível (status ≠ pendente, sem telefone, etc.)

**Pré-requisitos** em `fran_config`:
- `n8n_webhook_url` — obrigatório
- `limite_diario_disparos` — default 40
- `horario_disparo_inicio` — default "08:00"
- `horario_disparo_fim` — default "20:00"

**Efeitos colaterais** quando o webhook responde 2xx:
- INSERT em `fran_disparos` (1 linha por devedor, `status_envio='enviado'`)
- UPDATE em `fran_devedores`: `status_negociacao='primeira_msg'`,
  `data_primeiro_disparo=NOW()`, `data_ultimo_contato=NOW()`

Em caso de erro do webhook:
- INSERT em `fran_disparos` com `status_envio='erro'` e `erro_detalhes`
- NÃO altera o status do devedor (permite reprocessar)

## Deploy da Edge Function `processar-fila`

Processa a **fila de distribuição** em gotejamento (drip). Pensada para ser
chamada periodicamente pelo `pg_cron` (a cada 10 min) e também manualmente
pela UI ("Processar agora", na tela Fila de Disparo).

```bash
supabase functions deploy processar-fila
```

> Também **autossuficiente** (sem `_shared`): pode ser deployada colando o
> `index.ts` no editor do Dashboard, sem CLI. Compartilha a lógica de disparo
> por cópia com `disparar-lote` — ao alterá-la, replicar nas duas.

A cada execução respeita, nesta ordem: `fila_ativa` → `fila_dias_semana` →
janela de horário → `fila_disparos_por_hora` → `limite_diario_disparos`. Ao
bater o limite do dia, não envia mais nada e retoma naturalmente no próximo
dia permitido.

### Setup completo (uma vez)

1. Rode `migrations/0001_fila_disparo.sql` e `migrations/0002_fila_dias_semana.sql`
   no SQL Editor (cria a tabela `fran_fila_disparo`, RLS e seeds de config).
2. Faça o deploy desta função.
3. Siga o passo 5 do SQL para gerar o `fila_cron_secret` e agendar o
   `pg_cron` chamando esta função.
4. Na tela **Configurações**, ajuste "Disparos por hora (fila)" e o limite
   diário; na tela **Fila de Disparo**, clique em **Ativar**.

### Contrato

**Request** (POST JSON). Autorização por um dos dois:
- header `x-cron-secret: <fila_cron_secret>` (usado pelo pg_cron), ou
- `Authorization: Bearer <user-jwt>` (botão "Processar agora").

```json
// Response 200 (exemplo)
{ "ok": true, "processados": 2, "enviados": 2, "erros": 0,
  "restante_dia": 38, "limite_diario": 40, "por_hora": 10 }

// Quando não há nada a fazer (ainda 200):
{ "ok": true, "processados": 0, "enviados": 0, "motivo": "fila_pausada" }
```

Motivos possíveis em `motivo`: `fila_pausada`, `fora_dia_semana`,
`fora_horario`, `fila_vazia`, `limite_diario_atingido`,
`limite_hora_atingido`, `taxa_por_hora_zerada`, `nenhum_elegivel`.

Configs da fila (em `fran_config`, editáveis na tela Fila de Disparo):
`fila_ativa`, `fila_disparos_por_hora`, `fila_dias_semana` (ex: `1,2,3,4,5`
= seg-sex; 0=dom..6=sáb), além de `limite_diario_disparos` e
`horario_disparo_inicio`/`fim` (compartilhados com o disparo manual).

**Efeitos colaterais** por devedor enviado: INSERT em `fran_disparos`,
UPDATE do item da fila para `enviado`, UPDATE do devedor
(`status_negociacao='primeira_msg'`, datas de disparo/contato).

## Deploy da Edge Function `admin-usuarios`

Gerência de usuários do painel pelo admin (criar, listar, atualizar papel/
status/permissões, redefinir senha, remover). A autorização é feita na
própria função: só executa se o JWT do chamador pertencer a um usuário com
`role = 'admin'` e `ativo = true` em `fran_usuarios`.

```bash
supabase functions deploy admin-usuarios
```

As variáveis `SUPABASE_URL`, `SUPABASE_ANON_KEY` e
`SUPABASE_SERVICE_ROLE_KEY` são injetadas automaticamente pelo runtime —
não precisa configurar nada além do deploy. Requer a migração
`0004_usuarios_perfis.sql` aplicada (tabela `fran_usuarios` + trigger).

### Contrato

**Request** (POST JSON, requer JWT de admin). Campo `action`:
- `listar` → `{ usuarios: [...] }`
- `criar` `{ email, password, nome?, role?, recebe_distribuicao?, permissoes? }`
- `atualizar` `{ id, nome?, role?, ativo?, recebe_distribuicao?, permissoes? }`
- `resetar_senha` `{ id, password }`
- `remover` `{ id }` (exclui do auth; o perfil cai por `ON DELETE CASCADE`)

**Salvaguardas**: não permite remover/rebaixar/desativar o último admin
ativo, nem remover a si mesmo.

**Erros**: `401` não autenticado · `403` chamador não é admin · `404`
usuário não encontrado · `409` conflito (e-mail já existe, último admin) ·
`400` validação.

## Schema do banco (referência)

O schema está ativo no Supabase via UI. Para recriar em outro ambiente,
veja o PRD seção 4.2 ou rode os DDLs abaixo:

```sql
CREATE TABLE public.fran_instituicoes (
    id BIGSERIAL PRIMARY KEY,
    cod_credor TEXT NOT NULL UNIQUE,
    nome TEXT NOT NULL,
    ativo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.fran_config (
    id BIGSERIAL PRIMARY KEY,
    chave TEXT NOT NULL UNIQUE,
    valor TEXT,
    descricao TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.fran_disparos (
    id BIGSERIAL PRIMARY KEY,
    devedor_id BIGINT REFERENCES fran_devedores(id),
    telefone TEXT NOT NULL,
    data_disparo TIMESTAMPTZ DEFAULT NOW(),
    status_envio TEXT DEFAULT 'enviado',
    erro_detalhes TEXT,
    webhook_response JSONB,
    usuario_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fila de distribuição (drip). DDL completo + RLS + pg_cron em
-- migrations/0001_fila_disparo.sql
CREATE TABLE public.fran_fila_disparo (
    id BIGSERIAL PRIMARY KEY,
    devedor_id BIGINT NOT NULL REFERENCES fran_devedores(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'na_fila',  -- na_fila|enviado|erro|cancelado
    prioridade INT NOT NULL DEFAULT 0,
    campanha TEXT,
    tentativas INT NOT NULL DEFAULT 0,
    erro_detalhes TEXT,
    enfileirado_por UUID REFERENCES auth.users(id),
    data_processado TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Ver PRD v2 para RLS e seeds iniciais de `fran_config`.
