O CONTHUB é uma aplicação full stack composta por:

- API RESTful em Node.js
- Banco de dados PostgreSQL
- Prisma ORM
- Autenticação baseada em JWT
- Painel web em HTML, CSS e JavaScript
- Estrutura modular preparada para produção
- O projeto foi desenvolvido com foco em:
- Organização por camadas
- Segurança
- Versionamento profissional
- Escalabilidade futura

# ARQUITETURA

CONTHUB/
│
├── server/                 # Backend (Node.js / Express)
│   ├── db/                 # Conexão com banco (Prisma Client)
│   ├── routes/             # Rotas da API
│   ├── middleware/         # Middlewares (Auth, etc.)
│   └── server.js           # Entry point
│
├── prisma/                 # Modelagem do banco
│   └── schema.prisma
│
├── web/                    # Front-end
│   ├── index.html
│   ├── styles.css
│   └── app.js
│
├── .env                    # Variáveis sensíveis (não versionado)
├── .env.example
├── package.json
└── README.md

# LINGUAGENS DE PROGRAMAÇÃO

- JavaScript (Node.js) - Backend
- JavaScript (Vanilla js) - Frontend
- SQL (PostgreSQL) - Banco de Dados
- HTML5 - Estrutura do painel
- CSS3 - Estilização
- JSON - Comunicação API
- Prisma Schema Language - Modelagem de dados
- Bash / Shell - Comandos de terminal
- Markdown - Documentação 

# TECNOLOGIAS & FERRAMENTAS 

BACKEND
- Node.js
- Express
- Prisma ORM
- PostgreSQL

SEGURANÇA
- JWT
- Bcrypt
- Dotenv

FRONTEND
- HTML5
- CSS3
- Fetch API

DEV TOOLS 
- NPM
- NPX
- Prisma CLI
- Git
- GitHub
- ESLint
- Prettier

# FUNCIONALIDADES IMPLEMENTADAS
AUTENTICAÇÃO
- Login com e-mail normalizado
- Hash de senha com  bcrypt
- Geração de token JWT
- Middleware de proteção de rotas

BANCO DE DADOS
- Integração com PostgreSQL
- Prisma Client configurado
- Variável DATABASE_URL
- db push para sincronização rápida

FRONT-END
- Tela de login funcional
- Layout responsivo
- Integração com API via Fetch
- Armazenamento de JWT no localStorage


SETUP DO PROJETO
PRÉ-REQUISITOS:
node -v
npm -v
npx -v

Também é necessário:
- PostgreSQL instalado e rodando

INSTALAR DEPENDÊNCIAS
npm install

CONFIGURAR VARIÁVEIS DE AMBIENTE

Crie um arquivo .env na raiz:
DATABASE_URL="postgresql://USER:SENHA@localhost:5432/conthub?schema=public"
JWT_SECRET="seu-segredo-super-forte"

GERAR PRISMA CLIENT
npx prisma generate
CRIAR OU ATUALIZAR BANCO
npx prisma migrate dev

ou

npx prisma db push
▶️ 6️⃣ Rodar Aplicação
node server/server.js

ou

npm run start


FLUXO PROFISSIONAL DE DESENVOLVIMENTO

git pull --rebase
git checkout -b feature/nome-da-feature
git add .
git commit -m "feat: descrição clara"
git push -u origin feature/nome-da-feature

BOAS PRÁTICAS

❌ Nunca versionar .env
❌ Nunca versionar node_modules
✅ Sempre rodar npm install após clonar
✅ Sempre rodar npx prisma generate
✅ Trabalhar com branches
✅ Usar commits semânticos (feat, fix, chore)

ROADMAP

CRUD completo de usuários
Sistema de permissões (roles)
Logs estruturados
Dockerização
CI/CD
Deploy automatizado
Versionamento semântico

👨‍💻 Autor

Leandro Vieira
Projeto CONTHUB





















































