const db = require("../db");
const {
  canAccessModule,
  hasModulePermission,
  mapRoleOut,
  normalizeAccessProfile,
  normalizePermissionMode,
} = require("../services/permissions.service");
const { logSecurityEvent } = require("../utils/security-log");

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

async function loadCurrentUser(req) {
  const sessionUser = req.session?.user;
  if (!sessionUser) return null;

  const sessionId = Number(sessionUser.id);
  const sessionEmail = normalizeEmail(sessionUser.email);

  const select = {
    id: true,
    name: true,
    email: true,
    role: true,
    active: true,
    accessProfile: true,
    permissionMode: true,
    modulePermissions: {
      select: {
        canView: true,
        canEdit: true,
        canManage: true,
        module: {
          select: {
            id: true,
            slug: true,
            name: true,
            active: true,
            status: true,
            access: true,
          },
        },
      },
    },
  };

  const user =
    Number.isFinite(sessionId) && sessionId > 0
      ? await db.user.findUnique({ where: { id: sessionId }, select })
      : await db.user.findUnique({ where: { email: sessionEmail }, select });

  if (!user || user.active === false) return null;

  req.currentUser = {
    ...user,
    role: mapRoleOut(user.role),
    accessProfile: normalizeAccessProfile(user.accessProfile, user.role),
    permissionMode: normalizePermissionMode(user.permissionMode),
    modulePermissions: Array.isArray(user.modulePermissions)
      ? user.modulePermissions.map((entry) => ({
          canView: Boolean(entry.canView),
          canEdit: Boolean(entry.canEdit),
          canManage: Boolean(entry.canManage),
          module: entry.module || null,
        }))
      : [],
  };

  return req.currentUser;
}

async function requireAuth(req, res, next) {
  if (!req.session?.user) {
    return res.status(401).json({ error: "Não autenticado." });
  }

  const user = await loadCurrentUser(req);
  if (!user) {
    req.session?.destroy?.(() => {});
    return res.status(401).json({ error: "Sessão inválida." });
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

function requireModuleAccess(moduleId, action = "view") {
  const normalizedModuleId = String(moduleId || "").trim().toLowerCase();
  const normalizedAction = String(action || "view").trim().toLowerCase();

  return async (req, res, next) => {
    if (!req.session?.user) {
      return res.status(401).json({ error: "Não autenticado." });
    }

    const user = await loadCurrentUser(req);
    if (!user) {
      return res.status(401).json({ error: "Sessão inválida." });
    }

    if (hasModulePermission(user, { id: normalizedModuleId, slug: normalizedModuleId }, normalizedAction)) {
      return next();
    }

    logSecurityEvent("module_access_denied", {
      userId: user.id,
      email: user.email,
      role: user.role,
      accessProfile: user.accessProfile,
      permissionMode: user.permissionMode,
      moduleId: normalizedModuleId,
      action: normalizedAction,
      path: req.originalUrl || req.url,
      method: req.method,
    });

    return res.status(403).json({ error: "Seu perfil não possui permissão para esta área." });
  };
}

async function requireContAdminAccess(req, res, next) {
  return requireModuleAccess("contadmin", "view")(req, res, next);
}

async function requireContAdminManage(req, res, next) {
  return requireModuleAccess("contadmin", "manage")(req, res, next);
}

async function requireTeamConfigManage(req, res, next) {
  return requireModuleAccess("contadmin", "manage")(req, res, next);
}

async function requireAccountingAccess(req, res, next) {
  return requireModuleAccess("contflow", "view")(req, res, next);
}

module.exports = {
  requireAuth,
  requireAdmin,
  requireContAdminAccess,
  requireContAdminManage,
  requireTeamConfigManage,
  requireAccountingAccess,
  requireModuleAccess,
  canAccessModule,
};
