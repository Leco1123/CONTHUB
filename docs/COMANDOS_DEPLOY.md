# Comandos de Deploy do ContHub

Este roteiro foi pensado para subir o ContHub pela primeira vez e para atualizar depois, sem improviso.

## 1. Primeira subida

Na raiz do projeto:

```powershell
npm install
npm run security:secret
```

Use o segredo gerado no arquivo `.env` de produção, tomando como base [../.env.production.example](../.env.production.example).

Depois rode:

```powershell
npm run prisma:generate
npx prisma migrate deploy --schema prisma/schema.prisma
npm start
```

## 2. Verificação inicial

Com a aplicação rodando:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3000/api/health | Select-Object -ExpandProperty Content
```

Se estiver atrás de proxy e domínio:

```powershell
Invoke-WebRequest -UseBasicParsing https://app.seudominio.com.br/api/health | Select-Object -ExpandProperty Content
```

## 3. Backup manual antes de atualizar

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\backup-conthub.ps1
```

## 4. Atualização de versão

Quando for publicar uma nova versão:

```powershell
git pull
npm install
npm run prisma:generate
npx prisma migrate deploy --schema prisma/schema.prisma
npm start
```

## 5. Checklist mínimo após subir

Teste estes pontos:

- `GET /api/health`
- login
- logout
- dashboard
- acesso do comercial bloqueado nas rotas contábeis
- upload de reconciliação com arquivo válido

## 6. Se usar processo gerenciado

Se estiver rodando com PM2, NSSM, serviço do Windows ou outro gerenciador, substitua o `npm start` pelo comando de restart do seu processo.

O importante é manter esta ordem:

1. backup
2. pull
3. install
4. prisma generate
5. migrate deploy
6. restart
