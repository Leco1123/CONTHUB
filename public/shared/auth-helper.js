// public/shared/auth-helper.js
// =======================================
// AUTH HELPER • CONTHUB (COMPAT)
// ✅ Suporta sessão NOVA: conthub_user (obj)
// ✅ Suporta sessão LEGADA: conthub_current_user_id + conthub_usuarios
// ✅ Guard + logout unificados
// =======================================

export const KEYS = {
  // sessão nova (vinda do /api/auth/login)
  SESSION_USER: "conthub_user",

  // legado (seu contadmin antigo)
  CURRENT_USER: "conthub_current_user_id",
  USERS: "conthub_usuarios",
};

export function loadUsers() {
  try {
    const arr = JSON.parse(localStorage.getItem(KEYS.USERS) || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function getCurrentUserId() {
  const raw = localStorage.getItem(KEYS.CURRENT_USER);
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * ✅ Fonte única do usuário logado:
 * 1) tenta conthub_user (novo)
 * 2) se não existir, tenta current_user_id + usuarios (legado)
 */
export function getCurrentUser() {
  // 1) novo (conthub_user)
  try {
    const raw = localStorage.getItem(KEYS.SESSION_USER);
    if (raw) {
      const u = JSON.parse(raw);
      if (u && typeof u === "object") {
        if (u.ativo === false) return null;
        return u;
      }
    }
  } catch {
    // ignora
  }

  // 2) legado (id + lista)
  const id = getCurrentUserId();
  if (!id) return null;

  const users = loadUsers();
  const u = users.find((x) => Number(x.id) === Number(id)) || null;
  if (u && u.ativo === false) return null;
  return u;
}

export function requireAuth(loginUrl) {
  const u = getCurrentUser();
  if (!u) {
    // limpa qualquer coisa quebrada
    localStorage.removeItem(KEYS.SESSION_USER);
    localStorage.removeItem(KEYS.CURRENT_USER);

    if (loginUrl) window.location.replace(loginUrl);
    return null;
  }
  return u;
}

export function logoutAndRedirect(loginUrl) {
  // limpa os 2 formatos
  localStorage.removeItem(KEYS.SESSION_USER);
  localStorage.removeItem(KEYS.CURRENT_USER);

  if (loginUrl) window.location.replace(loginUrl);
}

// helpers UI
export function roleLabel(role) {
  if (role === "ti") return "TI";
  if (role === "admin") return "ADMIN";
  return "USER";
}

export function avatarFromName(name) {
  const t = String(name || "").trim();
  return t ? t[0].toUpperCase() : "U";
}
