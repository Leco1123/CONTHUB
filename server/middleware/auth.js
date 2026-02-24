// server/middleware/auth.js

function requireAdmin(req, res, next) {
  const role = req.header("x-role");

  if (role !== "admin") {
    return res.status(403).json({ error: "Acesso restrito a administradores." });
  }

  next();
}

module.exports = { requireAdmin };
