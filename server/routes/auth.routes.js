// server/routes/auth.routes.js
const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const db = require("../db"); // PrismaClient (Postgres)

const router = express.Router();

/** Helpers */
function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function toSafeUser(user) {
  // Mantém compatibilidade com seu front (login.js normalizeUser entende "nome/ativo/role")
  return {
    id: user.id,
    nome: user.name ?? user.nome ?? "Usuário",
    email: user.email,
    role: user.role ?? "customer",
    ativo: typeof user.active === "boolean" ? user.active : true,
  };
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

    // Prisma: busca pelo email
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
      return res.status(401).json({ error: "Credenciais inválidas." });
    }

    // Se existir flag active no schema, respeita
    if (typeof user.active === "boolean" && user.active === false) {
      return res.status(403).json({ error: "Usuário desativado." });
    }

    // Confere senha (hash bcrypt)
    const ok = await bcrypt.compare(String(password), user.password);
    if (!ok) {
      return res.status(401).json({ error: "Credenciais inválidas." });
    }

    return res.json({ user: toSafeUser(user) });
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

    if (pass.length < 6) {
      return res.status(400).json({ error: "A senha deve ter no mínimo 6 caracteres." });
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
        // se seu schema tiver esses campos, ok; se não tiver, remova aqui
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

    return res.status(201).json({ user: toSafeUser(user) });
  } catch (err) {
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

    // Resposta genérica (anti-enumeração)
    if (!user || (typeof user.active === "boolean" && user.active === false)) {
      return res.json({ ok: true });
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30); // 30 min

    await db.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    // DEV: imprime o link
    const baseUrl = process.env.APP_BASE_URL || "http://localhost:3000";
    const resetLink = `${baseUrl}/reset/reset.html?token=${rawToken}`;
    console.log("🔐 RESET LINK:", resetLink);

    // Em produção: aqui você envia email (SMTP/SES/etc).
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

    if (pass.length < 6) {
      return res.status(400).json({ error: "A senha deve ter no mínimo 6 caracteres." });
    }

    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    const row = await db.passwordResetToken.findUnique({
      where: { tokenHash },
      select: {
        tokenHash: true,
        userId: true,
        expiresAt: true,
        usedAt: true,
      },
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

module.exports = router;
