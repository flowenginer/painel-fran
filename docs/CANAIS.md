# Múltiplos canais de conexão (Fase 1)

Vários números de WhatsApp (instâncias UAZAPI) para **distribuir volume e
reduzir risco de bloqueio**. Cada conversa fica "grudada" em um número: a
resposta sai sempre pelo **mesmo número que o lead falou**.

## Como funciona

- **`fran_canais`** (nova tabela): registro dos números. Campos: `nome`,
  `instancia` (o identificador que o n8n usa para rotear), `numero` (exibição),
  `ativo`, `peso` (fatia de disparos), `ordem`.
- **`fran_memory.canal`** (nova coluna): instância por onde cada mensagem
  passou. É o que mantém o "grude" da conversa.
- **`fran_canal_conversa(telefone)`**: retorna a instância da última mensagem
  que teve canal — usada pela Edge Function para responder pelo mesmo número.

A Edge Function `enviar-mensagem`:
1. Resolve a instância da conversa (RPC acima) ou usa o canal padrão (ativo,
   menor ordem).
2. Inclui `instancia` no payload enviado ao n8n.
3. Grava `canal = instancia` na `fran_memory`.

> 1 único webhook n8n. O roteamento é por `instancia` no payload.

## Passos para ativar

1. **Banco:** rodar `supabase/migrations/0013_canais.sql` no SQL Editor.
2. **Configurações → Canais de conexão:** cadastrar os 5 números (nome +
   `instancia` + peso). A `instancia` deve ser o identificador que o n8n usa.
3. **Deploy** da Edge Function `enviar-mensagem` (já aceita/usa `instancia`).
4. **n8n (contrato):**
   - **Ao ENVIAR:** ler o campo `instancia` do payload e rotear para a
     instância UAZAPI correspondente. Se vier vazio/nulo, usar o número padrão
     (comportamento atual).
   - **Ao RECEBER:** além de gravar a mensagem na `fran_memory`, preencher a
     coluna `canal` com a instância que recebeu a mensagem (o mesmo valor da
     `instancia` cadastrada em `fran_canais`).

Enquanto o n8n não preenche `canal` no inbound nem lê `instancia` no envio,
tudo continua funcionando pelo número padrão (rollout seguro).

## Tela de conexão (QR) multi-canal — Fase 1.5

A página **WhatsApp** agora mostra **um card por canal**, cada um com seu
próprio Status / QR Code / Conectar / Desconectar. O painel envia a
`instancia` (nome da instância UAZAPI, ex.: `qi06bK`) para o `uazapi-proxy`,
que repassa ao n8n.

### n8n — resolver o token por instância

Cada instância UAZAPI tem o **seu próprio token**. O fluxo precisa converter
`body.instancia` (nome) → token da instância. Adicione um nó **Code**
("Resolver Token") logo após o **Validar Secret** (saída válida), antes do
**Switch**:

```js
const body = $json.body;
// nome da instância → token da instância (cada número tem o seu)
const tokens = {
  'qi06bK': 'd41de9c4-25f6-4191-94f1-664ede75021e', // Canal 1
  // 'nomeInstancia2': 'token2',
  // 'nomeInstancia3': 'token3',
};
const token = tokens[body.instancia] || 'd41de9c4-25f6-4191-94f1-664ede75021e';
return { ...$json, token };
```

Depois, em **todos** os nós HTTP (GET status, POST connect, POST disconnect,
SEND text/audio/document/image), troque o valor fixo do header `token` por:

```
{{ $('Resolver Token').item.json.token }}
```

Assim cada ação (incluindo o envio) usa o número certo. Alternativa dinâmica:
em vez do mapa estático, chamar `/instance/all` (admintoken) e achar o token
pelo `name == body.instancia`.

## Fase 2 (pendente)

Distribuição anti-bloqueio no **primeiro contato** (disparo): o painel escolhe
o canal por peso e manda a `instancia` no payload do disparo.
