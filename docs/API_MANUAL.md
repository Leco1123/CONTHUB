# 📚 ContHub LE — Manual da API

## 🌐 Base URL
http://localhost:3000

## 🔐 1) Autenticação

### POST `/api/auth/login`

Request:
{
  "email": "admin@local",
  "password": "admin123"
}

Response:
{
  "user": {
    "id": 1,
    "name": "Admin",
    "email": "admin@local",
    "role": "admin"
  }
}

Erros:
400 – campos faltando
401 – inválido
403 – inativo
500 – erro interno

Exemplo:
fetch("/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password })
});

## 🔑 2) Cabeçalho Admin

Necessário em todas rotas /api/admin/*

x-role: admin

Exemplo:
fetch("/api/admin/users", {
  headers: { "x-role": "admin" }
});

## 👤 3) Administração de Usuários

GET `/api/admin/users`

POST `/api/admin/users`

PUT `/api/admin/users/:id`

POST `/api/admin/users/:id/reset-password`

## 🧩 4) Administração de Módulos

GET `/api/admin/modules`

PUT `/api/admin/modules`

## 📡 Códigos HTTP

200 — Sucesso
400 — Requisição inválida
401 — Credenciais inválidas
403 — Sem permissão
404 — Não encontrado
500 — Erro interno

## 📌 Endpoints Resumidos

POST /api/auth/login
GET /api/admin/users
POST /api/admin/users
PUT /api/admin/users/:id
POST /api/admin/users/:id/reset-password
GET /api/admin/modules
PUT /api/admin/modules
