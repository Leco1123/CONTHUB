# Deploy Seguro do ContHub

Este guia resume o mínimo necessário para publicar o ContHub em domínio web com segurança.

## 1. Pré-requisitos

- Um domínio com HTTPS ativo
- Um servidor ou plataforma com Node.js e PostgreSQL
- Acesso para configurar variáveis de ambiente
- Um processo para manter a aplicação online
  - Exemplo: PM2, NSSM, Docker, systemd ou plataforma gerenciada

## 2. Variáveis obrigatórias

Use o arquivo [../.env.example](../.env.example) como base.

As variáveis mais importantes para produção são:

- `DATABASE_URL`
- `SESSION_SECRET`
- `APP_BASE_URL`
- `ALLOWED_ORIGINS`
- `NODE_ENV=production`
- `SESSION_COOKIE_SECURE=true`

## 3. O que precisa ser trocado antes de subir

Não reutilize valores do ambiente antigo.

- Gere um novo `SESSION_SECRET`
- Gere uma nova senha do banco se a atual já circulou
- Gere um novo `CLICKUP_API_TOKEN` se o atual já foi exposto
- Confirme que `APP_BASE_URL` usa `https://`
- Confirme que `ALLOWED_ORIGINS` contém apenas o domínio final

## 4. Exemplo de `.env` de produção

```env
DATABASE_URL="postgresql://usuario:senha-forte@127.0.0.1:5432/conthub_prod?schema=public"
SHEET_BACKUP_ROOT="/var/lib/conthub/sheet-backups"
SESSION_SECRET="<gere-com-npm-run-security-secret>"
APP_BASE_URL="https://app.seudominio.com.br"
ALLOWED_ORIGINS="https://app.seudominio.com.br"
PORT=3000
NODE_ENV=production
SESSION_COOKIE_SECURE=true
LOGIN_RATE_WINDOW_MS=900000
LOGIN_RATE_MAX_ATTEMPTS=5
CLICKUP_API_TOKEN="<opcional-se-usar-clickup>"
CLICKUP_TICKETS_ENABLED="false"
SHEET_BASE_OWNER_EMAILS="admin@seudominio.com.br"
```

## 5. Geração de segredo forte

Use um segredo com pelo menos 32 caracteres aleatórios.

Exemplo em PowerShell:

```powershell
[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 } | ForEach-Object { [byte]$_ }))
```

Ou use o script do projeto:

```powershell
npm run security:secret
```

## 6. Banco de dados

Antes de iniciar a aplicação:

```powershell
npm run prisma:generate
npx prisma migrate deploy --schema prisma/schema.prisma
```

Se você preferir ambiente sem migrations formais, revise isso com cuidado antes de usar `db push` em produção.

## 7. Subida da aplicação

Instale dependências:

```powershell
npm install
```

Inicie a aplicação:

```powershell
npm start
```

O backend sobe por padrão na porta `3000`.

## 8. Proxy reverso e HTTPS

Publique o ContHub atrás de um proxy reverso com SSL.

Exemplos comuns:

- Nginx
- Apache
- Cloudflare Tunnel
- IIS + reverse proxy

O proxy deve encaminhar para `http://127.0.0.1:3000`.

## 9. Backup operacional

O projeto agora inclui um script para backup manual:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\backup-conthub.ps1
```

Ele gera:

- dump do PostgreSQL com `pg_dump`
- arquivo `.zip` da pasta de backups das sheets, quando `SHEET_BACKUP_ROOT` estiver configurado

Se quiser, você pode apontar um diretório próprio:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\backup-conthub.ps1 -BackupRoot "D:\Backups\ContHub"
```

## 10. Checklist de segurança antes de abrir o domínio

- `APP_BASE_URL` está com `https://`
- `ALLOWED_ORIGINS` está restrito ao domínio final
- `SESSION_SECRET` foi trocado
- `DATABASE_URL` aponta para o banco de produção
- `CLICKUP_API_TOKEN` foi rotacionado ou desativado
- `.env` não está no Git
- o banco está com backup habilitado
- a aplicação sobe sem erro com `NODE_ENV=production`
- login funciona
- logout funciona
- perfil comercial não acessa `contflow`, `painel tributário` nem reconciliação
- perfis autorizados conseguem usar as rotas contábeis
- uploads aceitam apenas `csv`, `xls` e `xlsx`
- o domínio final responde em HTTPS
- `GET /api/health` responde com `ok: true`

## 11. Checklist de teste rápido após deploy

- abrir `/login/login.html`
- autenticar com usuário TI ou admin
- autenticar com usuário comercial
- validar criação de sessão
- validar bloqueio de origem indevida em rotas `POST/PUT/PATCH/DELETE`
- validar que `api/admin/modules` devolve apenas módulos permitidos por perfil
- validar que `api/sheets/contflow` retorna `403` para perfil comercial
- validar reconciliação com um arquivo válido pequeno
- validar reinício da aplicação sem perder consistência de sessão

## 12. Monitoramento básico

O backend registra eventos básicos de segurança em:

- `server/logs/security-events.log`

Eventos já cobertos:

- bloqueio por origem inválida
- tentativa excessiva de login
- login com usuário inexistente
- login com senha incorreta
- acesso negado à área contábil

## 13. Recomendações para a próxima camada

Estas melhorias não impedem o deploy inicial, mas valem a pena:

- mover rate limit de login para Redis
- adicionar monitoramento e alertas
- centralizar logs
- criar rotina automática de backup do PostgreSQL
- revisar hardening do servidor hospedeiro

## 14. Arquivos relacionados

- [../.env.example](../.env.example)
- [../server/server.js](../server/server.js)
- [../scripts/generate-session-secret.js](../scripts/generate-session-secret.js)
- [../scripts/backup-conthub.ps1](../scripts/backup-conthub.ps1)
- [../server/routes/auth.routes.js](../server/routes/auth.routes.js)
- [../server/routes/sheets.routes.js](../server/routes/sheets.routes.js)
- [../server/routes/reconciliacao.routes.js](../server/routes/reconciliacao.routes.js)
