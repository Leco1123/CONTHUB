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
  if (["ti", "gerencial", "coordenacao", "operacional", "consulta"].includes(normalized)) {
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

    if (!user) return res.status(401).json({ error: "Credenciais inválidas." });

    if (typeof user.active === "boolean" && user.active === false) {
      return res.status(403).json({ error: "Usuário desativado." });
    }

    const ok = await bcrypt.compare(String(password), user.password);
    if (!ok) return res.status(401).json({ error: "Credenciais inválidas." });

    const safe = toSafeUser(user);

    // ✅ CRIA SESSÃO (isso é o que gera o cookie conthub.sid)
    req.session.user = safe;

    // ✅ GARANTE persistir antes de responder (evita login ok mas sem cookie)
    req.session.save((err) => {
      if (err) {
        console.error("Erro ao salvar sessão:", err);
        return res.status(500).json({ error: "Erro ao criar sessão." });
      }
      return res.json({ user: safe });
    });
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

    // ✅ opcional: já cria sessão após cadastro (melhor UX)
    req.session.user = safe;
    req.session.save((err) => {
      if (err) {
        console.error("Erro ao salvar sessão no signup:", err);
        // se falhar sessão, ainda devolve user (cadastro feito)
        return res.status(201).json({ user: safe });
      }
      return res.status(201).json({ user: safe });
    });
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
    console.log("🔐 RESET LINK:", resetLink);

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
      res.clearCookie("conthub.sid");
      return res.json({ ok: true });
    });
  } catch (err) {
    console.error("Erro no logout:", err);
    return res.status(500).json({ error: "Erro ao sair." });
  }
});

module.exports = router;
