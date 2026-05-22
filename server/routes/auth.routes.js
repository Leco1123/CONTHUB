// server/routes/auth.routes.js
const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const db = require("../db"); // PrismaClient (Postgres)

const router = express.Router();
const LOGIN_RATE_WINDOW_MS = Number(process.env.LOGIN_RATE_WINDOW_MS || 1000 * 60 * 15);
const LOGIN_RATE_MAX_ATTEMPTS = Number(process.env.LOGIN_RATE_MAX_ATTEMPTS || 5);
const loginAttempts = new Map();

/** Helpers */
function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function mapRoleOut(role) {
  const r = String(role || "").trim().toUpperCase();
  if (r === "ADMIN") return "admin";
  if (r === "TI") return "ti";
  if (r === "USER") return "user";
  return "customer";
}

function normalizeAccessProfile(value, fallbackRole = "customer") {
  const normalized = cleanText(value).toLowerCase();
  if (["ti", "gerencial", "coordenacao", "operacional", "consulta", "comercial"].includes(normalized)) {
    return normalized;
  }

  const role = mapRoleOut(fallbackRole);
  if (role === "ti") return "ti";
  if (role === "admin") return "gerencial";
  return "operacional";
}

function toSafeUser(user) {
  // Compatível com front (login.js normalizeUser entende "nome/ativo/role")
  return {
    id: user.id,
    nome: user.name ?? user.nome ?? "Usuário",
    email: user.email,
    role: mapRoleOut(user.role ?? "USER"),
    ativo: typeof user.active === "boolean" ? user.active : true,
  };
}

function toSafeProfile(user) {
  const safe = toSafeUser(user);
  return {
    ...safe,
    cargo: cleanText(user.cargo) || null,
    coordenador: cleanText(user.coordenador) || null,
    equipe: cleanText(user.equipe) || null,
    accessProfile: normalizeAccessProfile(user.accessProfile, user.role),
    createdAt: user.createdAt ?? null,
    updatedAt: user.updatedAt ?? null,
  };
}

function isUniqueEmailConflict(err) {
  return (
    err?.code === "P2002" &&
    Array.isArray(err?.meta?.target) &&
    err.meta.target.includes("email")
  );
}

function getClientIp(req) {
  return (
    (req.headers["x-forwarded-for"] && String(req.headers["x-forwarded-for"]).split(",")[0].trim()) ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}

function getLoginAttemptKey(req, email) {
  return `${getClientIp(req)}::${normalizeEmail(email)}`;
}

function getRateLimitState(key) {
  const now = Date.now();
  const current = loginAttempts.get(key);

  if (!current || current.expiresAt <= now) {
    const fresh = { count: 0, expiresAt: now + LOGIN_RATE_WINDOW_MS };
    loginAttempts.set(key, fresh);
    return fresh;
  }

  return current;
}

function registerFailedLogin(key) {
  const state = getRateLimitState(key);
  state.count += 1;
  loginAttempts.set(key, state);
  return state;
}

function clearFailedLogin(key) {
  loginAttempts.delete(key);
}

function validatePasswordStrength(password) {
  const pass = String(password || "");
  if (pass.length < 10) {
    return "A senha deve ter no mínimo 10 caracteres.";
  }
  return null;
}

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/* ===============================
   LOGIN
   POST /api/auth/login
   body: { email, password }
================================ */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: "Email e senha são obrigatórios." });
    }

    const normalizedEmail = normalizeEmail(email);
    const attemptKey = getLoginAttemptKey(req, normalizedEmail);
    const rateLimitState = getRateLimitState(attemptKey);

    if (rateLimitState.count >= LOGIN_RATE_MAX_ATTEMPTS) {
      const retryAfterSeconds = Math.max(1, Math.ceil((rateLimitState.expiresAt - Date.now()) / 1000));
      res.setHeader("Retry-After", String(retryAfterSeconds));
      return res.status(429).json({ error: "Muitas tentativas de login. Tente novamente em alguns minutos." });
    }

    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        name: true,
        email: true,
        password: true,
        role: true,
        active: true,
      },
    });

    if (!user) {
      registerFailedLogin(attemptKey);
      return res.status(401).json({ error: "Credenciais inválidas." });
    }

    if (typeof user.active === "boolean" && user.active === false) {
      return res.status(403).json({ error: "Usuário desativado." });
    }

    const ok = await bcrypt.compare(String(password), user.password);
    if (!ok) {
      registerFailedLogin(attemptKey);
      return res.status(401).json({ error: "Credenciais inválidas." });
    }

    const safe = toSafeUser(user);
    clearFailedLogin(attemptKey);
    await regenerateSession(req);
    req.session.user = safe;
    await saveSession(req);
    return res.json({ user: safe });
  } catch (err) {
    console.error("Erro no login:", err);
    return res.status(500).json({ error: "Erro interno no login." });
  }
});

