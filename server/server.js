// server/server.js
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const session = require("express-session");
require("dotenv").config();

const db = require("./db");
const { PrismaSessionStore, ensureSessionTable } = require("./session-store");

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
const isProduction = String(process.env.NODE_ENV || "").trim().toLowerCase() === "production";
const appBaseUrl = String(process.env.APP_BASE_URL || "").trim();
const sessionSecret = String(process.env.SESSION_SECRET || "").trim();
const allowedOrigins = Array.from(
  new Set(
    [appBaseUrl, ...(process.env.ALLOWED_ORIGINS || "").split(",")]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  )
);
const sessionCookieSecure =
  String(process.env.SESSION_COOKIE_SECURE || "").trim() !== ""
    ? String(process.env.SESSION_COOKIE_SECURE).trim().toLowerCase() === "true"
    : isProduction && /^https:\/\//i.test(appBaseUrl);
const sessionStore = new PrismaSessionStore();

if (!sessionSecret) {
  throw new Error("SESSION_SECRET não configurado.");
}

if (isProduction && !sessionCookieSecure) {
  throw new Error("Produção exige cookie seguro. Configure APP_BASE_URL com https:// ou SESSION_COOKIE_SECURE=true.");
}

app.set("trust proxy", 1);

function isAllowedOrigin(origin) {
  return allowedOrigins.includes(String(origin || "").trim());
}

function securityHeaders(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "base-uri 'self'",
      "font-src 'self' data:",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "img-src 'self' data: blob:",
      "object-src 'none'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "connect-src 'self'",
      "worker-src 'self' blob:",
    ].join("; ")
  );

  if (sessionCookieSecure) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

  next();
}

// ---------------------------------------------------
// MIDDLEWARES
// ---------------------------------------------------

app.use(securityHeaders);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (isAllowedOrigin(origin)) return callback(null, true);
      return callback(new Error("Origem não permitida pelo CORS."));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "10mb" }));

app.use(
  session({
    name: "conthub.sid",
    secret: sessionSecret,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: sessionCookieSecure,
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

app.use("/api/reconciliacao", requireAuth, reconciliacaoRoutes);

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

app.use((err, req, res, next) => {
  if (!err) {
    return next();
  }

  if (err.message === "Origem não permitida pelo CORS.") {
    return res.status(403).json({ error: "Origem não permitida." });
  }

  console.error("Erro não tratado:", err);
  return res.status(500).json({ error: "Erro interno do servidor." });
});

// ---------------------------------------------------
// SERVER START
// ---------------------------------------------------

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
let server;

async function startServer() {
  await ensureSessionTable();
  await sessionStore.pruneExpiredSessions();
  sessionStore.startCleanupTimer();

  server = app.listen(PORT, "0.0.0.0", () => {
    console.log("=================================");
    console.log("✅ ContHub rodando");
    console.log(`🌐 http://localhost:${PORT}`);
    console.log(`🔐 http://localhost:${PORT}/login/login.html`);
    console.log(`🌍 Origens liberadas: ${allowedOrigins.join(", ") || "somente localhost sem Origin"}`);
    console.log("=================================");
  });
}

startServer().catch((error) => {
  console.error("Falha ao iniciar servidor:", error);
  process.exit(1);
});

// ---------------------------------------------------
// GRACEFUL SHUTDOWN
// ---------------------------------------------------

async function gracefulShutdown(signal) {
  try {
    console.log(`\n🛑 ${signal} recebido`);

    sessionStore.stopCleanupTimer();

    if (db?.close) {
      await db.close();
    }

    if (!server) {
      process.exit(0);
      return;
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
