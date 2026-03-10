// server/middleware/auth.js

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

  const role = String(req.session.user.role || "").toLowerCase();

  if (!["admin", "ti", "administrator"].includes(role)) {
    return res.status(403).json({ error: "Acesso restrito a administradores." });
  }

  next();
}

module.exports = {
  requireAuth,
  requireAdmin,
};