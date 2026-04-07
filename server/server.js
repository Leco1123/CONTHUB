// server/server.js
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const session = require("express-session");
require("dotenv").config();

const db = require("./db");

// ROTAS
const authRoutes = require("./routes/auth.routes");
const adminUsersRoutes = require("./routes/admin.users.routes");
const adminModulesRoutes = require("./routes/admin.modules.routes");
const adminTeamConfigRoutes = require("./routes/admin.team-config.routes");
const publicCustomersRoutes = require("./routes/public.customers.routes");
const dashboardRoutes = require("./routes/dashboard.routes");
const sheetsRoutes = require("./routes/sheets.routes");
const reconciliacaoRoutes = require("./routes/reconciliacao.routes");

const app = express();

// ---------------------------------------------------
// MIDDLEWARES
// ---------------------------------------------------

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.json({ limit: "10mb" }));

app.use(
  session({
    name: "conthub.sid",
    secret: process.env.SESSION_SECRET || "conthub_super_secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 8,
    },
  })
);

// ---------------------------------------------------
// AUTH MIDDLEWARE
// ---------------------------------------------------

const { requireAuth } = require("./middleware/auth");

// ---------------------------------------------------
// STATIC FILES
// ---------------------------------------------------

const publicDir = path.join(__dirname, "..", "public");

console.log("📁 Static:", publicDir);

const loginPath = path.join(publicDir, "login", "login.html");

console.log("🔎 login.html:", fs.existsSync(loginPath));

app.use(express.static(publicDir));

// ---------------------------------------------------
// API ROUTES
// ---------------------------------------------------

app.use("/api/auth", authRoutes);

app.use("/api/public/customers", publicCustomersRoutes);

app.use("/api/dashboard", requireAuth, dashboardRoutes);

app.use("/api/sheets", requireAuth, sheetsRoutes);

// 🔵 ROTA NOVA DA RECONCILIAÇÃO (SEM AUTH TEMPORARIAMENTE)
app.use("/api/reconciliacao", reconciliacaoRoutes);

app.use("/api/admin/users", requireAuth, adminUsersRoutes);

app.use("/api/admin/modules", requireAuth, adminModulesRoutes);

app.use("/api/admin/team-config", requireAuth, adminTeamConfigRoutes);

// ---------------------------------------------------
// HTML ROUTES
// ---------------------------------------------------

app.get("/", (req, res) => {
  res.sendFile(loginPath);
});

app.get("/login/login.html", (req, res) => {
  res.sendFile(loginPath);
});

// ---------------------------------------------------
// FALLBACK
// ---------------------------------------------------

app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "Rota não encontrada." });
  }

  res.sendFile(loginPath);
});

// ---------------------------------------------------
// SERVER START
// ---------------------------------------------------

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log("=================================");
  console.log("✅ ContHub rodando");
  console.log(`🌐 http://localhost:${PORT}`);
  console.log(`🔐 http://localhost:${PORT}/login/login.html`);
  console.log("=================================");
});

// ---------------------------------------------------
// GRACEFUL SHUTDOWN
// ---------------------------------------------------

async function gracefulShutdown(signal) {
  try {
    console.log(`\n🛑 ${signal} recebido`);

    if (db?.close) {
      await db.close();
    }

    server.close(() => {
      console.log("✅ servidor encerrado");
      process.exit(0);
    });

    setTimeout(() => {
      console.log("⚠️ encerramento forçado");
      process.exit(1);
    }, 5000).unref();
  } catch (err) {
    console.error("Erro no shutdown:", err);
    process.exit(1);
  }
}

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);
