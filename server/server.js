// server/server.js
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const session = require("express-session");
require("dotenv").config();

const db = require("./db");

// Rotas
const authRoutes = require("./routes/auth.routes");
const adminUsersRoutes = require("./routes/admin.users.routes");
const adminModulesRoutes = require("./routes/admin.modules.routes");
const publicCustomersRoutes = require("./routes/public.customers.routes");

// ✅ (3) Dashboard Routes (Postgres)
const dashboardRoutes = require("./routes/dashboard.routes");

const app = express();

// --------------------
// Middlewares (ORDEM CERTA)
// --------------------

// ✅ CORS único (sem duplicar)
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

// ✅ JSON (uma vez só)
app.use(express.json({ limit: "1mb" }));

// ✅ Session (depois do CORS)
app.use(
  session({
    name: "conthub.sid",
    secret: process.env.SESSION_SECRET || "conthub_super_secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false, // DEV em http
      sameSite: "lax", // ✅ evita bloqueios bobos no browser
      maxAge: 1000 * 60 * 60 * 8, // 8h
    },
  })
);

// --------------------
// AUTH MIDDLEWARES (AQUI MESMO NO SERVER.JS)
// --------------------
function requireAuth(req, res, next) {
  if (!req.session?.user) {
    return res.status(401).json({ error: "Não autenticado." });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session?.user) {
    return res.status(401).json({ error: "Não autenticado." });
  }
  // Ajuste aqui se seu role for "admin" / "ti" / etc.
  const role = String(req.session.user.role || "").toLowerCase();
  if (role !== "admin" && role !== "ti" && role !== "administrator") {
    return res.status(403).json({ error: "Acesso negado." });
  }
  next();
}

// --------------------
// Static (painel)
// --------------------
// public está na raiz do projeto (../public)
const publicDir = path.join(__dirname, "..", "public");
console.log("📁 Servindo arquivos estáticos de:", publicDir);

const loginPath = path.join(publicDir, "login", "login.html");
console.log("🔎 login.html existe?", fs.existsSync(loginPath), "-", loginPath);

app.use(express.static(publicDir));

// --------------------
// API
// --------------------
// Auth (público)
app.use("/api/auth", authRoutes);

// Público (se tiver rotas que precisam ser públicas, mantém)
app.use("/api/public/customers", publicCustomersRoutes);

// ✅ Dashboard (protegido) — aqui é o #3
app.use("/api/dashboard", requireAuth, dashboardRoutes);

// Admin (protegido)
app.use("/api/admin/users", requireAdmin, adminUsersRoutes);
app.use("/api/admin/modules", requireAdmin, adminModulesRoutes);

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
// Porta
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