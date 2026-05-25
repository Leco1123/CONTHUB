# ContHub

ContHub e um painel web interno com backend em Node.js, PostgreSQL e Prisma, focado em operacao, modulos internos, dashboards, sheets e rotinas contabeis/comerciais.

## Stack

- Node.js
- Express
- PostgreSQL
- Prisma
- HTML, CSS e JavaScript
- Sessao por cookie com `express-session`

## Estrutura principal

- `server/`: backend, middlewares e rotas
- `prisma/`: schema e migracoes
- `public/`: modulos web
- `docs/`: documentacao operacional

## Como rodar localmente

1. Instale as dependencias:

```powershell
npm install
```

2. Crie um `.env` a partir de [./.env.example](./.env.example)

3. Gere o Prisma Client:

```powershell
npm run prisma:generate
```

4. Aplique as migracoes:

```powershell
npx prisma migrate deploy --schema prisma/schema.prisma
```

5. Inicie a aplicacao:

```powershell
npm start
```

## Seguranca e deploy

O guia de producao fica em [docs/DEPLOY_PRODUCAO.md](./docs/DEPLOY_PRODUCAO.md).
Os comandos diretos de subida e atualizacao ficam em [docs/COMANDOS_DEPLOY.md](./docs/COMANDOS_DEPLOY.md).

Antes de publicar:

- troque todos os segredos do `.env`
- use `APP_BASE_URL` com `https://`
- restrinja `ALLOWED_ORIGINS` ao dominio final
- valide os perfis de acesso

## Observacoes

- `.env` nao deve ser versionado
- producao deve rodar com `NODE_ENV=production`
- os modulos contabeis e comerciais tem regras de acesso no backend e no frontend
