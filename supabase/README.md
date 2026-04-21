# Supabase — Painel Fran

Esta pasta contém as Edge Functions do painel. O schema do banco (tabelas
`fran_devedores`, `fran_instituicoes`, `fran_config`, `fran_disparos`,
`fran_memory`) vive diretamente no Supabase Cloud e é mantido via UI do
projeto.

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
│   └── disparar-lote/
│       ├── index.ts                     # valida limites + POST ao webhook n8n
│       └── deno.json
└── README.md                            # este arquivo
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
```

Ver PRD v2 para RLS e seeds iniciais de `fran_config`.
