// server/middleware/auth.js
const db = require("../db");

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function mapRoleOut(role) {
  const normalized = String(role || "").trim().toUpperCase();
  if (normalized === "ADMIN") return "admin";
  if (normalized === "TI") return "ti";
  if (normalized === "USER") return "user";
  return "customer";
}

function normalizeAccessProfile(value, fallbackRole = "customer") {
  const normalized = String(value || "").trim().toLowerCase();
  if (["ti", "gerencial", "coordenacao", "operacional", "consulta"].includes(normalized)) {
    return normalized;
  }

  const role = mapRoleOut(fallbackRole);
  if (role === "ti") return "ti";
  if (role === "admin") return "gerencial";
  return "operacional";
}

async function loadCurrentUser(req) {
  const sessionUser = req.session?.user;
  if (!sessionUser) return null;

  const sessionId = Number(sessionUser.id);
  const sessionEmail = normalizeEmail(sessionUser.email);

  const user =
    Number.isFinite(sessionId) && sessionId > 0
      ? await db.user.findUnique({
          where: { id: sessionId },
          select: { id: true, email: true, role: true, active: true, accessProfile: true },
        })
      : await db.user.findUnique({
          where: { email: sessionEmail },
          select: { id: true, email: true, role: true, active: true, accessProfile: true },
        });

  if (!user || user.active === false) return null;

  req.currentUser = {
    ...user,
    role: mapRoleOut(user.role),
    accessProfile: normalizeAccessProfile(user.accessProfile, user.role),
  };

  return req.currentUser;
}

function requireAuth(req, res, next) {
  if (!req.session?.user) {
    return res.status(401).json({ error: "Não autenticado." });
  }

  next();
}

async function requireAdmin(req, res, next) {
  if (!req.session?.user) {
    return res.status(401).json({ error: "Não autenticado." });
  }

  const user = await loadCurrentUser(req);
  if (!user) {
    return res.status(401).json({ error: "Sessão inválida." });
  }

  if (!["admin", "ti", "administrator"].includes(String(user.role || "").toLowerCase())) {
    return res.status(403).json({ error: "Acesso restrito a administradores." });
  }

  next();
}

async function requireContAdminAccess(req, res, next) {
  if (!req.session?.user) {
    return res.status(401).json({ error: "Não autenticado." });
  }

  const user = await loadCurrentUser(req);
  if (!user) {
    return res.status(401).json({ error: "Sessão inválida." });
  }

  const role = String(user.role || "").toLowerCase();
  const accessProfile = String(user.accessProfile || "").toLowerCase();
  if (
    role === "ti" ||
    role === "admin" ||
    accessProfile === "ti" ||
    accessProfile === "gerencial" ||
    accessProfile === "coordenacao"
  ) {
    return next();
  }

  return res.status(403).json({ error: "Seu perfil não possui acesso ao ContAdmin." });
}

async function requireContAdminManage(req, res, next) {
  if (!req.session?.user) {
    return res.status(401).json({ error: "Não autenticado." });
  }

  const user = await loadCurrentUser(req);
  if (!user) {
    return res.status(401).json({ error: "Sessão inválida." });
  }

  const role = String(user.role || "").toLowerCase();
  const accessProfile = String(user.accessProfile || "").toLowerCase();
  if (
    role === "ti" ||
    role === "admin" ||
    accessProfile === "ti" ||
    accessProfile === "gerencial" ||
    accessProfile === "coordenacao"
  ) {
    return next();
  }

  return res.status(403).json({ error: "Acesso restrito a perfis com gestão de usuários." });
}

module.exports = {
  requireAuth,
  requireAdmin,
  requireContAdminAccess,
  requireContAdminManage,
};