/* ===============================
   SIGNUP
   POST /api/auth/signup
   body: { name, email, password }
================================ */
router.post("/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body || {};

    const cleanName = String(name || "").trim();
    const normalizedEmail = normalizeEmail(email);
    const pass = String(password || "").trim();

    if (!cleanName || !normalizedEmail || !pass) {
      return res.status(400).json({ error: "Nome, email e senha são obrigatórios." });
    }

    const passwordError = validatePasswordStrength(pass);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const exists = await db.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });

    if (exists) {
      return res.status(409).json({ error: "Já existe um usuário com esse email." });
    }

    const passwordHash = await bcrypt.hash(pass, 10);

    const user = await db.user.create({
      data: {
        name: cleanName,
        email: normalizedEmail,
        password: passwordHash,
        role: "USER", 
        active: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
      },
    });

    const safe = toSafeUser(user);
    await regenerateSession(req);
    req.session.user = safe;
    try {
      await saveSession(req);
    } catch (sessionError) {
      console.error("Erro ao salvar sessão no signup:", sessionError);
    }
    return res.status(201).json({ user: safe });
  } catch (err) {
    if (isUniqueEmailConflict(err)) {
      return res.status(409).json({ error: "Já existe um usuário com esse email." });
    }

    console.error("ERRO REAL NO SIGNUP:");
    console.error(err);
    return res.status(500).json({ error: "Erro interno ao cadastrar usuário." });
  }
});

/* ===============================
   FORGOT PASSWORD
   POST /api/auth/forgot
   body: { email }
   - Sempre retorna ok (não vaza se usuário existe)
================================ */
router.post("/forgot", async (req, res) => {
  try {
    const { email } = req.body || {};
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) {
      return res.status(400).json({ error: "Informe o email." });
    }

    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, active: true, email: true, name: true },
    });

    if (!user || (typeof user.active === "boolean" && user.active === false)) {
      return res.json({ ok: true });
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30); // 30 min

    await db.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    const baseUrl = process.env.APP_BASE_URL || "http://localhost:3000";
    const resetLink = `${baseUrl}/reset/reset.html?token=${rawToken}`;
    console.info("Password reset solicitado para:", normalizedEmail);
    if (process.env.NODE_ENV !== "production") {
      console.info("Reset link local:", resetLink);
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("Erro no forgot:", err);
    return res.status(500).json({ error: "Erro interno ao solicitar recuperação." });
  }
});

/* ===============================
   RESET PASSWORD
   POST /api/auth/reset
   body: { token, password }
================================ */
router.post("/reset", async (req, res) => {
  try {
    const { token, password } = req.body || {};
    const rawToken = String(token || "").trim();
    const pass = String(password || "").trim();

    if (!rawToken || !pass) {
      return res.status(400).json({ error: "Token e nova senha são obrigatórios." });
    }

    const passwordError = validatePasswordStrength(pass);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    const row = await db.passwordResetToken.findUnique({
      where: { tokenHash },
      select: { tokenHash: true, userId: true, expiresAt: true, usedAt: true },
    });

    if (!row) return res.status(400).json({ error: "Token inválido." });
    if (row.usedAt) return res.status(400).json({ error: "Token já utilizado." });
    if (new Date(row.expiresAt).getTime() < Date.now()) {
      return res.status(400).json({ error: "Token expirado." });
    }

    const passwordHash = await bcrypt.hash(pass, 10);

    await db.$transaction([
      db.user.update({
        where: { id: row.userId },
        data: { password: passwordHash },
      }),
      db.passwordResetToken.update({
        where: { tokenHash },
        data: { usedAt: new Date() },
      }),
    ]);

    return res.json({ ok: true });
  } catch (err) {
    console.error("Erro no reset:", err);
    return res.status(500).json({ error: "Erro interno ao redefinir senha." });
  }
});

/* ===============================
   GET SESSION USER
   GET /api/auth/me
================================ */
router.get("/me", async (req, res) => {
  try {
    const sessionUser = req.session?.user;
    if (!sessionUser) return res.status(401).json({ error: "Não autenticado." });

    const sessionId = Number(sessionUser.id);
    const sessionEmail = normalizeEmail(sessionUser.email);

    const user = Number.isFinite(sessionId) && sessionId > 0
      ? await db.user.findUnique({
          where: { id: sessionId },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            active: true,
            cargo: true,
            coordenador: true,
            equipe: true,
            accessProfile: true,
            createdAt: true,
            updatedAt: true,
          },
        })
      : await db.user.findUnique({
          where: { email: sessionEmail },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            active: true,
            cargo: true,
            coordenador: true,
            equipe: true,
            accessProfile: true,
            createdAt: true,
            updatedAt: true,
          },
        });

    if (!user) return res.status(404).json({ error: "Usuário não encontrado." });

    return res.json({ user: toSafeProfile(user) });
  } catch (err) {
    console.error("Erro ao buscar sessão/perfil autenticado:", err);
    return res.status(500).json({ error: "Erro ao buscar sessão." });
  }
});

/* ===============================
   LOGOUT (limpa sessão + cookie)
   POST /api/auth/logout
================================ */
router.post("/logout", (req, res) => {
  try {
    req.session.destroy((err) => {
      if (err) {
        console.error("Erro ao destruir sessão:", err);
        return res.status(500).json({ error: "Erro ao sair." });
      }
      const appBaseUrl = String(process.env.APP_BASE_URL || "").trim();
      const isProduction = String(process.env.NODE_ENV || "").trim().toLowerCase() === "production";
      const secure =
        String(process.env.SESSION_COOKIE_SECURE || "").trim() !== ""
          ? String(process.env.SESSION_COOKIE_SECURE).trim().toLowerCase() === "true"
          : isProduction && /^https:\/\//i.test(appBaseUrl);
      res.clearCookie("conthub.sid", {
        httpOnly: true,
        sameSite: "lax",
        secure,
      });
      return res.json({ ok: true });
    });
  } catch (err) {
    console.error("Erro no logout:", err);
    return res.status(500).json({ error: "Erro ao sair." });
  }
});

module.exports = router;
