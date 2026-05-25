const KNOWN_ACCESS_PROFILES = new Set([
  "ti",
  "gerencial",
  "coordenacao",
  "operacional",
  "consulta",
  "comercial",
]);

const PROFILE_RULES = {
  ti: {
    dashboard: { view: true, edit: true, manage: true },
    contcomercial: { view: true, edit: true, manage: true },
    contflow: { view: true, edit: true, manage: true },
    contanalytics: { view: true, edit: true, manage: true },
    contdocs: { view: true, edit: true, manage: true },
    contrelatorios: { view: true, edit: true, manage: true },
    contconfig: { view: true, edit: true, manage: true },
    contadmin: { view: true, edit: true, manage: true },
  },
  gerencial: {
    dashboard: { view: true, edit: true, manage: false },
    contcomercial: { view: true, edit: true, manage: false },
    contflow: { view: true, edit: true, manage: false },
    contanalytics: { view: true, edit: true, manage: false },
    contdocs: { view: true, edit: true, manage: false },
    contrelatorios: { view: true, edit: true, manage: false },
    contconfig: { view: true, edit: true, manage: false },
    contadmin: { view: true, edit: false, manage: false },
  },
  coordenacao: {
    dashboard: { view: true, edit: false, manage: false },
    contcomercial: { view: false, edit: false, manage: false },
    contflow: { view: true, edit: true, manage: false },
    contanalytics: { view: true, edit: false, manage: false },
    contdocs: { view: true, edit: true, manage: false },
    contrelatorios: { view: true, edit: false, manage: false },
    contconfig: { view: false, edit: false, manage: false },
    contadmin: { view: false, edit: false, manage: false },
  },
  operacional: {
    dashboard: { view: true, edit: false, manage: false },
    contcomercial: { view: false, edit: false, manage: false },
    contflow: { view: true, edit: true, manage: false },
    contanalytics: { view: false, edit: false, manage: false },
    contdocs: { view: true, edit: true, manage: false },
    contrelatorios: { view: true, edit: false, manage: false },
    contconfig: { view: false, edit: false, manage: false },
    contadmin: { view: false, edit: false, manage: false },
  },
  consulta: {
    dashboard: { view: true, edit: false, manage: false },
    contcomercial: { view: false, edit: false, manage: false },
    contflow: { view: true, edit: false, manage: false },
    contanalytics: { view: false, edit: false, manage: false },
    contdocs: { view: true, edit: false, manage: false },
    contrelatorios: { view: true, edit: false, manage: false },
    contconfig: { view: false, edit: false, manage: false },
    contadmin: { view: false, edit: false, manage: false },
  },
  comercial: {
    dashboard: { view: true, edit: false, manage: false },
    contcomercial: { view: true, edit: true, manage: false },
    contflow: { view: false, edit: false, manage: false },
    contanalytics: { view: false, edit: false, manage: false },
    contdocs: { view: false, edit: false, manage: false },
    contrelatorios: { view: false, edit: false, manage: false },
    contconfig: { view: false, edit: false, manage: false },
    contadmin: { view: false, edit: false, manage: false },
  },
};

function cleanText(value) {
  return String(value ?? "").trim();
}

function mapRoleOut(role) {
  const normalized = cleanText(role).toUpperCase();
  if (normalized === "ADMIN") return "admin";
  if (normalized === "TI") return "ti";
  if (normalized === "USER") return "user";
  return "customer";
}

function normalizeAccessProfile(value, fallbackRole = "customer") {
  const normalized = cleanText(value).toLowerCase();
  if (KNOWN_ACCESS_PROFILES.has(normalized)) {
    return normalized;
  }

  const role = mapRoleOut(fallbackRole);
  if (role === "ti") return "ti";
  if (role === "admin") return "gerencial";
  return "operacional";
}

function normalizePermissionMode(value) {
  return cleanText(value).toLowerCase() === "custom" ? "custom" : "profile";
}

function normalizeModuleKey(value) {
  return cleanText(value).toLowerCase();
}

function defaultPermissionSet() {
  return { view: false, edit: false, manage: false };
}

