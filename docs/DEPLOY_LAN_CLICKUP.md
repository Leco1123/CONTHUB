# Deploy LAN com ClickUp

Este guia serve para o cenário em que o ContHub fica publicado em rede local, por exemplo:

- `http://192.168.0.94:9494`

Nesse modelo, normalmente existe:

- `Node.js` ouvindo em `127.0.0.1:3000`
- `nginx` ou proxy reverso publicando em `:9494`

## 1. Variáveis de ambiente da instância publicada

No servidor que está por trás da porta `9494`, use um `.env` parecido com este:

```env
DATABASE_URL="postgresql://usuario:senha@127.0.0.1:5432/conthub_prod?schema=public"
SHEET_BACKUP_ROOT="C:/ContHub/sheet-backups"
SESSION_SECRET="<gere-um-segredo-forte>"

APP_BASE_URL="http://192.168.0.94:9494"
ALLOWED_ORIGINS="http://192.168.0.94:9494"

PORT=3000
NODE_ENV=development
SESSION_COOKIE_SECURE=false
SESSION_COOKIE_DOMAIN=""

CLICKUP_API_TOKEN="<token-do-clickup>"
CLICKUP_TICKETS_ENABLED="true"
CLICKUP_LIST_ID="901713802677"
CLICKUP_NEXT_ACTIONS_LIST_ID="901713939274"
CLICKUP_ASSIGNEE_IDS="101163897"
CLICKUP_STATUS_ABERTO="a fazer"
CLICKUP_STATUS_EM_ANDAMENTO="fazendo"
CLICKUP_STATUS_AGUARDANDO="falta info"
CLICKUP_STATUS_CONCLUIDO="encerrado"
```

## 2. Por que isso importa

Se a instância publicada continuar com:

- `APP_BASE_URL="http://localhost:3000"`
- `ALLOWED_ORIGINS` vazio ou errado
- `CLICKUP_LIST_ID` antigo

você vai ver sintomas como:

- retorno para login em módulos específicos
- erro `503` nas rotas do dashboard
- chamado sendo salvo no fallback local
- chamado indo para a lista errada do ClickUp

## 3. Destino correto do ClickUp

Para mandar os chamados para:

- `Integração -> EQUIPE FRANKLIN -> CONTHUB - Chamados`

o valor precisa ser:

```env
CLICKUP_LIST_ID="901713802677"
```

Para o bloco de próximas ações do ClickUp:

```env
CLICKUP_NEXT_ACTIONS_LIST_ID="901713939274"
```

## 4. Reinício obrigatório

Depois de alterar o `.env`, reinicie a instância do backend que fica atrás do proxy.

Se estiver usando `npm start` manual:

```powershell
cd "C:\caminho\do\conthub le"
npm start
```

Se estiver usando PM2:

```powershell
pm2 restart conthub
```

Se estiver usando NSSM ou serviço Windows, reinicie o serviço correspondente.

## 5. Checklist de validação

Depois do restart:

1. abra `http://192.168.0.94:9494/login/login.html`
2. faça login
3. abra o dashboard
4. crie um chamado
5. confirme no ClickUp se ele caiu em:
   - `CONTHUB - Chamados`
6. abra o DevTools e verifique se estas rotas deixam de falhar:
   - `/api/dashboard/tickets`
   - `/api/dashboard/clickup-next-actions`

## 6. Observação importante

Para LAN sem HTTPS, use:

- `NODE_ENV=development`
- `SESSION_COOKIE_SECURE=false`

Se você subir isso com domínio e HTTPS de verdade, aí volte para:

- `NODE_ENV=production`
- `SESSION_COOKIE_SECURE=true`
- `APP_BASE_URL` com `https://`
