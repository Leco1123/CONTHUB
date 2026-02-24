// server/server.js
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const db = require("./db"); // mantém: garante que o DB inicializa (como você já usa hoje)

// Rotas
const authRoutes = require("./routes/auth.routes");
const adminUsersRoutes = require("./routes/admin.users.routes");
const adminModulesRoutes = require("./routes/admin.modules.routes");
const publicCustomersRoutes = require("./routes/public.customers.routes");

const app = express();

// --------------------
// Middlewares
// --------------------
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// --------------------
// Static (painel)
// --------------------
// public está na raiz do projeto (../public)
const publicDir = path.join(__dirname, "..", "public");
console.log("📁 Servindo arquivos estáticos de:", publicDir);

// sanity check (pra você ver se o arquivo existe)
const loginPath = path.join(publicDir, "login", "login.html");
console.log("🔎 login.html existe?", fs.existsSync(loginPath), "-", loginPath);

app.use(express.static(publicDir));

// --------------------
// API
// --------------------
app.use("/api/auth", authRoutes);
app.use("/api/admin/users", adminUsersRoutes);
app.use("/api/admin/modules", adminModulesRoutes);
app.use("/api/public/customers", publicCustomersRoutes);

// --------------------
// Rotas HTML
// --------------------
// raiz → tela de login
app.get("/", (req, res) => {
  return res.sendFile(loginPath);
});

// garante /login/login.html
app.get("/login/login.html", (req, res) => {
  return res.sendFile(loginPath);
});

// fallback
app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "Rota não encontrada." });
  }
  return res.sendFile(loginPath);
});

// --------------------
// Porta dinâmica (evita EADDRINUSE)
// --------------------
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ ContHub LE rodando em http://localhost:${PORT}`);
  console.log(`➡️ Login: http://localhost:${PORT}/login/login.html`);
});

// --------------------
// Shutdown limpo (bom pra DB)
// --------------------
async function gracefulShutdown(signal) {
  try {
    console.log(`\n🛑 Recebido ${signal}. Encerrando com segurança...`);

    // Se seu ./db tiver close/closeAll, tenta encerrar
    if (db && typeof db.close === "function") {
      await db.close();
    }

    server.close(() => {
      console.log("✅ Servidor encerrado.");
      process.exit(0);
    });

    setTimeout(() => {
      console.log("⚠️ Forçando encerramento.");
      process.exit(1);
    }, 5000).unref();
  } catch (err) {
    console.error("❌ Erro ao encerrar:", err);
    process.exit(1);
  }
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