function normalizePermissionFlags(flags = {}) {
  const view = Boolean(flags.view ?? flags.canView);
  const edit = Boolean(flags.edit ?? flags.canEdit);
  const manage = Boolean(flags.manage ?? flags.canManage);
  return {
    view: view || edit || manage,
    edit: edit || manage,
    manage,
  };
}

function parseAccessList(access) {
  return cleanText(access)
    .split("+")
    .map((item) => cleanText(item).toLowerCase())
    .filter(Boolean);
}

function getProfileModulePermissions(accessProfile, moduleRow = {}) {
  const profile = normalizeAccessProfile(accessProfile);
  if (profile === "ti") {
    return { view: true, edit: true, manage: true };
  }

  const moduleKey = normalizeModuleKey(moduleRow.slug || moduleRow.id || moduleRow.moduleId);
  const profileRules = PROFILE_RULES[profile] || {};
  const explicit = profileRules[moduleKey];
  if (explicit) {
    return normalizePermissionFlags(explicit);
  }

  if (moduleRow.active === false) {
    return defaultPermissionSet();
  }

  const allowed = parseAccessList(moduleRow.access);
  if (!allowed.length || allowed.includes("operacional") || allowed.includes("all") || allowed.includes("*")) {
    return { view: true, edit: false, manage: false };
  }

  const roleAlias = mapRoleOut(profile);
  if (allowed.includes(profile) || allowed.includes(roleAlias)) {
    return { view: true, edit: false, manage: false };
  }

  if (profile === "gerencial" && allowed.includes("admin")) {
    return { view: true, edit: false, manage: false };
  }

  return defaultPermissionSet();
}

function buildCustomPermissionMap(user) {
  const permissionMap = new Map();
  const rows = Array.isArray(user?.modulePermissions) ? user.modulePermissions : [];

  rows.forEach((entry) => {
    const moduleKey = normalizeModuleKey(entry?.module?.slug || entry?.moduleSlug || entry?.slug || entry?.moduleId);
    if (!moduleKey) return;
    permissionMap.set(moduleKey, normalizePermissionFlags(entry));
  });

  return permissionMap;
}

function getEffectiveModulePermission(user, moduleRow = {}) {
  const role = mapRoleOut(user?.role);
  const accessProfile = normalizeAccessProfile(user?.accessProfile, user?.role);
  const moduleKey = normalizeModuleKey(moduleRow.slug || moduleRow.id || moduleRow.moduleId);

  if (role === "ti" || accessProfile === "ti") {
    return { view: true, edit: true, manage: true };
  }

  if (!moduleKey) {
    return defaultPermissionSet();
  }

  const mode = normalizePermissionMode(user?.permissionMode);
  if (mode === "custom") {
    const customMap = buildCustomPermissionMap(user);
    return customMap.get(moduleKey) || defaultPermissionSet();
  }

  return getProfileModulePermissions(accessProfile, moduleRow);
}

function hasModulePermission(user, moduleRow, action = "view") {
  const permission = getEffectiveModulePermission(user, moduleRow);
  const normalizedAction = ["manage", "edit", "view"].includes(cleanText(action).toLowerCase())
    ? cleanText(action).toLowerCase()
    : "view";
  return Boolean(permission[normalizedAction]);
}

function canAccessModule(user, moduleRow = {}) {
  return hasModulePermission(user, moduleRow, "view");
}

function buildVisibleModules(user, modules = []) {
  return modules
    .filter((moduleRow) => canAccessModule(user, moduleRow))
    .map((moduleRow) => normalizeModuleKey(moduleRow.slug || moduleRow.id))
    .filter(Boolean);
}

function buildPermissionMatrix(user, modules = []) {
  return modules.map((moduleRow) => ({
    moduleId: normalizeModuleKey(moduleRow.slug || moduleRow.id),
    moduleDbId: Number(moduleRow.id),
    name: cleanText(moduleRow.name),
    status: cleanText(moduleRow.status || "online"),
    active: moduleRow.active !== false,
    ...getEffectiveModulePermission(user, moduleRow),
  }));
}

module.exports = {
  buildPermissionMatrix,
  buildVisibleModules,
  canAccessModule,
  getEffectiveModulePermission,
  hasModulePermission,
  mapRoleOut,
  normalizeAccessProfile,
  normalizeModuleKey,
  normalizePermissionFlags,
  normalizePermissionMode,
};
