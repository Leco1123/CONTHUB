console.log("⚡ ContFlow JS carregando...");

/* ===========================
   CONT HUB • SESSION + NAV
=========================== */
const USER_PAGE_URL = "../perfil/perfil.html";
const LOGIN_PAGE_URL = "../login/login.html";

/* ===========================
   CONTFLOW CHANNEL
=========================== */
const CF_BC_NAME = "conthub:contflow:bc";

/* ===========================
   API
=========================== */
const API_MODULES = "/api/admin/modules";
const CF_SHEET_DEFS = [
  { index: 0, key: "contflow", label: "1º Trimestre", draftKey: "conthub:contflow:local-draft", backupsKey: "conthub:contflow:local-backups" },
  { index: 1, key: "contflow-q2", label: "2º Trimestre", draftKey: "conthub:contflow-q2:local-draft", backupsKey: "conthub:contflow-q2:local-backups" },
  { index: 2, key: "contflow-q3", label: "3º Trimestre", draftKey: "conthub:contflow-q3:local-draft", backupsKey: "conthub:contflow-q3:local-backups" },
  { index: 3, key: "contflow-q4", label: "4º Trimestre", draftKey: "conthub:contflow-q4:local-draft", backupsKey: "conthub:contflow-q4:local-backups" },
];
const CF_SHARED_COL_KEYS = [
  "cod",
  "razao_social",
  "cnpj_cpf",
  "trib",
  "grupo",
  "desligamento",
  "status",
  "resp1",
  "resp2",
  "resp3",
  "tipo",
];
const CF_ACTIVE_QUARTER_STORAGE_KEY = "conthub:contflow:active-quarter";
const CF_QUOTA_MODAL_MODE_LABELS = {
  compensacao: "Compensação",
  prejuizo: "Prejuízo",
  sm: "S/M",
  data: "Data",
  outro: "Outro valor",
};
const CF_MIT_GENERATION_OPTIONS = [
  "entrega manual",
  "ok",
  "prejuizo",
  "s/m",
];

function parseContFlowQuarterFromHash(hash = "") {
  const match = String(hash || "").trim().match(/^#cf-quarter-(\d+)$/i);
  if (!match) return null;
  const index = Number(match[1]) - 1;
  return Number.isInteger(index) && index >= 0 && index < CF_SHEET_DEFS.length ? index : null;
}

function buildContFlowQuarterHash(index = activeContFlowSheetIndex) {
  return `#cf-quarter-${Number(index) + 1}`;
}

function persistActiveContFlowQuarter(index = activeContFlowSheetIndex) {
  try {
    localStorage.setItem(CF_ACTIVE_QUARTER_STORAGE_KEY, String(index));
  } catch (_) {}
}

function restoreActiveContFlowQuarter() {
  const fromHash = parseContFlowQuarterFromHash(window.location.hash);
  if (fromHash != null) return fromHash;

  try {
    const raw = localStorage.getItem(CF_ACTIVE_QUARTER_STORAGE_KEY);
    const parsed = Number(raw);
    if (Number.isInteger(parsed) && parsed >= 0 && parsed < CF_SHEET_DEFS.length) {
      return parsed;
    }
  } catch (_) {}

  return 0;
}

function syncContFlowQuarterHash(index = activeContFlowSheetIndex) {
  const nextHash = buildContFlowQuarterHash(index);
  if (window.location.hash === nextHash) return;
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${nextHash}`);
}

function resolveApiUrl(url) {
  const target = String(url || "").trim();
  if (!target) return target;
  if (/^https?:\/\//i.test(target)) return target;

  return target;
}

function getContFlowSheetDef(index = activeContFlowSheetIndex) {
  return CF_SHEET_DEFS[index] || CF_SHEET_DEFS[0];
}

function getActiveContFlowSheetDef() {
  return getContFlowSheetDef(activeContFlowSheetIndex);
}

function getContFlowApiSheetUrl() {
  return `/api/sheets/${getActiveContFlowSheetDef().key}`;
}

function getContFlowCellsUrl() {
  return `${getContFlowApiSheetUrl()}/cells`;
}

function getContFlowImportUrl() {
  return `${getContFlowApiSheetUrl()}/import-local`;
}

function getContFlowBackupsUrl() {
  return `${getContFlowApiSheetUrl()}/backups`;
}

function getContFlowLocalDraftKey() {
  return getActiveContFlowSheetDef().draftKey;
}

function getContFlowLocalBackupsKey() {
  return getActiveContFlowSheetDef().backupsKey;
}

function getContFlowLocalDraftKeyByIndex(index) {
  return getContFlowSheetDef(index).draftKey;
}

async function apiFetch(url, options = {}) {
  return fetch(resolveApiUrl(url), {
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });
}

async function requireAuthOrRedirect() {
  try {
    const resp = await apiFetch("/api/auth/me", { method: "GET" });

    if (!resp.ok) {
      currentUser = null;
      if (Number(resp.status) === 401) {
        goto(LOGIN_PAGE_URL);
      } else {
        console.warn("ContFlow recebeu resposta inesperada ao validar sessão:", resp.status);
        alert("Não foi possível validar sua sessão no ContFlow agora. Tente abrir novamente pelo dashboard.");
        goto("../dashboard/dashboard.html");
      }
      return null;
    }

    const data = await resp.json().catch(() => null);
    const me = data && typeof data === "object" ? data.user || data : null;

    if (!me || typeof me !== "object") {
      currentUser = null;
      goto(LOGIN_PAGE_URL);
      return null;
    }

    currentUser = me;
    return me;
  } catch (err) {
    currentUser = null;
    console.warn("Falha ao validar sessão no ContFlow:", err);
    alert("Falha ao validar sua sessão no ContFlow. Tente novamente pelo dashboard.");
    goto("../dashboard/dashboard.html");
    return null;
  }
}

const MAX_UNDO = 150;
const MAX_VERSIONS = 12;

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#039;";
    }
  });
}

/* ===========================
   ESTADO
=========================== */
let CF_COLUMNS = [
  { key: "cod", label: "Cód." },
  { key: "razao_social", label: "Razão Social" },
  { key: "cnpj_cpf", label: "CNPJ/CPF" },
  { key: "trib", label: "Trib." },
  { key: "grupo", label: "Grupo" },
  { key: "desligamento", label: "Desligamento" },
  { key: "status", label: "Status" },
  { key: "resp1", label: "Resp.1" },
  { key: "resp2", label: "Resp.2" },
  { key: "resp3", label: "Resp.3" },
  { key: "tipo", label: "Tipo" },
  { key: "num_quotas", label: "Num Quotas" },
  { key: "quota1", label: "1º quota" },
  { key: "quota2", label: "2º quota" },
  { key: "quota3", label: "3º quota" },
  { key: "obs", label: "Obs" },
  { key: "mit", label: "MIT - geração" },
  { key: "controle_mit", label: "MIT - envio" },
  { key: "acesso_cliente", label: "Acesso do cliente" },
  { key: "inconsistencia_athenas", label: "Inconsistência Athenas" },
];

let cfData = [];
let viewMap = [];
let cfCellMeta = new Map();
let activeContFlowSheetIndex = 0;
let cfQuarterCache = Array.from({ length: 4 }, () => null);

let sortState = null;
let filters = {};
let globalSearch = "";
let colWidths = {};

let activeRow = 0;
let activeCol = 0;
let selectionAnchor = null;
let mouseSelecting = false;
let lastSelectionBounds = null;
let autoSaveTimeout = null;

let editing = null;
let quotaEditor = null;
let mitEditor = null;
let optionEditor = null;
let suppressClickSelect = false;

let undoStack = [];
let redoStack = [];
let clipboardTextCache = "";

let findUI = null;
let findResults = [];
let findIndex = -1;

let ctxMenuEl = null;
let cfBC = null;
let cfFilterAnchorEl = null;
let cfFilterPositionRaf = null;

/* versões agora ficam só em memória da página */
let cfVersions = [];

/* controle do último payload salvo/carregado para delta */
let lastSavedPayload = null;
let saveInFlight = false;
let queuedSaveAfterFlight = false;
let currentUser = null;
let cfAssignableUsers = [];
let cfAssignableUsersLoaded = false;
let cfAssignableUsersPromise = null;
let cfQuotaModalState = {
  open: false,
  saving: false,
  filteredDataIndexes: [],
};

/* controle de pendências */
let dirtyCells = new Set();
let hasStructuralChanges = false;
let structuralDirtyReasons = new Set();
let hasConfigChanges = false;
let cfServerBackups = [];

/* módulos */
let MODULES_MAP = {};
let MODULE_ACCESS_MAP = {};

const STATUS_LABEL = {
  online: "ONLINE",
  dev: "DEV",
  offline: "OFF",
  admin: "ADMIN",
};

const CF_FROZEN_COL_KEYS = ["cod", "razao_social", "cnpj_cpf", "trib", "grupo"];
const CF_SELECT_COLUMN_KEYS = new Set([]);
const CF_FIXED_SELECT_OPTIONS = {
  trib: [
    "Lucro Presumido",
    "Lucro Real Trimestral",
    "Lucro Real Anual",
    "Simples Nacional",
    "Isento",
    "Imune",
  ],
  num_quotas: ["1", "2", "3"],
};
const REMOVED_CONTFLOW_COLUMN_LABELS = new Set(["class", "classe"]);

function cloneMap(source) {
  return new Map(Array.from(source?.entries?.() || []));
}

function createQuarterSnapshot() {
  return {
    columns: deepClone(CF_COLUMNS),
    rows: deepClone(cfData),
    cellMeta: cloneMap(cfCellMeta),
    sortState: deepClone(sortState),
    filters: deepClone(filters),
    colWidths: deepClone(colWidths),
    versions: deepClone(cfVersions),
    dirtyCells: new Set(Array.from(dirtyCells)),
    hasStructuralChanges: Boolean(hasStructuralChanges),
    structuralDirtyReasons: Array.from(structuralDirtyReasons),
    hasConfigChanges: Boolean(hasConfigChanges),
    lastSavedPayload: deepClone(lastSavedPayload),
  };
}

function applyQuarterSnapshot(snapshot) {
  if (!snapshot) return false;

  if (Array.isArray(snapshot.columns) && snapshot.columns.length) {
    CF_COLUMNS = ensureUniqueKeys(sanitizeContFlowColumns(deepClone(snapshot.columns)));
  }
  cfData = Array.isArray(snapshot.rows) ? deepClone(snapshot.rows) : [];
  cfCellMeta = cloneMap(snapshot.cellMeta);
  sortState = deepClone(snapshot.sortState);
  filters = deepClone(snapshot.filters || {});
  colWidths = deepClone(snapshot.colWidths || {});
  cfVersions = Array.isArray(snapshot.versions) ? deepClone(snapshot.versions) : [];
  dirtyCells = new Set(Array.from(snapshot.dirtyCells || []));
  hasStructuralChanges = Boolean(snapshot.hasStructuralChanges);
  structuralDirtyReasons = new Set(
    Array.isArray(snapshot.structuralDirtyReasons) ? snapshot.structuralDirtyReasons : []
  );
  hasConfigChanges = Boolean(snapshot.hasConfigChanges);
  lastSavedPayload = snapshot.lastSavedPayload ? deepClone(snapshot.lastSavedPayload) : null;
  return true;
}

function cacheActiveQuarterState() {
  cfQuarterCache[activeContFlowSheetIndex] = createQuarterSnapshot();
}

function getCanonicalContFlowSharedKeyFromLabel(label = "") {
  const normalized = normalizeLabel(label);
  if (!normalized) return "";
  if (/^cod\b|^codigo\b/.test(normalized)) return "cod";
  if (/razao.*social/.test(normalized)) return "razao_social";
  if (/cnpj|cpf/.test(normalized)) return "cnpj_cpf";
  if (/^trib\b|tribut/.test(normalized)) return "trib";
  if (/^grupo\b/.test(normalized)) return "grupo";
  if (/^class\b|^classe\b/.test(normalized)) return "class";
  if (/deslig/.test(normalized)) return "desligamento";
  if (/^status\b|situac/.test(normalized)) return "status";
  if (/resp.*1|responsavel.*1/.test(normalized)) return "resp1";
  if (/resp.*2|responsavel.*2/.test(normalized)) return "resp2";
  if (/resp.*3|responsavel.*3/.test(normalized)) return "resp3";
  if (/^tipo\b/.test(normalized)) return "tipo";
  return "";
}

function getContFlowSharedColumnKeyMap(columns = CF_COLUMNS) {
  const map = {};
  (Array.isArray(columns) ? columns : []).forEach((col) => {
    const canonical = getCanonicalContFlowSharedKeyFromLabel(col?.label || col?.key || "");
    if (!canonical) return;
    map[canonical] = String(col?.key || "").trim() || canonical;
  });
  return map;
}

function applyCanonicalSharedAliasesToRows(rows = [], columns = []) {
  const keyMap = getContFlowSharedColumnKeyMap(columns);
  return (Array.isArray(rows) ? rows : []).map((sourceRow) => {
    const row = { ...(sourceRow || {}) };
    Object.entries(keyMap).forEach(([canonicalKey, sourceKey]) => {
      if (!sourceKey) return;
      if (row[canonicalKey] == null || row[canonicalKey] === "") {
        row[canonicalKey] = row[sourceKey] != null ? row[sourceKey] : "";
      }
    });
    return row;
  });
}

function getSharedValueFromRow(row, canonicalKey, sourceKeyMap = null) {
  if (!row) return "";
  const sourceKey = sourceKeyMap?.[canonicalKey];
  if (sourceKey && row[sourceKey] != null && row[sourceKey] !== "") {
    return row[sourceKey];
  }
  if (row[canonicalKey] != null) return row[canonicalKey];
  return "";
}

function buildBootstrapRowsFromFirstQuarter() {
  const sourceSnapshot =
    cfQuarterCache[0] || (activeContFlowSheetIndex === 0 ? createQuarterSnapshot() : null);
  const sourceRows = Array.isArray(sourceSnapshot?.rows) ? sourceSnapshot.rows : [];
  const sourceKeyMap = getContFlowSharedColumnKeyMap(sourceSnapshot?.columns || CF_COLUMNS);
  const targetKeyMap = getContFlowSharedColumnKeyMap(CF_COLUMNS);

  if (!sourceRows.length) {
    return Array.from({ length: 15 }, () => createEmptyRow());
  }

  return sourceRows.map((sourceRow) => {
    const row = createEmptyRow();
    CF_SHARED_COL_KEYS.forEach((key) => {
      const targetKey = targetKeyMap[key] || key;
      row[targetKey] = normalizeCellValue(
        targetKey,
        getSharedValueFromRow(sourceRow, key, sourceKeyMap)
      );
    });
    row.__id = String(sourceRow?.__id || genId());
    return row;
  });
}

function applyQuarterBootstrap(index) {
  const rows = index === 0 ? Array.from({ length: 15 }, () => createEmptyRow()) : buildBootstrapRowsFromFirstQuarter();
  cfData = coerceRowsToCurrentColumns(rows);
  cfCellMeta = new Map();
  sortState = null;
  filters = {};
  CF_COLUMNS.forEach((c) => {
    if (colWidths[c.key] == null) setDefaultWidthForCol(c.key);
  });
  cfVersions = [];
  clearDirtyState();
  lastSavedPayload = buildServerPayload();
  cacheActiveQuarterState();
}

/* ===========================
   HELPERS
=========================== */
function goto(url) {
  const target = String(url || "").trim();
  if (!target) return;

  try {
    const resolved = new URL(target, window.location.href).href;
    console.log("Navegando para:", resolved);
    window.location.assign(resolved);
  } catch (err) {
    console.error("Erro ao navegar para módulo:", target, err);
    alert("Não foi possível abrir o módulo.");
  }
}

function getSessionUser() {
  return currentUser;
}

function normalizeAccessProfile(value) {
  const profile = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (profile === "ti") return "ti";
  if (profile === "admin" || profile === "gerencial" || profile === "gerencia") return "gerencial";
  if (profile === "coordenacao" || profile === "coordenador") return "coordenacao";
  if (profile === "comercial") return "comercial";
  if (profile === "consulta") return "consulta";
  if (profile === "operacional" || profile === "user" || profile === "usuario") return "operacional";
  return profile || "operacional";
}

function getAccessProfile(user) {
  const target = user && typeof user === "object" ? user : {};
  return normalizeAccessProfile(
    target.accessProfile || target.access_profile || target.perfilAcesso || target.perfil_acesso || target.role
  );
}

function normalizeModuleAccess(access) {
  return String(access || "")
    .split("+")
    .map(normalizeAccessProfile)
    .filter(Boolean);
}

function canAccessModule(moduleId, user = getSessionUser()) {
  const id = String(moduleId || "").trim().toLowerCase();
  if (Array.isArray(user?.permissions)) {
    const matched = user.permissions.find((entry) => String(entry?.moduleId || "").trim().toLowerCase() === id);
    if (matched) return Boolean(matched.view);
  }
  if (Array.isArray(user?.visibleModules) && user.visibleModules.length) {
    return user.visibleModules.map((item) => String(item || "").trim().toLowerCase()).includes(id);
  }
  const profile = getAccessProfile(user);
  const role = String(user?.role || "").trim().toLowerCase();
  const rules = normalizeModuleAccess(MODULE_ACCESS_MAP[id]);

  if (profile === "ti" || role === "ti") return true;
  if (profile === "comercial") return id === "dashboard" || id === "contcomercial";
  if (id === "contadmin") return profile === "gerencial" || role === "admin";
  if (id === "contanalytics") return ["gerencial", "coordenacao"].includes(profile) || role === "admin";
  if (!rules.length || rules.includes("operacional")) return true;
  if (rules.includes("all") || rules.includes("*") || rules.includes("auth")) return true;
  if (rules.includes(profile) || rules.includes(role)) return true;
  if (rules.includes("gerencial") && role === "admin") return true;
  return false;
}

function canManageContFlowBase(user) {
  const target = user || (typeof getSessionUser === "function" ? getSessionUser() : null);
  const email = String(target?.email || "").trim().toLowerCase();
  const name = String(target?.name || target?.nome || "").trim().toLowerCase();

  return (
    email === "leandro.vieira@franco-rnc.com.br" ||
    email === "adminleco@franco-rnc.com.br" ||
    (email.includes("leandro") && email.endsWith("@franco-rnc.com.br")) ||
    name.includes("leandro")
  );
}

window.canManageSharedSheetBase = canManageContFlowBase;

function applyContFlowBaseAccess() {
  const baseBtn = document.getElementById("cf-base-btn");
  const saveBaseTopBtn = document.getElementById("cf-save-base-top");

  const allowed = canManageContFlowBase(getSessionUser());

  if (baseBtn) {
    baseBtn.hidden = !allowed;
    baseBtn.disabled = !allowed;
    baseBtn.setAttribute("aria-hidden", allowed ? "false" : "true");
  }

  if (saveBaseTopBtn) {
    saveBaseTopBtn.hidden = !allowed;
    saveBaseTopBtn.disabled = !allowed;
    saveBaseTopBtn.setAttribute("aria-hidden", allowed ? "false" : "true");
  }
}

function roleLabel(role) {
  const r = String(role || "").toLowerCase();
  if (r === "ti") return "TI";
  if (r === "admin") return "ADMIN";
  return "USER";
}

function avatarFromName(name) {
  const t = String(name || "").trim();
  return t ? t[0].toUpperCase() : "U";
}

async function logout() {
  try {
    await apiFetch("/api/auth/logout", { method: "POST" });
  } catch (_) {}

  currentUser = null;
  goto(LOGIN_PAGE_URL);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(v, max));
}

function normalizeLabel(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function uniqueSortedValues(values = []) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" }));
}

function isSelectColumnKey(colKey) {
  return CF_SELECT_COLUMN_KEYS.has(String(colKey || "").trim());
}

function isMitGenerationColumnKey(colKey) {
  const cleanKey = String(colKey || "").trim();
  return cleanKey === getMitGenerationKey();
}

function collectColumnValuesFromRows(rows = [], colKey) {
  const values = [];
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const value = String(row?.[colKey] ?? "").trim();
    if (value) values.push(value);
  });
  return values;
}

function collectColumnValuesAcrossQuarters(colKey) {
  const values = collectColumnValuesFromRows(cfData, colKey);

  cfQuarterCache.forEach((snapshot) => {
    if (!snapshot || !Array.isArray(snapshot.rows)) return;
    values.push(...collectColumnValuesFromRows(snapshot.rows, colKey));
  });

  return uniqueSortedValues(values);
}

async function ensureAssignableUsersLoaded() {
  if (cfAssignableUsersLoaded) return cfAssignableUsers;
  if (cfAssignableUsersPromise) return cfAssignableUsersPromise;

  cfAssignableUsersPromise = (async () => {
    try {
      const resp = await apiFetch("/api/admin/users", { method: "GET" });
      if (!resp.ok) throw new Error("Usuários indisponíveis");
      const data = await resp.json().catch(() => null);
      const users = Array.isArray(data) ? data : Array.isArray(data?.users) ? data.users : [];
      cfAssignableUsers = uniqueSortedValues(
        users.map((user) => user?.name || user?.nome || "")
      );
    } catch (_) {
      cfAssignableUsers = cfAssignableUsers.length ? cfAssignableUsers : [];
    } finally {
      cfAssignableUsersLoaded = true;
      cfAssignableUsersPromise = null;
    }

    return cfAssignableUsers;
  })();

  return cfAssignableUsersPromise;
}

function getSelectOptionsForColumn(colKey, currentValue = "") {
  const key = String(colKey || "").trim();
  const values = [
    ...(CF_FIXED_SELECT_OPTIONS[key] || []),
    ...collectColumnValuesAcrossQuarters(key),
  ];

  if (key === "resp1" || key === "resp2" || key === "resp3") {
    values.push(...cfAssignableUsers);
  }

  if (currentValue) values.push(String(currentValue).trim());
  return uniqueSortedValues(values);
}

function canonicalContFlowLabel(label) {
  const nl = normalizeLabel(label);

  if (!nl) return "";
  if (/^(cod|codigo)$/.test(nl)) return "Cód.";
  if (/^razao social$/.test(nl)) return "Razão Social";
  if (/^(cnpj cpf|cnpj ou cpf|cpf cnpj)$/.test(nl)) return "CNPJ/CPF";
  if (/^(trib|tributacao|tributario)$/.test(nl)) return "Trib.";
  if (nl === "grupo") return "Grupo";
  if (/^(class|classe)$/.test(nl)) return "Class";
  if (/^(desligamento|data desligamento|dt desligamento|data de desligamento)$/.test(nl)) {
    return "Desligamento";
  }
  if (/^(status|situacao|situacao fiscal)$/.test(nl)) return "Status";
  if (/^(resp 1|resp1|responsavel 1|responsavel1)$/.test(nl)) return "Resp.1";
  if (/^(resp 2|resp2|responsavel 2|responsavel2)$/.test(nl)) return "Resp.2";
  if (/^(resp 3|resp3|responsavel 3|responsavel3)$/.test(nl)) return "Resp.3";
  if (nl === "tipo") return "Tipo";
  if (/^(num quotas|numero quotas|numero de quotas|qtd quotas|quantidade quotas)$/.test(nl)) {
    return "Num Quotas";
  }
  if (/^(1 quota|1a quota|primeira quota)$/.test(nl)) return "1º quota";
  if (/^(2 quota|2a quota|segunda quota)$/.test(nl)) return "2º quota";
  if (/^(3 quota|3a quota|terceira quota)$/.test(nl)) return "3º quota";
  if (/^(obs|observacao|observacoes)$/.test(nl)) return "Obs";
  if (/^(mit|mit geracao|mit geracao|mit - geracao|mit geração|mit - geração)$/.test(nl)) {
    return "MIT - geração";
  }
  if (/^(controle de mit|controle mit|mit envio|mit - envio)$/.test(nl)) return "MIT - envio";
  if (/^(acesso do cliente|acesso cliente)$/.test(nl)) return "Acesso do cliente";
  if (/^(inconsistencia athenas|inconsistência athenas)$/.test(nl)) return "Inconsistência Athenas";

  return String(label ?? "").trim();
}

function isRemovedContFlowColumn(col = {}) {
  const keyLabel = normalizeLabel(col?.label || col?.key || "");
  return REMOVED_CONTFLOW_COLUMN_LABELS.has(keyLabel);
}

function sanitizeContFlowColumns(columns = []) {
  return (Array.isArray(columns) ? columns : []).filter((col) => !isRemovedContFlowColumn(col));
}

function getRequiredContFlowColumns() {
  return [
    { key: "cod", label: "Cód." },
    { key: "razao_social", label: "Razão Social" },
    { key: "cnpj_cpf", label: "CNPJ/CPF" },
    { key: "trib", label: "Trib." },
    { key: "grupo", label: "Grupo" },
    { key: "desligamento", label: "Desligamento" },
    { key: "status", label: "Status" },
    { key: "resp1", label: "Resp.1" },
    { key: "resp2", label: "Resp.2" },
    { key: "resp3", label: "Resp.3" },
    { key: "tipo", label: "Tipo" },
    { key: "num_quotas", label: "Num Quotas" },
    { key: "quota1", label: "1º quota" },
    { key: "quota2", label: "2º quota" },
    { key: "quota3", label: "3º quota" },
    { key: "obs", label: "Obs" },
    { key: "mit", label: "MIT - geração" },
    { key: "controle_mit", label: "MIT - envio" },
    { key: "acesso_cliente", label: "Acesso do cliente" },
    { key: "inconsistencia_athenas", label: "Inconsistência Athenas" },
  ];
}

function slugKeyFromLabel(label) {
  const base = String(label ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return base || "col";
}

function ensureUniqueKeys(cols) {
  const used = new Set();
  return (cols || []).map((c) => {
    let k = String(c.key || "").trim();
    if (!k) k = slugKeyFromLabel(c.label || "col");
    let base = k || "col";
    let i = 2;
    while (used.has(k) || !k) k = `${base}_${i++}`;
    used.add(k);
    return { ...c, key: k };
  });
}

function genId() {
  return "r_" + Math.random().toString(36).slice(2) + "_" + Date.now().toString(36);
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

async function loadBaseFromApi() {
  const resp = await apiFetch(getContFlowApiSheetUrl(), { method: "GET" });
  const data = await resp.json().catch(() => null);

  if (!resp.ok) {
    throw new Error(data?.error || "Erro ao carregar ContFlow da API.");
  }

  return data;
}

function isApiRelationalPayload(payload) {
  return (
    payload &&
    typeof payload === "object" &&
    Array.isArray(payload.columns) &&
    Array.isArray(payload.rows) &&
    Array.isArray(payload.cells)
  );
}

function isApiDocumentPayload(payload) {
  return (
    payload &&
    typeof payload === "object" &&
    Array.isArray(payload.columns) &&
    Array.isArray(payload.data)
  );
}

function getRowIdFromDataIndex(dataIndex) {
  const row = cfData[dataIndex];
  return String(row?.__id ?? "").trim();
}

function getDirtyCellKey(rowId, colKey) {
  return `${String(rowId || "").trim()}::${String(colKey || "").trim()}`;
}

function getCellMeta(rowId, colKey) {
  return cfCellMeta.get(getDirtyCellKey(rowId, colKey)) || null;
}

function setCellMeta(rowId, colKey, meta = null) {
  const key = getDirtyCellKey(rowId, colKey);
  if (!meta) {
    cfCellMeta.delete(key);
    return;
  }

  cfCellMeta.set(key, {
    updatedAt: meta.updatedAt ? String(meta.updatedAt).trim() : "",
  });
}

function isCellMarkedDirty(row, colKey) {
  const rowId = String(row?.__id ?? "").trim();
  if (!rowId || !colKey) return false;
  return dirtyCells.has(getDirtyCellKey(rowId, colKey));
}

function markCellDirtyByRowId(rowId, colKey) {
  const cleanRowId = String(rowId || "").trim();
  const cleanColKey = String(colKey || "").trim();
  if (!cleanRowId || !cleanColKey) return;
  dirtyCells.add(getDirtyCellKey(cleanRowId, cleanColKey));
}

function markCellDirty(dataIndex, colKey) {
  const rowId = getRowIdFromDataIndex(dataIndex);
  if (!rowId) return;
  markCellDirtyByRowId(rowId, colKey);
}

function markDirtyChanges(changes = []) {
  (changes || []).forEach((c) => {
    if (!c) return;
    markCellDirty(c.dataIndex, c.colKey);
  });
  refreshDirtyVisuals();
}

function markStructureDirty(reason = "generic") {
  hasStructuralChanges = true;
  const cleanReason = String(reason || "").trim();
  structuralDirtyReasons.add(cleanReason || "generic");
  refreshDirtyVisuals();
}

function markConfigDirty() {
  hasConfigChanges = true;
  refreshDirtyVisuals();
}

function clearDirtyState() {
  dirtyCells.clear();
  hasStructuralChanges = false;
  structuralDirtyReasons.clear();
  hasConfigChanges = false;
  refreshDirtyVisuals();
}

function getStructuralDirtyReasonList() {
  return Array.from(structuralDirtyReasons);
}

function hasOnlyBootstrapStructuralChanges() {
  const reasons = getStructuralDirtyReasonList();
  return !!reasons.length && reasons.every((reason) => reason === "empty_sheet_bootstrap");
}

function getStructuralSaveMessage() {
  if (hasOnlyBootstrapStructuralChanges()) {
    if (canManageContFlowBase(getSessionUser())) {
      return "Este trimestre ainda não existe no banco. Vou salvar a base completa para criar a estrutura e manter suas alterações.";
    }

    return "Este trimestre ainda não foi criado no banco. Um usuário com permissão de salvar base precisa criar a estrutura primeiro; depois o botão de salvar células volta a funcionar normalmente.";
  }

  return "Há alterações estruturais pendentes. Use o botão de salvar base para concluir as mudanças da planilha.";
}

function hasPendingDirtyChanges() {
  return dirtyCells.size > 0 || hasStructuralChanges || hasConfigChanges;
}

function getActiveWorkbookView() {
  const activeBtn = document.querySelector(".cf-view-btn.is-active");
  return String(activeBtn?.dataset.view || "contflow");
}

function hasAnyPendingChanges() {
  const ptDirty =
    window.PainelTributarioSheet && typeof window.PainelTributarioSheet.hasPendingChanges === "function"
      ? window.PainelTributarioSheet.hasPendingChanges()
      : false;
  const ptLrDirty =
    window.PainelTributarioLRSheet &&
    typeof window.PainelTributarioLRSheet.hasPendingChanges === "function"
      ? window.PainelTributarioLRSheet.hasPendingChanges()
      : false;
  const ptLraDirty =
    window.PainelTributarioLRASheet &&
    typeof window.PainelTributarioLRASheet.hasPendingChanges === "function"
      ? window.PainelTributarioLRASheet.hasPendingChanges()
      : false;
  return hasPendingDirtyChanges() || ptDirty || ptLrDirty || ptLraDirty;
}

async function loadCurrentContFlowSheet() {
  updateContFlowSheetUI();

  try {
    const payload = await loadBaseFromApi();
    hydrateContFlowFromApiPayload(payload);
    if (!cfData.length) {
      cfData = Array.from({ length: 15 }, () => createEmptyRow());
      CF_COLUMNS.forEach((c) => setDefaultWidthForCol(c.key));
      markStructureDirty("empty_sheet_bootstrap");
    }
    await mirrorSharedColumnsFromFirstQuarter();
    saveLocalDraft(buildServerPayload());
    cacheActiveQuarterState();
    renderTable();
  } catch (err) {
    console.error("❌ Falha ao carregar %s:", getActiveContFlowSheetDef().label, err);

    const localDraft = loadLocalDraft();
    if (localDraft) {
      hydrateContFlowFromApiPayload(localDraft);
      if (activeContFlowSheetIndex > 0) {
        await mirrorSharedColumnsFromFirstQuarter();
      }
      cacheActiveQuarterState();
      renderTable();
      return;
    }

    forceDefaultColumns(getRequiredContFlowColumns());

    cfData = Array.from({ length: 15 }, () => createEmptyRow());
    cfCellMeta = new Map();
    sortState = null;
    filters = {};
    colWidths = {};
    CF_COLUMNS.forEach((c) => setDefaultWidthForCol(c.key));
    cfVersions = [];
    lastSavedPayload = buildServerPayload();
    clearDirtyState();
    if (activeContFlowSheetIndex > 0) {
      await mirrorSharedColumnsFromFirstQuarter();
    }
    cacheActiveQuarterState();
    renderTable();
  }
}

async function switchContFlowSheet(nextIndex, options = {}) {
  const next = Number(nextIndex);
  if (!Number.isInteger(next) || next === activeContFlowSheetIndex) return;

  if (editing) commitEdit();
  if (optionEditor) closeOptionEditor({ focusCell: false });
  saveLocalDraft(buildServerPayload());

  hideFilterDropdown();
  if (typeof hideCtxMenu === "function") {
    hideCtxMenu();
  }

  cacheActiveQuarterState();

  activeContFlowSheetIndex = next;
  persistActiveContFlowQuarter(next);
  activeRow = 0;
  activeCol = 0;
  selectionAnchor = null;
  lastSelectionBounds = null;
  globalSearch = "";
  const globalSearchInput = document.getElementById("cf-global-search");
  if (globalSearchInput) globalSearchInput.value = "";

  updateContFlowSheetUI();

  if (applyQuarterSnapshot(cfQuarterCache[next])) {
    rebuildViewMap();
    renderTable();
    refreshDirtyVisuals();
    return;
  }

  const localDraft = loadLocalDraftByIndex(next);
  if (localDraft) {
    hydrateContFlowFromApiPayload(localDraft);
    if (next > 0) {
      await mirrorSharedColumnsFromFirstQuarter();
    }
    cacheActiveQuarterState();
    rebuildViewMap();
    renderTable();
    refreshDirtyVisuals();
    return;
  }

  applyQuarterBootstrap(next);
  rebuildViewMap();
  renderTable();
  refreshDirtyVisuals();

  loadCurrentContFlowSheet().catch((err) => {
    console.error("Erro ao sincronizar %s:", getActiveContFlowSheetDef().label, err);
  });
}

window.switchContFlowQuarter = async function switchContFlowQuarter(nextIndex) {
  await switchContFlowSheet(nextIndex, { direct: true });
};

document.addEventListener("click", (event) => {
  const btn = event.target?.closest?.("#view-contflow .cf-main-sheet-tab");
  if (!btn) return;
  event.preventDefault();
  event.stopPropagation();
  window.switchContFlowQuarter(btn.dataset.cfSheet);
});

function updateContFlowSheetUI() {
  const activeDef = getActiveContFlowSheetDef();
  const titleEl = document.getElementById("cf-sheet-title");
  const modalTitleEl = document.getElementById("cf-modal-title");

  if (titleEl) titleEl.textContent = activeDef.label;
  if (modalTitleEl) modalTitleEl.textContent = `Base ContFlow • ${activeDef.label}`;

  document.querySelectorAll("#view-contflow .cf-main-sheet-tab").forEach((btn) => {
    const btnIndex = Number(btn.dataset.cfSheet);
    btn.classList.toggle("is-active", btnIndex === activeContFlowSheetIndex);
  });
}

function getContFlowRowMirrorKey(row) {
  const cod = String(row?.cod ?? "").trim().toLowerCase();
  if (cod) return `cod:${cod}`;

  const doc = String(row?.cnpj_cpf ?? "").trim().toLowerCase();
  if (doc) return `doc:${doc}`;

  const razao = String(row?.razao_social ?? "").trim().toLowerCase();
  if (razao) return `razao:${razao}`;

  const id = String(row?.__id ?? "").trim().toLowerCase();
  if (id) return `id:${id}`;

  return "";
}

function extractRowsFromContFlowPayload(payload) {
  if (isApiRelationalPayload(payload)) {
    const cols = sanitizeContFlowColumns(Array.isArray(payload?.columns) ? payload.columns : []);
    const rows = Array.isArray(payload?.rows) ? payload.rows : [];
    const cells = Array.isArray(payload?.cells) ? payload.cells : [];

    const rowMap = new Map();
    rows.forEach((r) => {
      const rowObj = { __id: String(r?.clientRowId || genId()) };
      cols.forEach((col) => {
        const key = String(col?.key || "").trim();
        if (key) rowObj[key] = "";
      });
      rowMap.set(Number(r?.id), rowObj);
    });

    cells.forEach((cell) => {
      const rowObj = rowMap.get(Number(cell?.rowId));
      const key = String(cell?.colKey || "").trim();
      if (!rowObj || !key) return;
      rowObj[key] = String(cell?.value ?? "");
    });

    return applyCanonicalSharedAliasesToRows(Array.from(rowMap.values()), cols);
  }

  if (isApiDocumentPayload(payload)) {
    return applyCanonicalSharedAliasesToRows(
      Array.isArray(payload?.data) ? payload.data.map((row) => ({ ...row })) : [],
      payload?.columns || []
    );
  }

  return [];
}

async function getFirstQuarterSharedRows() {
  const localDraft = loadLocalDraftByIndex(0);
  if (localDraft) {
    return extractRowsFromContFlowPayload(localDraft);
  }

  const resp = await apiFetch(`/api/sheets/${getContFlowSheetDef(0).key}`, { method: "GET" });
  const data = await resp.json().catch(() => null);
  if (!resp.ok) {
    throw new Error(data?.error || "Erro ao carregar o 1º trimestre do ContFlow.");
  }

  return extractRowsFromContFlowPayload(data);
}

async function mirrorSharedColumnsFromFirstQuarter() {
  if (activeContFlowSheetIndex === 0) return;

  const sourceRows = await getFirstQuarterSharedRows();
  if (!sourceRows.length) return;
  const targetKeyMap = getContFlowSharedColumnKeyMap(CF_COLUMNS);

  const targetMap = new Map();
  (cfData || []).forEach((row) => {
    const key = getContFlowRowMirrorKey(row);
    if (key) targetMap.set(key, row);
  });

  const merged = [];
  sourceRows.forEach((sourceRow) => {
    const key = getContFlowRowMirrorKey(sourceRow);
    const currentRow = (key && targetMap.get(key)) || createEmptyRow();
    const nextRow = { ...currentRow };

    nextRow.__id = String(currentRow?.__id || sourceRow?.__id || genId());

    CF_SHARED_COL_KEYS.forEach((colKey) => {
      const targetKey = targetKeyMap[colKey] || colKey;
      nextRow[targetKey] = normalizeCellValue(
        targetKey,
        getSharedValueFromRow(sourceRow, colKey)
      );
    });

    merged.push(nextRow);
    if (key) targetMap.delete(key);
  });

  targetMap.forEach((row) => {
    merged.push(row);
  });

  cfData = coerceRowsToCurrentColumns(merged);
}

let lastPainelTributarioSyncSignature = "";
let lastPainelTributarioLRSyncSignature = "";
let lastPainelTributarioLRASyncSignature = "";
let lastPainelTributarioRevenueToLRSignature = "";

function getContFlowRowsForPainelTributario() {
  const classKey =
    findColKeyByLabelRegex(/\bclass\b/) ||
    findColKeyByLabelRegex(/\bclasse\b/) ||
    "class";
  const statusKey =
    findColKeyByLabelRegex(/\bstatus\b/) ||
    findColKeyByLabelRegex(/\bsituacao\b/) ||
    "status";
  const resp1Key =
    findColKeyByLabelRegex(/\bresp\.?\s*1\b/) ||
    findColKeyByLabelRegex(/\bresponsavel\b.*\b1\b/) ||
    "resp1";
  const resp2Key =
    findColKeyByLabelRegex(/\bresp\.?\s*2\b/) ||
    findColKeyByLabelRegex(/\bresponsavel\b.*\b2\b/) ||
    "resp2";
  const resp3Key =
    findColKeyByLabelRegex(/\bresp\.?\s*3\b/) ||
    findColKeyByLabelRegex(/\bresponsavel\b.*\b3\b/) ||
    "resp3";

  return (cfData || []).map((row) => ({
    __id: String(row?.__id || "").trim(),
    __sourceRowId: String(row?.__id || "").trim(),
    cod: String(row?.cod ?? ""),
    razao_social: String(row?.razao_social ?? ""),
    tipo: String(row?.tipo ?? ""),
    cnpj_cpf: String(row?.cnpj_cpf ?? ""),
    class: String(row?.[classKey] ?? ""),
    grupo: String(row?.grupo ?? ""),
    trib: String(row?.trib ?? ""),
    status: String(row?.[statusKey] ?? ""),
    resp1: String(row?.[resp1Key] ?? ""),
    resp2: String(row?.[resp2Key] ?? ""),
    resp3: String(row?.[resp3Key] ?? ""),
  }));
}

function syncPainelTributarioFromContFlow(force = false, options = {}) {
  const rows = getContFlowRowsForPainelTributario();
  const signature = JSON.stringify(
      rows.map((row) => [
        row.__sourceRowId,
        row.cod,
        row.razao_social,
        row.tipo,
        row.cnpj_cpf,
        row.class,
        row.grupo,
        row.trib,
        row.status,
        row.resp1,
        row.resp2,
        row.resp3,
      ])
  );

  if (
    window.PainelTributarioSheet &&
    typeof window.PainelTributarioSheet.syncFromContFlowRows === "function"
  ) {
    if (force || signature !== lastPainelTributarioSyncSignature) {
      lastPainelTributarioSyncSignature = signature;
      window.PainelTributarioSheet.syncFromContFlowRows(rows, options);
    }
  }

  if (
    window.PainelTributarioLRSheet &&
    typeof window.PainelTributarioLRSheet.syncFromContFlowRows === "function"
  ) {
    if (force || signature !== lastPainelTributarioLRSyncSignature) {
      lastPainelTributarioLRSyncSignature = signature;
      window.PainelTributarioLRSheet.syncFromContFlowRows(rows, options);
    }
  }

  if (
    window.PainelTributarioLRASheet &&
    typeof window.PainelTributarioLRASheet.syncFromContFlowRows === "function"
  ) {
    if (force || signature !== lastPainelTributarioLRASyncSignature) {
      lastPainelTributarioLRASyncSignature = signature;
      window.PainelTributarioLRASheet.syncFromContFlowRows(rows, options);
    }
  }

  syncPainelTributarioRevenueToLR(force);
}

const PAINEL_TRIBUTARIO_MIRROR_KEYS = new Set([
  "cod",
  "razao_social",
  "tipo",
  "cnpj_cpf",
  "class",
  "grupo",
  "trib",
  "status",
  "resp1",
  "resp2",
  "resp3",
]);

function syncPainelTributarioAfterContFlowChange(changes = [], options = {}) {
  const shouldSync = !Array.isArray(changes) || !changes.length
    ? true
    : changes.some((change) => PAINEL_TRIBUTARIO_MIRROR_KEYS.has(String(change?.colKey || "")));

  if (!shouldSync) return;
  syncPainelTributarioFromContFlow(true, options);
  syncPainelTributarioRevenueToLR(true);
}

function syncPainelTributarioRevenueToLR(force = false) {
  if (
    !window.PainelTributarioSheet ||
    typeof window.PainelTributarioSheet.exportRevenueMirrorSheets !== "function"
  ) {
    return;
  }

  const sourceSheets = window.PainelTributarioSheet.exportRevenueMirrorSheets();
  const signature = JSON.stringify(
    (Array.isArray(sourceSheets) ? sourceSheets : []).map((sheetRows) =>
      (Array.isArray(sheetRows) ? sheetRows : [])
        .map((row) => {
          const sourceId = String(row?.__sourceRowId || row?.__id || "").trim();
          const cod = String(row?.cod || "").trim();
          const cnpjCpf = String(row?.cnpj_cpf || "").trim();
          const razaoSocial = String(row?.razao_social || "").trim().toLowerCase();
          if (!cod && !cnpjCpf && !razaoSocial && !sourceId) return null;

          return [
            sourceId,
            cod,
            cnpjCpf,
            razaoSocial,
            row?.fat_m1 || 0,
            row?.fat_m2 || 0,
            row?.fat_m3 || 0,
          ];
        })
        .filter(Boolean)
    )
  );

  if (!force && signature === lastPainelTributarioRevenueToLRSignature) {
    return;
  }

  lastPainelTributarioRevenueToLRSignature = signature;

  if (
    window.PainelTributarioLRSheet &&
    typeof window.PainelTributarioLRSheet.syncRevenueFromPainelTributarioSheets === "function"
  ) {
    window.PainelTributarioLRSheet.syncRevenueFromPainelTributarioSheets(sourceSheets);
  }

  if (
    window.PainelTributarioLRASheet &&
    typeof window.PainelTributarioLRASheet.syncRevenueFromPainelTributarioSheets === "function"
  ) {
    window.PainelTributarioLRASheet.syncRevenueFromPainelTributarioSheets(sourceSheets);
  }
}

/* ===========================
   MODULE STATUS • API
=========================== */
function normalizeModuleStatus(status, active) {
  const s = String(status || "").trim().toLowerCase();

  if (active === false) return "offline";
  if (s === "offline" || s === "off") return "offline";
  if (s === "dev") return "dev";
  if (s === "admin") return "admin";
  return "online";
}

async function loadModulesMap() {
  try {
    const resp = await apiFetch(API_MODULES, { method: "GET" });
    if (!resp || !resp.ok) throw new Error("Falha ao carregar módulos");

    const data = await resp.json().catch(() => ({}));
    const rows = Array.isArray(data?.modules) ? data.modules : [];

    const map = {};
    const accessMap = {};
    rows.forEach((m) => {
      const slug = String(m.slug || "").trim().toLowerCase();
      if (!slug) return;
      map[slug] = normalizeModuleStatus(m.status, m.active);
      accessMap[slug] = String(m.access || "").trim();
    });

    MODULES_MAP = map;
    MODULE_ACCESS_MAP = accessMap;
    return map;
  } catch (err) {
    console.warn("Falha ao carregar módulos da API no ContFlow:", err);
    MODULES_MAP = {};
    MODULE_ACCESS_MAP = {};
    return MODULES_MAP;
  }
}

function getSidebarCards() {
  return Array.from(
    document.querySelectorAll(".modulos-sidebar .cards-modulos[data-module-id]")
  );
}

function ensureStatusSpan(btn) {
  let pill = btn.querySelector("[data-status]") || btn.querySelector(".status");
  if (!pill) return null;

  if (!pill.getAttribute("data-status")) {
    const txt = String(pill.textContent || "").trim().toLowerCase();
    pill.setAttribute("data-status", txt === "admin" ? "admin" : "online");
  }

  return pill;
}

function applyStatusToSidebar(moduleId, status) {
  const btn = document.querySelector(
    `.modulos-sidebar .cards-modulos[data-module-id="${moduleId}"]`
  );
  if (!btn) return;

  const finalStatus = moduleId === "contadmin" ? "admin" : status || "online";
  const pill = ensureStatusSpan(btn);
  if (!pill) return;

  pill.setAttribute("data-status", finalStatus);
  pill.textContent = STATUS_LABEL[finalStatus] || "ONLINE";

  const isOffline = finalStatus === "offline";
  btn.setAttribute("data-disabled", isOffline ? "true" : "false");

  if (isOffline) btn.classList.add("is-disabled");
  else btn.classList.remove("is-disabled");
}

function syncSidebarFromStore() {
  const store = MODULES_MAP || {};

  getSidebarCards().forEach((btn) => {
    const moduleId = String(btn.dataset.moduleId || "").trim().toLowerCase();
    if (!moduleId) return;

    const def = moduleId === "contadmin" ? "admin" : "online";
    applyStatusToSidebar(moduleId, store[moduleId] || def);
  });
}

function applyRoleToSidebar() {
  const u = getSessionUser();

  getSidebarCards().forEach((card) => {
    const moduleId = String(card.dataset.moduleId || "").trim().toLowerCase();
    if (!moduleId) return;

    const blocked = !canAccessModule(moduleId, u);
    card.setAttribute("data-noaccess", blocked ? "true" : "false");

    if (blocked) {
      card.classList.add("is-disabled");
    } else if (card.getAttribute("data-disabled") !== "true") {
      card.classList.remove("is-disabled");
    }
  });
}

function refreshDirtyVisuals() {
  const cells = document.querySelectorAll(".cf-cell");
  cells.forEach((cell) => {
    const rowIndex = Number(cell.dataset.rowIndex);
    const colKey = String(cell.dataset.colKey || "");
    const dataIndex = viewMap[rowIndex];
    const row = cfData[dataIndex];
    const dirty = row && colKey ? isCellMarkedDirty(row, colKey) : false;
    cell.classList.toggle("is-dirty", !!dirty);
  });

  const statusEl = document.getElementById("cf-status-bar");
  if (!statusEl) return;

  const baseText = statusEl.textContent || "";
  const cleanText = baseText.replace(/\s+·\s+Pendências:.*$/i, "").trim();

  if (hasPendingDirtyChanges()) {
    const parts = [];
    if (dirtyCells.size > 0) parts.push(`${dirtyCells.size} célula(s)`);
    if (hasStructuralChanges) {
      parts.push(hasOnlyBootstrapStructuralChanges() ? "estrutura inicial" : "estrutura");
    }
    if (hasConfigChanges) parts.push("configuração");
    statusEl.textContent = `${cleanText} · Pendências: ${parts.join(" + ")}`;
  } else {
    statusEl.textContent = cleanText;
  }
}

function forceDefaultColumns(requiredCols) {
  const currentByLabel = new Map(
    sanitizeContFlowColumns(CF_COLUMNS || []).map((c) => [normalizeLabel(c.label), c])
  );

  const merged = [];
  sanitizeContFlowColumns(requiredCols || []).forEach((req) => {
    const existing = currentByLabel.get(normalizeLabel(req.label));
    merged.push(existing ? existing : req);
  });

  CF_COLUMNS = ensureUniqueKeys(merged);
  CF_COLUMNS.forEach((c) => setDefaultWidthForCol(c.key));
  cfData = coerceRowsToCurrentColumns(cfData);
}

function hydrateContFlowFromApiPayload(payload) {
  if (isApiRelationalPayload(payload)) {
    const cols = Array.isArray(payload?.columns) ? payload.columns : [];
    const rows = Array.isArray(payload?.rows) ? payload.rows : [];
    const cells = Array.isArray(payload?.cells) ? payload.cells : [];
    cfCellMeta = new Map();

    CF_COLUMNS = ensureUniqueKeys(
      cols.map((c) => ({
        key: String(c.key || "").trim(),
        label: String(c.label || c.key || "Coluna").trim(),
      }))
    );

    forceDefaultColumns(getRequiredContFlowColumns());

    const rowMap = new Map();
    const rowIdToClientRowId = new Map();

    rows.forEach((r) => {
      const rowObj = {};
      CF_COLUMNS.forEach((col) => {
        rowObj[col.key] = "";
      });
      rowObj.__id = String(r.clientRowId || genId());
      rowMap.set(Number(r.id), rowObj);
      rowIdToClientRowId.set(Number(r.id), rowObj.__id);
    });

    cells.forEach((cell) => {
      const rowObj = rowMap.get(Number(cell.rowId));
      if (!rowObj) return;
      if (!(cell.colKey in rowObj)) return;
      rowObj[cell.colKey] = String(cell.value ?? "");
      const clientRowId = String(rowIdToClientRowId.get(Number(cell.rowId)) || "").trim();
      if (clientRowId && cell.colKey) {
        setCellMeta(clientRowId, cell.colKey, {
          updatedAt: cell.updatedAt || "",
        });
      }
    });

    cfData = Array.from(rowMap.values());
    cfData = coerceRowsToCurrentColumns(cfData);

    sortState = payload?.sort || null;
    filters = payload?.filters || {};
    colWidths = payload?.colWidths || {};

    CF_COLUMNS.forEach((c) => {
      if (colWidths[c.key] == null) setDefaultWidthForCol(c.key);
    });

    cfVersions = Array.isArray(payload?.versions) ? payload.versions.slice(0, MAX_VERSIONS) : [];
    lastSavedPayload = buildServerPayload();
    clearDirtyState();
    return;
  }

  if (isApiDocumentPayload(payload)) {
    cfCellMeta = new Map();
    CF_COLUMNS = ensureUniqueKeys(
      sanitizeContFlowColumns(payload.columns).map((c) => ({
        key: String(c.key || slugKeyFromLabel(c.label || "col")).trim(),
        label: String(c.label || c.key || "").trim() || "Coluna",
      }))
    );

    forceDefaultColumns(getRequiredContFlowColumns());

    cfData = coerceRowsToCurrentColumns(payload.data || []);
    sortState = payload.sort || null;
    filters = payload.filters || {};
    colWidths = payload.colWidths || {};
    cfVersions = Array.isArray(payload.versions) ? payload.versions.slice(0, MAX_VERSIONS) : [];

    CF_COLUMNS.forEach((c) => {
      if (colWidths[c.key] == null) setDefaultWidthForCol(c.key);
    });

    lastSavedPayload = buildServerPayload();
    clearDirtyState();
    return;
  }

  throw new Error("Payload da API em formato inválido para o ContFlow.");
}

function buildServerPayload() {
  return {
    version: 4,
    savedAt: new Date().toISOString(),
    columns: deepClone(CF_COLUMNS),
    data: deepClone(cfData),
    sort: deepClone(sortState),
    filters: deepClone(filters),
    colWidths: deepClone(colWidths),
    versions: deepClone(cfVersions.slice(0, MAX_VERSIONS)),
  };
}

async function persistBaseToApi(payload) {
  const resp = await apiFetch(getContFlowApiSheetUrl(), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await resp.json().catch(() => null);

  if (!resp.ok) {
    const err = new Error(data?.error || "Erro ao salvar ContFlow na API.");
    err.status = Number(resp.status || 500);
    err.payload = data;
    throw err;
  }

  return data;
}

async function loadServerBackups() {
  const resp = await apiFetch(getContFlowBackupsUrl(), { method: "GET" });
  const data = await resp.json().catch(() => null);

  if (!resp.ok) {
    throw new Error(data?.error || "Erro ao carregar backups do ContFlow.");
  }

  return Array.isArray(data?.backups) ? data.backups : [];
}

async function restoreServerBackupById(backupId) {
  const resp = await apiFetch(`${getContFlowBackupsUrl()}/${encodeURIComponent(String(backupId || "").trim())}/restore`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });

  const data = await resp.json().catch(() => null);

  if (!resp.ok) {
    throw new Error(data?.error || "Erro ao restaurar backup do ContFlow.");
  }

  return data;
}

function buildDirtyCellPayload() {
  const changes = [];

  dirtyCells.forEach((dirtyKey) => {
    const [rowId, colKey] = String(dirtyKey || "").split("::");
    if (!rowId || !colKey) return;

    const row = cfData.find((item) => String(item?.__id || "").trim() === rowId);
    if (!row) return;

    const meta = getCellMeta(rowId, colKey);
    changes.push({
      rowId,
      colKey,
      value: row[colKey] == null ? "" : String(row[colKey]),
      expectedUpdatedAt: meta?.updatedAt || "",
    });
  });

  return changes;
}

async function persistDirtyCellsToApi(changes) {
  const resp = await apiFetch(getContFlowCellsUrl(), {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ changes }),
  });

  const data = await resp.json().catch(() => null);

  if (!resp.ok) {
    const err = new Error(data?.error || "Erro ao salvar células do ContFlow na API.");
    err.status = Number(resp.status || 500);
    err.payload = data;
    throw err;
  }

  return data;
}

function formatBackupDate(value) {
  if (!value) return "Data indisponível";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("pt-BR");
}

function getLocalBackupActorLabel() {
  const user = getSessionUser();
  return String(user?.email || user?.name || "Navegador local");
}

function loadLocalDraft() {
  try {
    const raw = window.localStorage.getItem(getContFlowLocalDraftKey());
    if (!raw) return null;
    const payload = JSON.parse(raw);
    return payload && typeof payload === "object" ? payload : null;
  } catch (err) {
    console.warn("Erro ao ler rascunho local do ContFlow:", err);
    return null;
  }
}

function loadLocalDraftByIndex(index) {
  try {
    const raw = window.localStorage.getItem(getContFlowLocalDraftKeyByIndex(index));
    if (!raw) return null;
    const payload = JSON.parse(raw);
    return payload && typeof payload === "object" ? payload : null;
  } catch (err) {
    console.warn("Erro ao ler rascunho local trimestral do ContFlow:", err);
    return null;
  }
}

function saveLocalDraft(payload) {
  try {
    window.localStorage.setItem(getContFlowLocalDraftKey(), JSON.stringify(payload));
  } catch (err) {
    console.warn("Erro ao salvar rascunho local do ContFlow:", err);
  }
}

function loadLocalBackups() {
  try {
    const raw = window.localStorage.getItem(getContFlowLocalBackupsKey());
    if (!raw) return [];
    const backups = JSON.parse(raw);
    return Array.isArray(backups) ? backups : [];
  } catch (err) {
    console.warn("Erro ao ler backups locais do ContFlow:", err);
    return [];
  }
}

function saveLocalBackups(backups) {
  try {
    window.localStorage.setItem(
      getContFlowLocalBackupsKey(),
      JSON.stringify(Array.isArray(backups) ? backups.slice(0, 100) : [])
    );
  } catch (err) {
    console.warn("Erro ao salvar backups locais do ContFlow:", err);
  }
}

function createLocalBackupSnapshot(reason = "before_local_save", payload = null) {
  const basePayload = payload && typeof payload === "object" ? payload : buildServerPayload();
  const createdAt = new Date().toISOString();
  const backupId = `local-${createdAt.replace(/[:.]/g, "-")}`;
  const backups = loadLocalBackups();

  backups.unshift({
    backupId,
    createdAt,
    updatedAt: createdAt,
    snapshotVersion: Number(lastSavedPayload?.version || 0),
    reason,
    source: "local",
    actor: {
      email: getLocalBackupActorLabel(),
    },
    snapshot: deepClone(basePayload),
  });

  saveLocalBackups(backups);
  return backups[0];
}

function getBackupReasonLabel(reason) {
  const key = String(reason || "").trim().toLowerCase();
  if (key === "before_update") return "Antes de salvar";
  if (key === "before_restore") return "Antes de restaurar";
  if (key === "before_local_save") return "Backup local";
  if (key === "local_restore_point") return "Antes de restaurar local";
  return key || "Backup";
}

function resetLocalHistoryAfterRestore() {
  undoStack = [];
  redoStack = [];
  selectionAnchor = null;
  lastSelectionBounds = null;
}

function getBackupsPanelElements() {
  return {
    panel: document.getElementById("cf-backups-panel"),
    list: document.getElementById("cf-backups-list"),
    status: document.getElementById("cf-backups-status"),
  };
}

function setBackupsPanelStatus(message = "", tone = "neutral") {
  const { status } = getBackupsPanelElements();
  if (!status) return;
  status.textContent = String(message || "");
  status.classList.toggle("text-danger", tone === "error");
}

function renderBackupsPanel() {
  const { panel, list } = getBackupsPanelElements();
  if (!panel || !list) return;

  list.innerHTML = "";

  if (!cfServerBackups.length) {
    const empty = document.createElement("div");
    empty.className = "cf-backup-empty";
    empty.textContent = "Ainda não existe backup salvo para o ContFlow.";
    list.appendChild(empty);
    return;
  }

  cfServerBackups.forEach((backup) => {
    const card = document.createElement("article");
    card.className = "cf-backup-card";

    const main = document.createElement("div");
    main.className = "cf-backup-card-main";

    const title = document.createElement("div");
    title.className = "cf-backup-card-title";

    const name = document.createElement("strong");
    name.textContent = formatBackupDate(backup.createdAt || backup.updatedAt);

    const reason = document.createElement("span");
    reason.className = "cf-backup-pill";
    reason.textContent = getBackupReasonLabel(backup.reason);

    title.appendChild(name);
    title.appendChild(reason);

    const meta = document.createElement("div");
    meta.className = "cf-backup-card-meta";

    const version = document.createElement("span");
    version.textContent = `Versão ${Number(backup.snapshotVersion || 0)}`;

    const actor = document.createElement("span");
    actor.textContent = backup?.actor?.email
      ? `Por ${backup.actor.email}`
      : "Autor não identificado";

    const file = document.createElement("span");
    file.textContent = String(backup.backupId || "");

    meta.appendChild(version);
    meta.appendChild(actor);
    meta.appendChild(file);

    main.appendChild(title);
    main.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "cf-backup-card-actions";

    const restoreBtn = document.createElement("button");
    restoreBtn.type = "button";
    restoreBtn.className = "cf-btn";
    restoreBtn.textContent = "Restaurar";
    restoreBtn.addEventListener("click", () => {
      handleServerBackupRestore(backup);
    });

    if (String(backup?.source || "").toLowerCase() === "local") {
      const localPill = document.createElement("span");
      localPill.className = "cf-backup-pill";
      localPill.textContent = "Local";
      title.appendChild(localPill);
    }

    actions.appendChild(restoreBtn);
    card.appendChild(main);
    card.appendChild(actions);
    list.appendChild(card);
  });
}

async function refreshBackupsPanel(options = {}) {
  const { panel } = getBackupsPanelElements();
  if (!panel) return;

  if (!options.silent) {
    setBackupsPanelStatus("Carregando backups...");
  }

  try {
    const remoteBackups = await loadServerBackups();
    const localBackups = loadLocalBackups();
    cfServerBackups = [...remoteBackups, ...localBackups].sort((a, b) =>
      String(b.createdAt || b.updatedAt || "").localeCompare(String(a.createdAt || a.updatedAt || ""))
    );
    renderBackupsPanel();
    setBackupsPanelStatus(
      cfServerBackups.length
        ? `${cfServerBackups.length} backup(s) disponível(is).`
        : "Nenhum backup disponível ainda."
    );
  } catch (err) {
    console.error("Erro ao carregar backups do ContFlow:", err);
    cfServerBackups = loadLocalBackups();
    renderBackupsPanel();
    if (cfServerBackups.length) {
      setBackupsPanelStatus("API indisponível. Exibindo backups locais do navegador.");
    } else {
      setBackupsPanelStatus(err?.message || "Erro ao carregar backups.", "error");
    }
  }
}

async function openBackupsPanel() {
  const { panel } = getBackupsPanelElements();
  if (!panel) return;
  openModal();
  panel.hidden = false;
  await refreshBackupsPanel();
}

function closeBackupsPanel() {
  const { panel } = getBackupsPanelElements();
  if (!panel) return;
  panel.hidden = true;
}

async function handleServerBackupRestore(backup) {
  const backupId = String(backup?.backupId || "").trim();
  if (!backupId) return;

  const ok = confirm(
    `Restaurar o ContFlow para o backup de ${formatBackupDate(backup.createdAt || backup.updatedAt)}?\n\nA versão atual será salva automaticamente antes da restauração.`
  );
  if (!ok) return;

  if (String(backup?.source || "").toLowerCase() === "local") {
    try {
      createLocalBackupSnapshot("local_restore_point");
      restoreSnapshot(backup.snapshot || {});
      lastSavedPayload = buildServerPayload();
      saveLocalDraft(lastSavedPayload);
      resetLocalHistoryAfterRestore();
      rebuildViewMap();
      renderTable();
      refreshDirtyVisuals();
      syncPainelTributarioFromContFlow(true);
      await refreshBackupsPanel({ silent: true });
      setBackupsPanelStatus("Backup local restaurado com sucesso.");
      alert("Backup local restaurado ✅");
    } catch (err) {
      console.error("Erro ao restaurar backup local:", err);
      setBackupsPanelStatus(err?.message || "Erro ao restaurar backup local.", "error");
      alert(err?.message || "Erro ao restaurar backup local.");
    }
    return;
  }

  try {
    setBackupsPanelStatus("Restaurando backup...");
    const payload = await restoreServerBackupById(backupId);
    hydrateContFlowFromApiPayload(payload);
    resetLocalHistoryAfterRestore();
    rebuildViewMap();
    renderTable();
    refreshDirtyVisuals();
    syncPainelTributarioFromContFlow(true);
    await refreshBackupsPanel({ silent: true });
    setBackupsPanelStatus("Backup restaurado com sucesso.");
    alert("Backup restaurado ✅");
  } catch (err) {
    console.error("Erro ao restaurar backup:", err);
    setBackupsPanelStatus(err?.message || "Erro ao restaurar backup.", "error");
    alert(err?.message || "Erro ao restaurar backup.");
  }
}

/* ===========================
   Num Quotas
=========================== */
function findColKeyByLabelRegex(re) {
  const col = (CF_COLUMNS || []).find((c) => re.test(normalizeLabel(c.label)));
  return col ? col.key : null;
}

function getNumQuotasKey() {
  return (
    findColKeyByLabelRegex(/\bnum\b.*\bquota\b/) ||
    findColKeyByLabelRegex(/\bquota\b.*\bnum\b/) ||
    "num_quotas"
  );
}

function getQuota1Key() {
  return (
    findColKeyByLabelRegex(/^(1|1o|1º|primeira)\b.*\bquota\b|\bquota\b.*^(1|1o|1º|primeira)\b/) ||
    findColKeyByLabelRegex(/\b1\b.*\bquota\b|\bquota\b.*\b1\b/) ||
    "quota1"
  );
}

function getQuota2Key() {
  return (
    findColKeyByLabelRegex(/^(2|2o|2º|segunda)\b.*\bquota\b|\bquota\b.*^(2|2o|2º|segunda)\b/) ||
    findColKeyByLabelRegex(/\b2\b.*\bquota\b|\bquota\b.*\b2\b/) ||
    "quota2"
  );
}

function getQuota3Key() {
  return (
    findColKeyByLabelRegex(/^(3|3o|3º|terceira)\b.*\bquota\b|\bquota\b.*^(3|3o|3º|terceira)\b/) ||
    findColKeyByLabelRegex(/\b3\b.*\bquota\b|\bquota\b.*\b3\b/) ||
    "quota3"
  );
}

function getMitGenerationKey() {
  return (
    findColKeyByLabelRegex(/^mit\b.*\bgeracao\b|\bgeracao\b.*\bmit\b/) ||
    findColKeyByLabelRegex(/^mit\b$/) ||
    "mit"
  );
}

function getQuotaColumnKey(stage = "") {
  const cleanStage = String(stage || "").trim().toLowerCase();
  if (cleanStage === "quota2") return getQuota2Key();
  if (cleanStage === "quota3") return getQuota3Key();
  return getQuota1Key();
}

function getQuotaValueByStage(row, stage = "") {
  if (!row || typeof row !== "object") return "";
  const realKey = getQuotaColumnKey(stage);
  if (realKey && row[realKey] != null) return row[realKey];
  return row[stage] != null ? row[stage] : "";
}

function normalizeNumQuotas(row) {
  if (!row) return;

  const nqKey = getNumQuotasKey();
  const raw = String(row?.[nqKey] ?? "3").trim();
  const n = Number(raw);
  const num = Number.isFinite(n) ? clamp(n, 1, 3) : 3;
  const quota2Key = getQuota2Key();
  const quota3Key = getQuota3Key();

  row[nqKey] = String(num);

  if (num < 3 && row[quota3Key] != null) row[quota3Key] = "";
  if (num < 2 && row[quota2Key] != null) row[quota2Key] = "";
}

function syncQuotasByNum(row) {
  normalizeNumQuotas(row);
}

function formatDesligamentoDate(value) {
  const digits = String(value ?? "").replace(/\D+/g, "").slice(0, 8);
  if (!digits) return "";

  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function isQuotaColumnKey(colKey) {
  const cleanKey = String(colKey || "").trim();
  return cleanKey === getQuota1Key() || cleanKey === getQuota2Key() || cleanKey === getQuota3Key();
}

function isQuotaPresetColumnKey(colKey) {
  return String(colKey || "").trim() === getQuota1Key();
}

function normalizeQuotaValue(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  const normalized = normalizeLabel(raw);
  if (/^compensacao$/.test(normalized)) return "Compensação";
  if (/^prejuizo$/.test(normalized)) return "Prejuízo";
  if (/^(s m|sm|s\/m)$/.test(normalized)) return "S/M";

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
  }

  return formatDesligamentoDate(raw);
}

function normalizeMitGenerationValue(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  const normalized = normalizeLabel(raw);
  if (normalized === "ok") return "ok";
  if (normalized === "prejuizo") return "prejuizo";
  if (/^(s m|sm|s\/m)$/.test(normalized)) return "s/m";
  if (
    normalized === "entrega manual" ||
    normalized === "manual" ||
    normalized === "entregamanual"
  ) {
    return "entrega manual";
  }

  return raw;
}

function quotaValueToDateInput(value) {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return "";
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function getContFlowRowLabel(row) {
  if (!row || typeof row !== "object") return "Empresa sem identificação";
  return [
    String(row.cod || "").trim(),
    String(row.razao_social || "").trim(),
    String(row.cnpj_cpf || "").trim(),
  ].filter(Boolean).join(" · ") || "Empresa sem identificação";
}

function getContFlowRowSearchText(row) {
  return normalizeLabel([
    row?.cod,
    row?.razao_social,
    row?.cnpj_cpf,
    row?.tipo,
  ].filter(Boolean).join(" "));
}

function getQuotaModalElements() {
  return {
    openBtn: document.getElementById("cf-complete-quota-top"),
    backdrop: document.getElementById("cf-quota-modal-backdrop"),
    modal: document.getElementById("cf-quota-modal"),
    closeBtn: document.getElementById("cf-quota-modal-close"),
    cancelBtn: document.getElementById("cf-quota-cancel"),
    saveBtn: document.getElementById("cf-quota-save"),
    company: document.getElementById("cf-quota-company"),
    search: document.getElementById("cf-quota-search"),
    preview: document.getElementById("cf-quota-preview"),
    stage: document.getElementById("cf-quota-stage"),
    mode: document.getElementById("cf-quota-mode"),
    dateWrap: document.getElementById("cf-quota-date-wrap"),
    date: document.getElementById("cf-quota-date"),
    textWrap: document.getElementById("cf-quota-text-wrap"),
    text: document.getElementById("cf-quota-text"),
    status: document.getElementById("cf-quota-status"),
  };
}

function getQuotaStageLabel(stage) {
  if (stage === "quota2") return "2º quota";
  if (stage === "quota3") return "3º quota";
  return "1º quota";
}

function updateQuotaModalStatus(message, tone = "") {
  const { status } = getQuotaModalElements();
  if (!status) return;
  status.textContent = String(message || "").trim();
  status.setAttribute("data-tone", tone || "");
}

function syncQuotaModalConditionalFields() {
  const { mode, dateWrap, date, textWrap, text } = getQuotaModalElements();
  const currentMode = String(mode?.value || "").trim();
  const showDate = currentMode === "data";
  const showText = currentMode === "outro";

  dateWrap?.classList.toggle("is-hidden", !showDate);
  textWrap?.classList.toggle("is-hidden", !showText);

  if (!showDate && date) date.value = "";
  if (!showText && text) text.value = "";
}

function getQuotaModalInitialDataIndex() {
  const dataIndex = Number(viewMap?.[activeRow]);
  if (Number.isInteger(dataIndex) && cfData[dataIndex]) return dataIndex;
  return cfData.findIndex((row) => row && !isEmptyValue(row.razao_social || row.cod || row.cnpj_cpf));
}

function getQuotaModalRowById(rowId) {
  const cleanId = String(rowId || "").trim();
  if (!cleanId) return null;
  const dataIndex = cfData.findIndex((row) => String(row?.__id || "").trim() === cleanId);
  if (dataIndex < 0) return null;
  return { dataIndex, row: cfData[dataIndex] };
}

function renderQuotaModalCompanies() {
  const { company, search } = getQuotaModalElements();
  if (!company) return;

  const query = normalizeLabel(search?.value || "");
  const currentValue = String(company.value || "").trim();

  const matches = [];
  cfData.forEach((row, dataIndex) => {
    const hasIdentity = !isEmptyValue(row?.razao_social) || !isEmptyValue(row?.cod) || !isEmptyValue(row?.cnpj_cpf);
    if (!hasIdentity) return;
    const haystack = getContFlowRowSearchText(row);
    if (query && !haystack.includes(query)) return;
    matches.push({ dataIndex, row });
  });

  cfQuotaModalState.filteredDataIndexes = matches.map((item) => item.dataIndex);
  company.innerHTML = "";

  if (!matches.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Nenhuma empresa encontrada.";
    company.appendChild(opt);
    company.value = "";
    return;
  }

  matches.forEach(({ row }) => {
    const opt = document.createElement("option");
    opt.value = String(row.__id || "");
    opt.textContent = getContFlowRowLabel(row);
    company.appendChild(opt);
  });

  const preferredValue = matches.some(({ row }) => String(row.__id || "") === currentValue)
    ? currentValue
    : String(matches[0].row.__id || "");
  company.value = preferredValue;
}

function renderQuotaModalPreview() {
  const { preview, company, stage } = getQuotaModalElements();
  if (!preview) return;

  const selected = getQuotaModalRowById(company?.value || "");
  if (!selected?.row) {
    preview.innerHTML = "Selecione uma empresa para ver as quotas atuais.";
    return;
  }

  const currentStage = String(stage?.value || "quota1").trim() || "quota1";
  const row = selected.row;
  const quotaItems = [
    { key: "quota1", label: "1º quota", value: String(getQuotaValueByStage(row, "quota1") || "").trim() || "—" },
    { key: "quota2", label: "2º quota", value: String(getQuotaValueByStage(row, "quota2") || "").trim() || "—" },
    { key: "quota3", label: "3º quota", value: String(getQuotaValueByStage(row, "quota3") || "").trim() || "—" },
  ];

  preview.innerHTML = `
    <strong>${escapeHTML(getContFlowRowLabel(row))}</strong>
    <span>Trimestre ativo: ${escapeHTML(getActiveContFlowSheetDef().label)}</span>
    <div class="cf-quota-preview-list">
      ${quotaItems.map((item) => `
        <div class="cf-quota-preview-item${item.key === currentStage ? " is-active" : ""}">
          <strong>${escapeHTML(item.label)}</strong>
          <span>${escapeHTML(item.value)}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function getQuotaModalCompletionValue() {
  const { mode, date, text } = getQuotaModalElements();
  const currentMode = String(mode?.value || "").trim();

  if (currentMode === "compensacao") return "Compensação";
  if (currentMode === "prejuizo") return "Prejuízo";
  if (currentMode === "sm") return "S/M";
  if (currentMode === "data") {
    const normalized = normalizeQuotaValue(String(date?.value || "").trim());
    if (!normalized) throw new Error("Escolha uma data válida para concluir a quota.");
    return normalized;
  }

  const customValue = String(text?.value || "").trim();
  if (!customValue) throw new Error("Digite como deseja concluir a quota.");
  return normalizeQuotaValue(customValue);
}

function openQuotaCompletionModal() {
  const els = getQuotaModalElements();
  if (!els.backdrop || !els.modal) return;

  cfQuotaModalState.open = true;
  els.backdrop.classList.add("is-open");
  els.modal.classList.add("is-open");
  if (els.search) els.search.value = "";
  if (els.date) els.date.value = "";
  if (els.text) els.text.value = "";
  if (els.stage) els.stage.value = "quota1";
  if (els.mode) els.mode.value = "compensacao";
  syncQuotaModalConditionalFields();
  renderQuotaModalCompanies();

  const initialIndex = getQuotaModalInitialDataIndex();
  if (initialIndex >= 0 && cfData[initialIndex]) {
    els.company.value = String(cfData[initialIndex].__id || "");
  }

  renderQuotaModalPreview();
  updateQuotaModalStatus("Escolha a quota e a forma de conclusão para salvar nesta planilha.", "");
  setTimeout(() => {
    els.search?.focus();
  }, 0);
}

function closeQuotaCompletionModal() {
  const els = getQuotaModalElements();
  cfQuotaModalState.open = false;
  els.backdrop?.classList.remove("is-open");
  els.modal?.classList.remove("is-open");
  updateQuotaModalStatus("", "");
}

async function saveQuotaCompletionFromModal() {
  if (cfQuotaModalState.saving) return;

  const els = getQuotaModalElements();
  const selected = getQuotaModalRowById(els.company?.value || "");
  const stage = String(els.stage?.value || "quota1").trim() || "quota1";

  if (!selected?.row) {
    updateQuotaModalStatus("Escolha uma empresa antes de salvar.", "danger");
    return;
  }

  let finalValue = "";
  try {
    finalValue = getQuotaModalCompletionValue();
  } catch (err) {
    updateQuotaModalStatus(err?.message || "Revise os dados antes de salvar.", "danger");
    return;
  }

  const { dataIndex, row } = selected;
  const rowId = String(row.__id || "").trim();
  const stageKey = getQuotaColumnKey(stage);
  const before = String(getQuotaValueByStage(row, stage) ?? "");
  const after = normalizeCellValue(stageKey, finalValue);
  const quotaColIndex = CF_COLUMNS.findIndex((col) => col.key === stageKey);

  if (!rowId) {
    updateQuotaModalStatus("A linha selecionada não tem identificador válido.", "danger");
    return;
  }

  if (!stageKey) {
    updateQuotaModalStatus("A coluna da quota selecionada não foi encontrada nesta base.", "danger");
    return;
  }

  if (before === after) {
    updateQuotaModalStatus("Essa quota já está com esse mesmo valor.", "danger");
    return;
  }

  cfQuotaModalState.saving = true;
  if (els.saveBtn) els.saveBtn.disabled = true;
  updateQuotaModalStatus(`Salvando ${getQuotaStageLabel(stage)}...`, "");

  try {
    if (editing) commitEdit();
    const currentViewRow = viewMap.findIndex((idx) => idx === dataIndex);

    row[stageKey] = after;
    if (stageKey !== stage) row[stage] = after;
    pushUndo({ type: "cell", dataIndex, colKey: stageKey, before, after });
    markCellDirty(dataIndex, stageKey);
    syncPainelTributarioAfterContFlowChange([{ dataIndex, colKey: stageKey }]);
    refreshDirtyVisuals();

    cacheActiveQuarterState();
    if (quotaColIndex >= 0 && currentViewRow >= 0) {
      syncRenderedCellValue(currentViewRow, quotaColIndex, stageKey, after);
    } else {
      rebuildViewMap();
      renderTable({ suppressCellFocus: true });
      refreshDirtyVisuals();
    }

    const refreshedDataIndex = cfData.findIndex((item) => String(item?.__id || "").trim() === rowId);
    const refreshedViewRow = refreshedDataIndex >= 0 ? viewMap.findIndex((idx) => idx === refreshedDataIndex) : -1;

    closeQuotaCompletionModal();

    if (refreshedViewRow >= 0 && quotaColIndex >= 0) {
      setSingleActiveCell(refreshedViewRow, quotaColIndex);
    }

    await saveDirtyCells(true);
    cacheActiveQuarterState();

    const persistedDataIndex = cfData.findIndex((item) => String(item?.__id || "").trim() === rowId);
    const persistedViewRow = persistedDataIndex >= 0 ? viewMap.findIndex((idx) => idx === persistedDataIndex) : -1;
    if (persistedViewRow >= 0 && quotaColIndex >= 0) {
      setSingleActiveCell(persistedViewRow, quotaColIndex);
    }
  } catch (err) {
    console.error("Erro ao concluir quota pelo modal do ContFlow:", err);
    alert(err?.message || "Não foi possível salvar a quota agora.");
  } finally {
    cfQuotaModalState.saving = false;
    if (els.saveBtn) els.saveBtn.disabled = false;
  }
}

function bindQuotaCompletionModal() {
  const els = getQuotaModalElements();
  if (!els.openBtn || !els.modal || !els.backdrop) return;

  if (!els.openBtn.dataset.boundQuotaModal) {
    els.openBtn.dataset.boundQuotaModal = "1";
    els.openBtn.addEventListener("click", openQuotaCompletionModal);
  }

  [els.closeBtn, els.cancelBtn].forEach((btn) => {
    if (!btn || btn.dataset.boundQuotaModal) return;
    btn.dataset.boundQuotaModal = "1";
    btn.addEventListener("click", closeQuotaCompletionModal);
  });

  if (!els.backdrop.dataset.boundQuotaModal) {
    els.backdrop.dataset.boundQuotaModal = "1";
    els.backdrop.addEventListener("click", closeQuotaCompletionModal);
  }

  if (els.search && !els.search.dataset.boundQuotaModal) {
    els.search.dataset.boundQuotaModal = "1";
    els.search.addEventListener("input", () => {
      renderQuotaModalCompanies();
      renderQuotaModalPreview();
    });
  }

  if (els.company && !els.company.dataset.boundQuotaModal) {
    els.company.dataset.boundQuotaModal = "1";
    els.company.addEventListener("change", renderQuotaModalPreview);
  }

  if (els.stage && !els.stage.dataset.boundQuotaModal) {
    els.stage.dataset.boundQuotaModal = "1";
    els.stage.addEventListener("change", renderQuotaModalPreview);
  }

  if (els.mode && !els.mode.dataset.boundQuotaModal) {
    els.mode.dataset.boundQuotaModal = "1";
    els.mode.addEventListener("change", syncQuotaModalConditionalFields);
  }

  if (els.saveBtn && !els.saveBtn.dataset.boundQuotaModal) {
    els.saveBtn.dataset.boundQuotaModal = "1";
    els.saveBtn.addEventListener("click", async () => {
      await saveQuotaCompletionFromModal();
    });
  }
}

function normalizeCellValue(colKey, value) {
  const raw = String(value ?? "");
  if (colKey === "desligamento") return formatDesligamentoDate(raw);
  if (isQuotaColumnKey(colKey)) return normalizeQuotaValue(raw);
  if (isMitGenerationColumnKey(colKey)) return normalizeMitGenerationValue(raw);
  return raw;
}

function createEmptyRow() {
  const row = {};
  CF_COLUMNS.forEach((col) => (row[col.key] = ""));

  const nqKey = getNumQuotasKey();
  if (row[nqKey] != null && String(row[nqKey]).trim() === "") row[nqKey] = "3";

  normalizeNumQuotas(row);

  row.__id = row.__id || genId();
  return row;
}

function coerceRowsToCurrentColumns(rows) {
  const nqKey = getNumQuotasKey();

  return (rows || []).map((r) => {
    const row = {};

    CF_COLUMNS.forEach((c) => {
      const v = r && r[c.key] != null ? r[c.key] : "";
      row[c.key] = normalizeCellValue(c.key, v);
    });

    if (row[nqKey] != null && String(row[nqKey]).trim() === "") {
      row[nqKey] = "3";
    }

    row.__id = r && r.__id ? r.__id : genId();

    normalizeNumQuotas(row);
    return row;
  });
}

function isEmptyValue(v) {
  if (v == null) return true;
  const s = String(v).trim().toLowerCase();
  return s === "" || s === "null" || s === "undefined" || s === "-";
}

function isEmptyCell(rowOrIndex, colKey) {
  if (rowOrIndex == null) return true;
  if (typeof rowOrIndex === "number") {
    const row = cfData[rowOrIndex];
    if (!row) return true;
    return isEmptyValue(row[colKey]);
  }
  return isEmptyValue(rowOrIndex[colKey]);
}

function isFilterActive(f) {
  if (!f) return false;
  if (f.mode === "empty" || f.mode === "not_empty") return true;
  if (f.mode === "in") return Array.isArray(f.values);
  return String(f.value || "").trim() !== "";
}

/* ===========================
   SAVE
=========================== */
function scheduleAutoSave() {
  if (autoSaveTimeout) clearTimeout(autoSaveTimeout);
  autoSaveTimeout = null;
}

function flushSaveNow() {
  try {
    if (editing) commitEdit();
  } catch (_) {}
  return Promise.resolve();
}

async function saveDirtyCells(silent = false) {
  try {
    if (editing) commitEdit();

    if (!dirtyCells.size && !hasStructuralChanges) {
      if (!silent) alert("Não há células pendentes para salvar.");
      return;
    }

    if (hasStructuralChanges) {
      if (hasOnlyBootstrapStructuralChanges() && canManageContFlowBase(getSessionUser())) {
        await saveBase(silent, { mode: "cells" });
        return;
      }

      if (!silent) {
        alert(getStructuralSaveMessage());
      }
      return;
    }

    const changes = buildDirtyCellPayload();
    if (!changes.length) {
      if (!silent) alert("Não há células válidas pendentes para salvar.");
      return;
    }

    const prev = lastSavedPayload ? deepClone(lastSavedPayload) : null;
    const responsePayload = await persistDirtyCellsToApi(changes);

    if (responsePayload && typeof responsePayload === "object") {
      hydrateContFlowFromApiPayload(responsePayload);
      rebuildViewMap();
      renderTable();
      refreshDirtyVisuals();
      syncPainelTributarioFromContFlow(true, { persist: true });
      saveLocalDraft(buildServerPayload());
    }

    const nextPayload = buildServerPayload();
    const delta = computeDelta(prev, nextPayload);

    publishContFlowUpdate({
      ts: new Date().toISOString(),
      kind: "contflow_update",
      saveMode: "cells",
      summary: {
        added: delta.added.length,
        changed: delta.changed.length,
        removed: delta.removed.length,
      },
      delta: {
        added: delta.added.slice(0, 60),
        changed: delta.changed.slice(0, 60),
        removed: delta.removed.slice(0, 60),
      },
    });

    if (!silent) {
      alert("Células pendentes salvas ✅");
    }
  } catch (err) {
    console.error("Erro ao salvar células:", err);
    if (Number(err?.status) === 409 && err?.payload?.current) {
      try {
        hydrateContFlowFromApiPayload(err.payload.current);
        rebuildViewMap();
        renderTable();
        refreshDirtyVisuals();
      } catch (hydrateErr) {
        console.error("Erro ao hidratar conflito de células:", hydrateErr);
      }

      if (!silent) {
        alert("Outra pessoa alterou uma ou mais células antes de você. A base foi recarregada com a versão mais recente.");
      }
      throw err;
    }

    if (!silent) alert("Erro ao salvar células.");
    throw err;
  }
}

/* ===========================
   VIEW MAP
=========================== */
function passesFilters(row) {
  const search = normalizeSearchText(globalSearch);
  if (search) {
    const rowText = normalizeSearchText(
      CF_COLUMNS.map((col) => row?.[col.key] ?? "").join(" ")
    );
    if (!rowText.includes(search)) return false;
  }

  for (const colKey of Object.keys(filters)) {
    const f = filters[colKey];
    if (!isFilterActive(f)) continue;

    const cellRaw = row[colKey] ?? "";
    const cell = String(cellRaw);
    const a = normalizeSearchText(cell);

    if (f.mode === "equals") {
      const b = normalizeSearchText(f.value);
      if (a !== b) return false;
    } else if (f.mode === "starts") {
      const b = normalizeSearchText(f.value);
      if (!a.startsWith(b)) return false;
    } else if (f.mode === "empty") {
      if (a !== "") return false;
    } else if (f.mode === "not_empty") {
      if (a === "") return false;
    } else if (f.mode === "in") {
      const set = new Set((f.values || []).map((x) => String(x ?? "").trim()));
      if (!set.has(String(cellRaw ?? "").trim())) return false;
    } else {
      const b = normalizeSearchText(f.value);
      if (!a.includes(b)) return false;
    }
  }
  return true;
}

function compareValues(a, b) {
  const aa = String(a ?? "").trim();
  const bb = String(b ?? "").trim();

  const na = Number(aa.replace(",", "."));
  const nb = Number(bb.replace(",", "."));
  const bothNum = Number.isFinite(na) && Number.isFinite(nb) && aa !== "" && bb !== "";
  if (bothNum) return na - nb;

  return aa.localeCompare(bb, "pt-BR", { numeric: true, sensitivity: "base" });
}

function rebuildViewMap() {
  const idx = [];
  for (let i = 0; i < cfData.length; i++) {
    if (passesFilters(cfData[i])) idx.push(i);
  }

  if (sortState && sortState.colKey && sortState.dir) {
    const { colKey, dir } = sortState;
    idx.sort((i1, i2) => compareValues(cfData[i1][colKey], cfData[i2][colKey]) * dir);
  }

  viewMap = idx;
  if (!cfData.length) viewMap = [];
}

/* ===========================
   UNDO / REDO
=========================== */
function pushUndo(action) {
  undoStack.push(action);
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack = [];
}

function snapshotState() {
  return {
    columns: deepClone(CF_COLUMNS),
    data: deepClone(cfData),
    sort: deepClone(sortState),
    filters: deepClone(filters),
    colWidths: deepClone(colWidths),
  };
}

function restoreSnapshot(snap) {
  CF_COLUMNS = ensureUniqueKeys((snap.columns || []).map((c) => ({ key: c.key, label: c.label })));
  cfData = coerceRowsToCurrentColumns((snap.data || []).map((r) => r));
  cfData.forEach((r, i) => (r.__id = (snap.data?.[i] && snap.data[i].__id) || r.__id || genId()));

  sortState = snap.sort || null;
  filters = snap.filters || {};
  colWidths = snap.colWidths || {};
}

function applyUndoRedo(action, dir) {
  if (action.type === "cell") {
    const { dataIndex, colKey, before, after } = action;
    if (cfData[dataIndex]) {
      cfData[dataIndex][colKey] = dir < 0 ? before : after;
      markCellDirty(dataIndex, colKey);
    }
  } else if (action.type === "batch") {
    const { changes } = action;
    (changes || []).forEach((c) => {
      if (!cfData[c.dataIndex]) return;
      cfData[c.dataIndex][c.colKey] = dir < 0 ? c.before : c.after;
      markCellDirty(c.dataIndex, c.colKey);
    });
  } else if (action.type === "rows_insert") {
    const { at, rows } = action;
    if (dir < 0) {
      cfData.splice(at, rows.length);
    } else {
      cfData.splice(at, 0, ...deepClone(rows));
    }
    markStructureDirty();
  } else if (action.type === "rows_delete") {
    const { at, rows } = action;
    if (dir < 0) {
      cfData.splice(at, 0, ...deepClone(rows));
    } else {
      cfData.splice(at, rows.length);
    }
    markStructureDirty();
  } else if (action.type === "snapshot") {
    const { before, after } = action;
    restoreSnapshot(dir < 0 ? before : after);
    markStructureDirty();
  }

  rebuildViewMap();
  renderTable();
}

function undo() {
  if (editing) commitEdit();
  const a = undoStack.pop();
  if (!a) return;
  redoStack.push(a);
  applyUndoRedo(a, -1);
}

function redo() {
  if (editing) commitEdit();
  const a = redoStack.pop();
  if (!a) return;
  undoStack.push(a);
  applyUndoRedo(a, +1);
}

/* ===========================
   VERSÕES
=========================== */
function loadVersions() {
  return Array.isArray(cfVersions) ? cfVersions : [];
}

function saveVersions(arr) {
  cfVersions = Array.isArray(arr) ? arr.slice(0, MAX_VERSIONS) : [];
  markConfigDirty();
}

function saveVersion() {
  saveBase(false, { mode: "manual_backup_save" }).catch((err) => {
    console.error("Erro ao salvar base pelo atalho de versão:", err);
  });
}

function restoreVersion() {
  openBackupsPanel().catch((err) => {
    console.error("Erro ao abrir histórico de backups:", err);
  });
}

/* ===========================
   COLUNAS
=========================== */
function setDefaultWidthForCol(colKey) {
  if (colWidths[colKey] != null) return;

  if (colKey === "cod") colWidths[colKey] = 70;
  else if (colKey === "razao_social") colWidths[colKey] = 240;
  else if (colKey === "cnpj_cpf") colWidths[colKey] = 150;
  else if (colKey === "trib") colWidths[colKey] = 160;
  else if (colKey === "grupo") colWidths[colKey] = 140;
  else if (colKey === "resp1") colWidths[colKey] = 140;
  else if (colKey === "resp2") colWidths[colKey] = 120;
  else if (colKey === "resp3") colWidths[colKey] = 120;
  else if (colKey === "tipo") colWidths[colKey] = 110;
  else if (colKey === "num_quotas") colWidths[colKey] = 110;
  else if (colKey === "quota1") colWidths[colKey] = 180;
  else if (colKey === "quota2") colWidths[colKey] = 180;
  else if (colKey === "quota3") colWidths[colKey] = 180;
  else if (colKey === "obs") colWidths[colKey] = 220;
  else if (colKey === getMitGenerationKey()) colWidths[colKey] = 160;
  else if (colKey === "controle_mit") colWidths[colKey] = 220;
  else if (colKey === "inconsistencia_athenas") colWidths[colKey] = 240;
  else colWidths[colKey] = 140;
}

function unionColumnsByLabel(currentCols, newCols) {
  const cur = (currentCols || []).map((c) => ({ key: c.key, label: c.label }));
  const nxt = (newCols || []).map((c) => ({ key: c.key, label: c.label }));

  const map = new Map();
  const out = [];

  cur.forEach((c) => {
    const nl = normalizeLabel(c.label);
    if (!map.has(nl)) {
      map.set(nl, c);
      out.push(c);
    }
  });

  nxt.forEach((c) => {
    const nl = normalizeLabel(c.label);
    if (!map.has(nl)) {
      map.set(nl, c);
      out.push(c);
    }
  });

  const ensured = ensureUniqueKeys(out);
  ensured.forEach((c) => setDefaultWidthForCol(c.key));
  return ensured;
}

function addColumnAfter(colIndex, label) {
  const before = snapshotState();

  const name = String(label || "").trim() || `Coluna ${CF_COLUMNS.length + 1}`;
  const keyBase = slugKeyFromLabel(name);
  const cols = CF_COLUMNS.slice();
  cols.splice(colIndex + 1, 0, { key: keyBase, label: name });
  CF_COLUMNS = ensureUniqueKeys(cols);

  CF_COLUMNS.forEach((c) => setDefaultWidthForCol(c.key));
  cfData = coerceRowsToCurrentColumns(cfData);

  const after = snapshotState();
  pushUndo({ type: "snapshot", before, after });
  markStructureDirty();

  rebuildViewMap();
  renderTable();
}

function renameColumn(colIndex, newLabel) {
  if (colIndex < 0 || colIndex >= CF_COLUMNS.length) return;
  const before = snapshotState();

  const label = String(newLabel || "").trim();
  if (!label) return;

  CF_COLUMNS[colIndex].label = label;

  const after = snapshotState();
  pushUndo({ type: "snapshot", before, after });
  markStructureDirty();

  renderTable();
}

function deleteColumn(colIndex) {
  if (CF_COLUMNS.length <= 1) return alert("Não é possível excluir a última coluna.");
  if (colIndex < 0 || colIndex >= CF_COLUMNS.length) return;

  const col = CF_COLUMNS[colIndex];
  const ok = confirm(`Excluir coluna "${col.label}"? (isso remove os dados dessa coluna)`);
  if (!ok) return;

  const before = snapshotState();

  CF_COLUMNS.splice(colIndex, 1);
  cfData.forEach((r) => delete r[col.key]);
  delete colWidths[col.key];

  cfData = coerceRowsToCurrentColumns(cfData);

  const after = snapshotState();
  pushUndo({ type: "snapshot", before, after });
  markStructureDirty();

  activeCol = clamp(activeCol, 0, CF_COLUMNS.length - 1);
  rebuildViewMap();
  renderTable();
}

function moveColumn(fromIndex, toIndex) {
  if (fromIndex === toIndex) return;
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= CF_COLUMNS.length || toIndex >= CF_COLUMNS.length) return;

  const before = snapshotState();

  const cols = CF_COLUMNS.slice();
  const [col] = cols.splice(fromIndex, 1);
  cols.splice(toIndex, 0, col);
  CF_COLUMNS = cols;

  const after = snapshotState();
  pushUndo({ type: "snapshot", before, after });
  markStructureDirty();

  activeCol = clamp(toIndex, 0, CF_COLUMNS.length - 1);
  renderTable();
}

/* ===========================
   FILTRO / SORT
=========================== */
function cycleSort(colKey) {
  if (!sortState || sortState.colKey !== colKey) sortState = { colKey, dir: 1 };
  else if (sortState.dir === 1) sortState.dir = -1;
  else sortState = null;

  rebuildViewMap();
  renderTable();
  markConfigDirty();
}

function promptFilter(colKey, label) {
  const current = filters[colKey];
  const help =
    `Filtro da coluna "${label}"\n\n` +
    `Digite:\n` +
    `- texto (contém)\n` +
    `- =valor (igual)\n` +
    `- ^valor (começa com)\n` +
    `- (vazio) => digite: vazio\n` +
    `- (não vazio) => digite: nao_vazio\n\n` +
    `Deixe em branco para limpar.`;

  const raw = prompt(help, current ? current.raw || current.value || "" : "");
  if (raw === null) return;

  const v = String(raw).trim();
  if (!v) {
    delete filters[colKey];
  } else {
    let mode = "contains";
    let value = v;

    if (v.toLowerCase() === "vazio") {
      mode = "empty";
      value = "";
    } else if (v.toLowerCase() === "nao_vazio") {
      mode = "not_empty";
      value = "";
    } else if (v.startsWith("=")) {
      mode = "equals";
      value = v.slice(1);
    } else if (v.startsWith("^")) {
      mode = "starts";
      value = v.slice(1);
    }
    filters[colKey] = { mode, value, raw: v };
  }

  rebuildViewMap();
  renderTable();
  markConfigDirty();
}

function clearAllFilters() {
  filters = {};
  globalSearch = "";
  const searchInput = document.getElementById("cf-global-search");
  if (searchInput) searchInput.value = "";
  rebuildViewMap();
  renderTable();
  markConfigDirty();
}

/* ===========================
   FILTER DROPDOWN
=========================== */
let cfFilterDD = null;

function ensureFilterDropdown() {
  if (cfFilterDD) return cfFilterDD;

  cfFilterDD = document.createElement("div");
  cfFilterDD.id = "cf-filter-dd";
  cfFilterDD.style.position = "fixed";
  cfFilterDD.style.zIndex = "10000";
  cfFilterDD.style.minWidth = "280px";
  cfFilterDD.style.maxWidth = "360px";
  cfFilterDD.style.maxHeight = "520px";
  cfFilterDD.style.overflow = "hidden";
  cfFilterDD.style.overscrollBehavior = "contain";
  cfFilterDD.style.display = "none";
  cfFilterDD.style.background = "rgba(2,6,23,0.98)";
  cfFilterDD.style.border = "1px solid rgba(255,255,255,0.12)";
  cfFilterDD.style.borderRadius = "14px";
  cfFilterDD.style.boxShadow = "0 18px 50px rgba(0,0,0,.55)";

  document.body.appendChild(cfFilterDD);

  document.addEventListener("mousedown", (e) => {
    if (!cfFilterDD || cfFilterDD.style.display === "none") return;
    if (cfFilterDD.contains(e.target)) return;
    hideFilterDropdown();
  });

  document.addEventListener(
    "scroll",
    (e) => {
      if (!cfFilterDD || cfFilterDD.style.display === "none") return;
      if (cfFilterDD.contains(e.target)) return;
      scheduleFilterDropdownPosition();
    },
    true
  );

  window.addEventListener("resize", () => {
    if (!cfFilterDD || cfFilterDD.style.display === "none") return;
    scheduleFilterDropdownPosition();
  });

  return cfFilterDD;
}

function positionFilterDropdown(anchorEl = cfFilterAnchorEl) {
  if (!cfFilterDD || cfFilterDD.style.display === "none") return;
  if (!anchorEl || !anchorEl.isConnected) {
    hideFilterDropdown();
    return;
  }

  const viewportPadding = 8;
  const gap = 6;
  const rect = anchorEl.getBoundingClientRect();
  const menuWidth = Math.max(cfFilterDD.offsetWidth || 320, 280);
  const menuHeight = Math.max(cfFilterDD.offsetHeight || 0, 240);

  const maxLeft = Math.max(viewportPadding, window.innerWidth - menuWidth - viewportPadding);
  const left = clamp(rect.left, viewportPadding, maxLeft);

  const belowTop = rect.bottom + gap;
  const aboveTop = rect.top - menuHeight - gap;
  const fitsBelow = belowTop + menuHeight <= window.innerHeight - viewportPadding;
  const fitsAbove = aboveTop >= viewportPadding;

  let top = belowTop;
  if (!fitsBelow && fitsAbove) top = aboveTop;
  else if (!fitsBelow) {
    top = clamp(belowTop, viewportPadding, Math.max(viewportPadding, window.innerHeight - menuHeight - viewportPadding));
  }

  cfFilterDD.style.left = `${left}px`;
  cfFilterDD.style.top = `${top}px`;
}

function scheduleFilterDropdownPosition() {
  if (cfFilterPositionRaf != null) cancelAnimationFrame(cfFilterPositionRaf);
  cfFilterPositionRaf = requestAnimationFrame(() => {
    cfFilterPositionRaf = null;
    positionFilterDropdown();
  });
}

function hideFilterDropdown() {
  if (!cfFilterDD) return;
  cfFilterAnchorEl = null;
  if (cfFilterPositionRaf != null) {
    cancelAnimationFrame(cfFilterPositionRaf);
    cfFilterPositionRaf = null;
  }
  cfFilterDD.style.display = "none";
  cfFilterDD.innerHTML = "";
}

function buildUniqueValuesForColumn(colKey) {
  const saved = filters[colKey];
  delete filters[colKey];

  const baseIdx = [];
  for (let i = 0; i < cfData.length; i++) if (passesFilters(cfData[i])) baseIdx.push(i);

  if (saved) filters[colKey] = saved;

  const set = new Set();
  for (const di of baseIdx) set.add(String(cfData[di]?.[colKey] ?? "").trim());

  const arr = Array.from(set);
  arr.sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" }));
  return arr;
}

function openFilterDropdownForHeader(thEl, colIndex) {
  const col = CF_COLUMNS[colIndex];
  if (!col) return;

  const menu = ensureFilterDropdown();
  cfFilterAnchorEl = thEl;
  menu.innerHTML = "";

  menu.addEventListener("keydown", (ev) => ev.stopPropagation(), true);
  menu.addEventListener("keypress", (ev) => ev.stopPropagation(), true);
  menu.addEventListener("keyup", (ev) => ev.stopPropagation(), true);

  const colKey = col.key;
  const colLabel = col.label;

  menu.style.display = "flex";
  menu.style.flexDirection = "column";
  menu.style.maxHeight = "520px";
  menu.style.overflow = "hidden";
  menu.style.overscrollBehavior = "contain";

  const header = document.createElement("div");
  header.style.padding = "10px 12px";
  header.style.borderBottom = "1px solid rgba(255,255,255,.10)";
  header.style.display = "flex";
  header.style.alignItems = "center";
  header.style.justifyContent = "space-between";

  const hTitle = document.createElement("div");
  hTitle.textContent = `Filtro • ${colLabel}`;
  hTitle.style.fontWeight = "700";
  hTitle.style.color = "#e8edf6";
  hTitle.style.fontSize = "13px";
  hTitle.style.maxWidth = "280px";
  hTitle.style.overflow = "hidden";
  hTitle.style.textOverflow = "ellipsis";
  hTitle.style.whiteSpace = "nowrap";

  const btnX = document.createElement("button");
  btnX.type = "button";
  btnX.textContent = "✕";
  btnX.style.border = "0";
  btnX.style.background = "transparent";
  btnX.style.color = "rgba(232,237,246,.85)";
  btnX.style.cursor = "pointer";
  btnX.onclick = () => hideFilterDropdown();

  header.appendChild(hTitle);
  header.appendChild(btnX);
  menu.appendChild(header);

  const body = document.createElement("div");
  body.style.padding = "10px 12px 12px 12px";
  body.style.display = "grid";
  body.style.gap = "10px";
  body.style.overflow = "auto";
  body.style.overscrollBehavior = "contain";
  body.style.flex = "1 1 auto";
  menu.appendChild(body);

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Pesquisar valores…";
  input.style.height = "34px";
  input.style.borderRadius = "10px";
  input.style.border = "1px solid rgba(255,255,255,.14)";
  input.style.background = "rgba(255,255,255,.06)";
  input.style.color = "#e8edf6";
  input.style.padding = "0 10px";
  input.style.outline = "none";
  body.appendChild(input);

  const quick = document.createElement("div");
  quick.style.display = "flex";
  quick.style.gap = "8px";
  quick.style.flexWrap = "wrap";
  body.appendChild(quick);

  function mkQuickBtn(label, fn) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.style.border = "1px solid rgba(255,255,255,.14)";
    b.style.background = "rgba(255,255,255,.06)";
    b.style.color = "#e8edf6";
    b.style.cursor = "pointer";
    b.style.padding = "6px 10px";
    b.style.borderRadius = "10px";
    b.onclick = fn;
    return b;
  }

  const values = buildUniqueValuesForColumn(colKey);

  const existing = filters[colKey];
  let selected = new Set(values);

  if (existing && existing.mode === "in" && Array.isArray(existing.values)) {
    selected = new Set(existing.values.map((x) => String(x ?? "").trim()));
  } else if (existing && existing.mode === "empty") {
    selected = new Set(["__ONLY_EMPTY__"]);
  } else if (existing && existing.mode === "not_empty") {
    selected = new Set(["__ONLY_NOT_EMPTY__"]);
  }

  const btnEmpty = mkQuickBtn("Somente vazios", () => {
    selected = new Set(["__ONLY_EMPTY__"]);
    cbAll.checked = false;
    renderChecklist(input.value);
  });

  const btnNotEmpty = mkQuickBtn("Somente não vazios", () => {
    selected = new Set(["__ONLY_NOT_EMPTY__"]);
    cbAll.checked = false;
    renderChecklist(input.value);
  });

  const btnClear = mkQuickBtn("Limpar filtro", () => {
    selected = new Set(values);
    cbAll.checked = values.length > 0;
    renderChecklist(input.value);
  });

  quick.appendChild(btnEmpty);
  quick.appendChild(btnNotEmpty);
  quick.appendChild(btnClear);

  const rowAll = document.createElement("label");
  rowAll.style.display = "flex";
  rowAll.style.alignItems = "center";
  rowAll.style.gap = "8px";
  rowAll.style.color = "rgba(232,237,246,.92)";
  rowAll.style.fontSize = "13px";

  const cbAll = document.createElement("input");
  cbAll.type = "checkbox";

  const isSpecial = selected.has("__ONLY_EMPTY__") || selected.has("__ONLY_NOT_EMPTY__");
  cbAll.checked = !isSpecial && selected.size === values.length && values.length > 0;

  const spAll = document.createElement("span");
  spAll.textContent = "Selecionar tudo";

  rowAll.appendChild(cbAll);
  rowAll.appendChild(spAll);
  body.appendChild(rowAll);

  const scroller = document.createElement("div");
  scroller.style.border = "1px solid rgba(255,255,255,.10)";
  scroller.style.borderRadius = "12px";
  scroller.style.padding = "8px";
  scroller.style.maxHeight = "260px";
  scroller.style.overflow = "auto";
  scroller.style.overscrollBehavior = "contain";
  scroller.style.background = "rgba(255,255,255,.03)";
  body.appendChild(scroller);

  function renderChecklist(filterText) {
    const q = String(filterText || "").trim().toLowerCase();
    scroller.innerHTML = "";

    const specialEmpty = selected.has("__ONLY_EMPTY__");
    const specialNotEmpty = selected.has("__ONLY_NOT_EMPTY__");
    const specialMode = specialEmpty || specialNotEmpty;

    const show = values.filter((v) => String(v).toLowerCase().includes(q));

    show.forEach((v) => {
      const line = document.createElement("label");
      line.style.display = "flex";
      line.style.alignItems = "center";
      line.style.gap = "8px";
      line.style.padding = "6px 6px";
      line.style.borderRadius = "10px";
      line.style.color = "rgba(232,237,246,.92)";
      line.style.cursor = specialMode ? "not-allowed" : "pointer";
      line.style.opacity = specialMode ? "0.6" : "1";

      line.onmouseenter = () => (line.style.background = "rgba(255,255,255,.06)");
      line.onmouseleave = () => (line.style.background = "transparent");

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.disabled = specialMode;
      cb.checked = !specialMode && selected.has(v);

      cb.onchange = () => {
        if (cb.checked) selected.add(v);
        else selected.delete(v);
        cbAll.checked = selected.size === values.length && values.length > 0;
      };

      const label = document.createElement("span");
      label.style.flex = "1";
      label.style.whiteSpace = "nowrap";
      label.style.overflow = "hidden";
      label.style.textOverflow = "ellipsis";
      label.textContent = v === "" ? "(vazio)" : v;

      line.appendChild(cb);
      line.appendChild(label);
      scroller.appendChild(line);
    });

    if (!show.length) {
      const empty = document.createElement("div");
      empty.style.color = "rgba(232,237,246,.65)";
      empty.style.fontSize = "12px";
      empty.style.padding = "10px 6px";
      empty.textContent = "Nenhum valor encontrado.";
      scroller.appendChild(empty);
    }
  }

  cbAll.onchange = () => {
    if (selected.has("__ONLY_EMPTY__") || selected.has("__ONLY_NOT_EMPTY__")) return;
    selected = cbAll.checked ? new Set(values) : new Set();
    renderChecklist(input.value);
  };

  input.addEventListener("input", () => renderChecklist(input.value));
  renderChecklist("");

  const footer = document.createElement("div");
  footer.style.borderTop = "1px solid rgba(255,255,255,.10)";
  footer.style.padding = "10px 12px";
  footer.style.flex = "0 0 auto";
  footer.style.background = "rgba(2,6,23,0.98)";

  const btnConfirm = document.createElement("button");
  btnConfirm.type = "button";
  btnConfirm.textContent = "Confirmar";
  btnConfirm.style.width = "100%";
  btnConfirm.style.height = "38px";
  btnConfirm.style.border = "1px solid rgba(255,255,255,.14)";
  btnConfirm.style.background = "rgba(56,189,248,.18)";
  btnConfirm.style.color = "#e8edf6";
  btnConfirm.style.cursor = "pointer";
  btnConfirm.style.borderRadius = "12px";
  btnConfirm.style.fontWeight = "700";

  btnConfirm.onclick = () => {
    if (selected.has("__ONLY_EMPTY__")) {
      filters[colKey] = { mode: "empty", value: "", raw: "vazio" };
    } else if (selected.has("__ONLY_NOT_EMPTY__")) {
      filters[colKey] = { mode: "not_empty", value: "", raw: "nao_vazio" };
    } else {
      if (selected.size === values.length || values.length === 0) {
        delete filters[colKey];
      } else {
        filters[colKey] = { mode: "in", values: Array.from(selected), raw: "[lista]" };
      }
    }

      rebuildViewMap();
      renderTable();
      markConfigDirty();
      hideFilterDropdown();
    };

  footer.appendChild(btnConfirm);
  menu.appendChild(footer);

  menu.style.display = "flex";
  requestAnimationFrame(() => {
    positionFilterDropdown(thEl);
    input.focus();
  });
}

/* ===========================
   STATUS BAR
=========================== */
function updateStatusBar(rowMin, rowMax, colMin, colMax) {
  const el = document.getElementById("cf-status-bar");
  if (!el) return;

  const totalRows = viewMap.length;
  if (rowMin == null || rowMax == null || colMin == null || colMax == null) {
    el.textContent = `Linhas: ${totalRows} · Selecionadas: 0 x 0`;
    refreshDirtyVisuals();
    return;
  }

  const rowsSel = rowMax - rowMin + 1;
  const colsSel = colMax - colMin + 1;

  el.textContent = `Linhas: ${totalRows} · Selecionadas: ${rowsSel} x ${colsSel}`;
  refreshDirtyVisuals();
}

/* ===========================
   SCROLL
=========================== */
function getStickyOffsets() {
  const headerTh = document.querySelector(".cf-table thead th");
  const headerH = headerTh ? headerTh.offsetHeight : 0;

  const idxCell = document.querySelector(".cf-row-index");
  const leftW = idxCell ? idxCell.offsetWidth : 40;

  return { headerH, leftW };
}

function getGridScroller() {
  const activeView = document.querySelector(".cf-view.is-active");
  return (
    activeView?.querySelector(".table-wrapper") ||
    activeView?.querySelector(".cf-grid-container") ||
    document.querySelector(".table-wrapper") ||
    document.querySelector(".cf-grid-container") ||
    document.scrollingElement ||
    document.documentElement
  );
}

function scrollCellIntoView(cell) {
  if (!cell) return;

  const scroller = getGridScroller();
  const { headerH, leftW } = getStickyOffsets();
  const padding = 16;

  let offsetTop = cell.offsetTop;
  let offsetLeft = cell.offsetLeft;
  let node = cell.offsetParent;

  while (node && node !== scroller && node !== document.body && node !== document.documentElement) {
    offsetTop += node.offsetTop;
    offsetLeft += node.offsetLeft;
    node = node.offsetParent;
  }

  const cellTop = offsetTop;
  const cellBottom = offsetTop + cell.offsetHeight;
  const cellLeft = offsetLeft;
  const cellRight = offsetLeft + cell.offsetWidth;

  const visibleTop = scroller.scrollTop;
  const visibleBottom = visibleTop + scroller.clientHeight;

  const minVisibleTop = visibleTop + headerH + padding;
  const maxVisibleBottom = visibleBottom - padding;

  if (cellTop < minVisibleTop) scroller.scrollTop = Math.max(0, cellTop - headerH - padding);
  else if (cellBottom > maxVisibleBottom) scroller.scrollTop = cellBottom - scroller.clientHeight + padding;

  const visibleLeft = scroller.scrollLeft;
  const visibleRight = visibleLeft + scroller.clientWidth;

  const minVisibleLeft = visibleLeft + leftW + padding;
  const maxVisibleRight = visibleRight - padding;

  if (cellLeft < minVisibleLeft) scroller.scrollLeft = Math.max(0, cellLeft - leftW - padding);
  else if (cellRight > maxVisibleRight) scroller.scrollLeft = cellRight - scroller.clientWidth + padding;
}

function forceStickyReflow() {
  const scroller = getGridScroller();
  if (!scroller) return;

  const st = scroller.scrollTop;
  const sl = scroller.scrollLeft;

  requestAnimationFrame(() => {
    scroller.scrollTop = st + 1;
    scroller.scrollLeft = sl + 1;

    requestAnimationFrame(() => {
      scroller.scrollTop = st;
      scroller.scrollLeft = sl;
    });
  });
}

/* ===========================
   SELEÇÃO / FOCO
=========================== */
function clampSelection(row, col) {
  const maxRow = Math.max(0, viewMap.length - 1);
  const maxCol = Math.max(0, CF_COLUMNS.length - 1);
  return { row: clamp(row, 0, maxRow), col: clamp(col, 0, maxCol) };
}

function applySelection(startRow, startCol, endRow, endCol) {
  const maxRow = Math.max(0, viewMap.length - 1);
  const maxCol = Math.max(0, CF_COLUMNS.length - 1);

  const r1 = clamp(startRow, 0, maxRow);
  const r2 = clamp(endRow, 0, maxRow);
  const c1 = clamp(startCol, 0, maxCol);
  const c2 = clamp(endCol, 0, maxCol);

  const rowMin = Math.min(r1, r2);
  const rowMax = Math.max(r1, r2);
  const colMin = Math.min(c1, c2);
  const colMax = Math.max(c1, c2);

  activeRow = r2;
  activeCol = c2;
  lastSelectionBounds = { rowMin, rowMax, colMin, colMax };

  const cells = document.querySelectorAll(".cf-cell");
  cells.forEach((cell) => {
    const ri = parseInt(cell.dataset.rowIndex, 10);
    const ci = parseInt(cell.dataset.colIndex, 10);
    if (Number.isNaN(ri) || Number.isNaN(ci)) return;

    cell.classList.remove("is-active", "is-selected", "is-row-active", "is-col-active");

    if (ri >= rowMin && ri <= rowMax && ci >= colMin && ci <= colMax) cell.classList.add("is-selected");
    if (ri === r2 && ci === c2) cell.classList.add("is-active");
    if (ri === r2) cell.classList.add("is-row-active");
    if (ci === c2) cell.classList.add("is-col-active");
  });

  const selector = `.cf-cell[data-row-index="${r2}"][data-col-index="${c2}"]`;
  const activeCellEl = document.querySelector(selector);
  if (activeCellEl) {
    activeCellEl.focus({ preventScroll: true });
    requestAnimationFrame(() => {
      scrollCellIntoView(activeCellEl);
      forceStickyReflow();
    });
  }

  updateStatusBar(rowMin, rowMax, colMin, colMax);
}

function setSingleActiveCell(rowIndex, colIndex) {
  const clamped = clampSelection(rowIndex, colIndex);
  selectionAnchor = { row: clamped.row, col: clamped.col };
  applySelection(clamped.row, clamped.col, clamped.row, clamped.col);
}

function expandSelectionTo(rowIndex, colIndex) {
  if (!selectionAnchor) selectionAnchor = { row: activeRow, col: activeCol };
  const clamped = clampSelection(rowIndex, colIndex);
  applySelection(selectionAnchor.row, selectionAnchor.col, clamped.row, clamped.col);
}

function getSelectionBoundsFallback() {
  if (lastSelectionBounds) return lastSelectionBounds;
  return { rowMin: activeRow, rowMax: activeRow, colMin: activeCol, colMax: activeCol };
}

function getSelectedDataIndices() {
  if (!lastSelectionBounds) return [];
  const { rowMin, rowMax } = lastSelectionBounds;
  const set = new Set();
  for (let r = rowMin; r <= rowMax; r++) {
    const di = viewMap[r];
    if (di != null) set.add(di);
  }
  return Array.from(set).sort((a, b) => a - b);
}

function applyCellValueChange(dataIndex, colKey, nextValue, viewRow, colIndex) {
  const before = String(cfData?.[dataIndex]?.[colKey] ?? "");
  let after = normalizeCellValue(colKey, nextValue ?? "");

  if (colKey === "num_quotas") {
    cfData[dataIndex][colKey] = after;
    syncQuotasByNum(cfData[dataIndex]);
    after = String(cfData[dataIndex][colKey] ?? "");
    if (!after.trim()) {
      after = "3";
      cfData[dataIndex][colKey] = "3";
      syncQuotasByNum(cfData[dataIndex]);
    }
  }

  if (before === after) {
    setSingleActiveCell(viewRow, colIndex);
    return;
  }

  cfData[dataIndex][colKey] = after;
  pushUndo({ type: "cell", dataIndex, colKey, before, after });
  markCellDirty(dataIndex, colKey);
  syncPainelTributarioAfterContFlowChange([{ dataIndex, colKey }]);
  renderTable({ suppressCellFocus: true });
  setSingleActiveCell(viewRow, colIndex);
}

function syncRenderedCellValue(viewRow, colIndex, colKey, nextValue) {
  const cell = document.querySelector(
    `.cf-cell[data-row-index="${viewRow}"][data-col-index="${colIndex}"]`
  );
  if (!cell) return;

  const rawValue = String(nextValue ?? "").trim();

  if (isQuotaPresetColumnKey(colKey)) {
    const select = cell.querySelector(".cf-inline-quota-select");
    if (select) {
      const hasOption = Array.from(select.options || []).some(
        (option) => String(option.value || "").trim() === rawValue
      );
      if (!hasOption && rawValue) {
        const option = document.createElement("option");
        option.value = rawValue;
        option.textContent = rawValue;
        select.insertBefore(option, select.lastElementChild || null);
      }
      select.value = rawValue;
      return;
    }
  }

  if (isQuotaColumnKey(colKey)) {
    const trigger = cell.querySelector(".cf-quota-trigger");
    const label = cell.querySelector(".cf-quota-trigger__label");
    if (trigger && label) {
      label.textContent = rawValue || "Selecionar";
      trigger.classList.toggle("is-filled", Boolean(rawValue));
      return;
    }
  }

  if (isMitGenerationColumnKey(colKey)) {
    const trigger = cell.querySelector(".cf-quota-trigger");
    const label = cell.querySelector(".cf-quota-trigger__label");
    if (trigger && label) {
      label.textContent = rawValue || "Selecionar";
      trigger.classList.toggle("is-filled", Boolean(rawValue));
      return;
    }
  }

  cell.textContent = rawValue;
}

function closeQuotaEditor({ focusCell = true } = {}) {
  if (!quotaEditor) return;

  quotaEditor.cleanup?.();
  quotaEditor.el?.remove();
  document.body.classList.remove("cf-mobile-popover-open");
  const previousEditor = quotaEditor;
  quotaEditor = null;

  if (focusCell) {
    setSingleActiveCell(previousEditor.viewRow, previousEditor.colIndex);
  }
}

function closeMitEditor({ focusCell = true } = {}) {
  if (!mitEditor) return;

  mitEditor.cleanup?.();
  mitEditor.el?.remove();
  document.body.classList.remove("cf-mobile-popover-open");
  const previousEditor = mitEditor;
  mitEditor = null;

  if (focusCell) {
    setSingleActiveCell(previousEditor.viewRow, previousEditor.colIndex);
  }
}

function getQuotaEditorPendingValue(editor = quotaEditor) {
  const root = editor?.el;
  if (!root) return "";

  const dateInput = root.querySelector(".cf-quota-editor__date");
  const customInput = root.querySelector(".cf-quota-editor__custom");

  const dateValue = String(dateInput?.value || "").trim();
  const customValue = String(customInput?.value || "").trim();

  if (dateValue) return dateValue;
  return customValue;
}

function closeOptionEditor({ focusCell = true } = {}) {
  if (!optionEditor) return;

  optionEditor.cleanup?.();
  optionEditor.el?.remove();
  const previousEditor = optionEditor;
  optionEditor = null;

  if (focusCell) {
    setSingleActiveCell(previousEditor.viewRow, previousEditor.colIndex);
  }
}

function openQuotaEditor(viewRow, colIndex) {
  const dataIndex = viewMap[viewRow];
  const col = CF_COLUMNS[colIndex];
  const cell = document.querySelector(`.cf-cell[data-row-index="${viewRow}"][data-col-index="${colIndex}"]`);
  if (dataIndex == null || !col || !cell) return;

  injectExtraStyles();
  if (editing) commitEdit();
  closeQuotaEditor({ focusCell: false });

  const currentValue = String(cfData[dataIndex]?.[col.key] ?? "");
  const presetOptions = ["Compensação", "Prejuízo", "S/M"];
  const rect = cell.getBoundingClientRect();
  const isMobileQuotaEditor = window.innerWidth <= 560;
  const pop = document.createElement("div");
  pop.className = "cf-quota-editor";
  if (isMobileQuotaEditor) {
    pop.classList.add("is-mobile");
    document.body.classList.add("cf-mobile-popover-open");
  }
  pop.innerHTML = `
    <div class="cf-quota-editor__head">
      <div>
        <div class="cf-quota-editor__eyebrow">Conclusão de quota</div>
        <div class="cf-quota-editor__title">${col.label}</div>
      </div>
      <div class="cf-quota-editor__value-badge">${escapeHTML(currentValue.trim() || "Sem valor")}</div>
    </div>
    <div class="cf-quota-editor__subtitle">Escolha uma forma rápida de concluir ou informe a data manualmente.</div>
    <div class="cf-quota-editor__scroll">
    <div class="cf-quota-editor__options-label">Opções rápidas</div>
    <div class="cf-quota-editor__options" role="listbox" aria-label="Opções de quota">
      ${presetOptions
        .map((option) => {
          const activeClass =
            normalizeSearchText(currentValue) === normalizeSearchText(option)
              ? " is-active"
              : "";
          return `
            <button type="button" class="cf-quota-editor__option${activeClass}" data-preset="${option}" aria-selected="${activeClass ? "true" : "false"}">
              <span class="cf-quota-editor__option-title">${option}</span>
              <span class="cf-quota-editor__option-hint">Aplicar imediatamente</span>
            </button>
          `;
        })
        .join("")}
    </div>
    <div class="cf-quota-editor__divider"></div>
    <div class="cf-quota-editor__date-card">
      <div class="cf-quota-editor__date-head">
        <div>
          <div class="cf-quota-editor__date-label">Data de conclusão</div>
          <div class="cf-quota-editor__date-hint">Escolha no calendário ou use um atalho rápido.</div>
        </div>
        <div class="cf-quota-editor__date-preview">${escapeHTML(currentValue.trim() || "Sem data")}</div>
      </div>
      <label class="cf-quota-editor__field cf-quota-editor__field--date">
        <input type="date" class="cf-quota-editor__date" value="${quotaValueToDateInput(currentValue)}" />
      </label>
      <div class="cf-quota-editor__date-actions">
        <button type="button" class="cf-quota-editor__date-action" data-date-action="today">Hoje</button>
        <button type="button" class="cf-quota-editor__date-action" data-date-action="clear">Limpar data</button>
      </div>
    </div>
    <label class="cf-quota-editor__field cf-quota-editor__custom-wrap">
      <span>Outro valor</span>
      <input type="text" class="cf-quota-editor__custom" placeholder="Digite um status personalizado..." />
    </label>
    </div>
    <div class="cf-quota-editor__footer">
      <button type="button" class="cf-quota-editor__footer-btn is-ghost" data-action="clear">Limpar</button>
      <button type="button" class="cf-quota-editor__footer-btn is-primary" data-action="apply">Aplicar</button>
    </div>
  `;

  pop.style.position = "fixed";
  if (isMobileQuotaEditor) {
    pop.style.inset = "8px";
  } else {
    pop.style.top = `${Math.max(8, Math.min(rect.bottom + 10, window.innerHeight - 360))}px`;
    pop.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 340))}px`;
  }
  pop.style.zIndex = "2000";

  const stop = (ev) => ev.stopPropagation();
  pop.addEventListener("mousedown", stop);
  pop.addEventListener("click", stop);

  const dateInput = pop.querySelector(".cf-quota-editor__date");
  const datePreview = pop.querySelector(".cf-quota-editor__date-preview");
  const customInput = pop.querySelector(".cf-quota-editor__custom");
  const optionButtons = Array.from(pop.querySelectorAll("[data-preset]"));
  const dateActionButtons = Array.from(pop.querySelectorAll("[data-date-action]"));

  const formatDatePreview = (value = "") => {
    const clean = String(value || "").trim();
    if (!clean) return "Sem data";
    const match = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) return `${match[3]}/${match[2]}/${match[1]}`;
    return clean;
  };

  const syncDatePreview = (value = "") => {
    if (!datePreview) return;
    datePreview.textContent = formatDatePreview(value);
    datePreview.classList.toggle("is-empty", !String(value || "").trim());
  };

  const setActiveQuotaOption = (value = "") => {
    const normalizedValue = normalizeSearchText(value);
    optionButtons.forEach((button) => {
      const isActive =
        normalizeSearchText(button.dataset.preset || "") === normalizedValue;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", isActive ? "true" : "false");
    });
  };

  const commitQuotaValue = (value) => {
    closeQuotaEditor({ focusCell: false });
    applyCellValueChange(dataIndex, col.key, value, viewRow, colIndex);
  };

  const onDocumentMouseDown = (ev) => {
    if (!pop.contains(ev.target)) closeQuotaEditor();
  };
  const onWindowResize = () => closeQuotaEditor();
  const onDocumentKeyDown = (ev) => {
    if (!quotaEditor) return;
    if (ev.key === "Escape") {
      ev.preventDefault();
      closeQuotaEditor();
    }
  };

  dateInput?.addEventListener("change", (ev) => {
    syncDatePreview(ev.currentTarget.value);
    if (ev.currentTarget.value) commitQuotaValue(ev.currentTarget.value);
  });

  dateInput?.addEventListener("input", (ev) => {
    syncDatePreview(ev.currentTarget.value);
    setActiveQuotaOption("");
  });

  optionButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const value = String(button.dataset.preset || "").trim();
      if (!value) return;
      setActiveQuotaOption(value);
      commitQuotaValue(value);
    });
  });

  customInput?.addEventListener("input", () => {
    if (customInput.value) {
      if (dateInput) dateInput.value = "";
    }
    syncDatePreview("");
    setActiveQuotaOption("");
  });

  dateActionButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const action = String(button.dataset.dateAction || "").trim();
      if (!dateInput) return;
      if (action === "today") {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, "0");
        const dd = String(now.getDate()).padStart(2, "0");
        dateInput.value = `${yyyy}-${mm}-${dd}`;
        if (customInput) customInput.value = "";
        syncDatePreview(dateInput.value);
        setActiveQuotaOption("");
        return;
      }
      if (action === "clear") {
        dateInput.value = "";
        syncDatePreview("");
      }
    });
  });

  pop.querySelector('[data-action="clear"]')?.addEventListener("click", () => commitQuotaValue(""));
  pop.querySelector('[data-action="apply"]')?.addEventListener("click", () =>
    commitQuotaValue(getQuotaEditorPendingValue({ el: pop }))
  );

  if (quotaValueToDateInput(currentValue)) {
    if (dateInput) dateInput.value = quotaValueToDateInput(currentValue);
  } else if (currentValue) {
    if (customInput) customInput.value = currentValue;
  }
  syncDatePreview(dateInput?.value || "");
  setActiveQuotaOption(currentValue);

  document.body.appendChild(pop);
  document.addEventListener("mousedown", onDocumentMouseDown);
  document.addEventListener("keydown", onDocumentKeyDown, true);
  window.addEventListener("resize", onWindowResize);

  quotaEditor = {
    el: pop,
    viewRow,
    colIndex,
    cleanup() {
      document.removeEventListener("mousedown", onDocumentMouseDown);
      document.removeEventListener("keydown", onDocumentKeyDown, true);
      window.removeEventListener("resize", onWindowResize);
    },
  };

  setSingleActiveCell(viewRow, colIndex);
  customInput?.focus({ preventScroll: true });
  customInput?.select();
}

function openMitEditor(viewRow, colIndex) {
  const dataIndex = viewMap[viewRow];
  const col = CF_COLUMNS[colIndex];
  const cell = document.querySelector(`.cf-cell[data-row-index="${viewRow}"][data-col-index="${colIndex}"]`);
  if (dataIndex == null || !col || !cell) return;

  injectExtraStyles();
  if (editing) commitEdit();
  closeQuotaEditor({ focusCell: false });
  closeMitEditor({ focusCell: false });
  closeOptionEditor({ focusCell: false });

  const currentValue = String(cfData[dataIndex]?.[col.key] ?? "").trim();
  const rect = cell.getBoundingClientRect();
  const isMobileMitEditor = window.innerWidth <= 560;
  const pop = document.createElement("div");
  pop.className = "cf-quota-editor";
  if (isMobileMitEditor) {
    pop.classList.add("is-mobile");
    document.body.classList.add("cf-mobile-popover-open");
  }
  pop.innerHTML = `
    <div class="cf-quota-editor__head">
      <div>
        <div class="cf-quota-editor__eyebrow">MIT - geração</div>
        <div class="cf-quota-editor__title">${col.label}</div>
      </div>
      <div class="cf-quota-editor__value-badge">${escapeHTML(currentValue || "Sem valor")}</div>
    </div>
    <div class="cf-quota-editor__subtitle">Selecione como a geração da MIT foi concluída nesta empresa.</div>
    <div class="cf-quota-editor__options-label">Opções rápidas</div>
    <div class="cf-quota-editor__options" role="listbox" aria-label="Opções de MIT - geração">
      ${CF_MIT_GENERATION_OPTIONS.map((option) => {
        const activeClass =
          normalizeSearchText(currentValue) === normalizeSearchText(option)
            ? " is-active"
            : "";
        return `
          <button type="button" class="cf-quota-editor__option${activeClass}" data-mit-preset="${option}" aria-selected="${activeClass ? "true" : "false"}">
            <span class="cf-quota-editor__option-title">${option}</span>
            <span class="cf-quota-editor__option-hint">Aplicar imediatamente</span>
          </button>
        `;
      }).join("")}
    </div>
    <div class="cf-quota-editor__footer">
      <button type="button" class="cf-quota-editor__footer-btn is-ghost" data-action="clear">Limpar</button>
      <button type="button" class="cf-quota-editor__footer-btn is-primary" data-action="close">Fechar</button>
    </div>
  `;

  pop.style.position = "fixed";
  if (isMobileMitEditor) {
    pop.style.inset = "8px";
  } else {
    pop.style.top = `${Math.min(rect.bottom + 10, window.innerHeight - 280)}px`;
    pop.style.left = `${Math.min(rect.left, window.innerWidth - 340)}px`;
  }
  pop.style.zIndex = "2000";

  const stop = (ev) => ev.stopPropagation();
  pop.addEventListener("mousedown", stop);
  pop.addEventListener("click", stop);

  const commitMitValue = (value) => {
    closeMitEditor({ focusCell: false });
    applyCellValueChange(dataIndex, col.key, value, viewRow, colIndex);
  };

  const onDocumentMouseDown = (ev) => {
    if (!pop.contains(ev.target)) closeMitEditor();
  };
  const onWindowResize = () => closeMitEditor();
  const onDocumentKeyDown = (ev) => {
    if (!mitEditor) return;
    if (ev.key === "Escape") {
      ev.preventDefault();
      closeMitEditor();
    }
  };

  Array.from(pop.querySelectorAll("[data-mit-preset]")).forEach((button) => {
    button.addEventListener("click", () => {
      const value = String(button.dataset.mitPreset || "").trim();
      if (!value) return;
      commitMitValue(value);
    });
  });

  pop.querySelector('[data-action="clear"]')?.addEventListener("click", () => commitMitValue(""));
  pop.querySelector('[data-action="close"]')?.addEventListener("click", () => closeMitEditor());

  document.body.appendChild(pop);
  document.addEventListener("mousedown", onDocumentMouseDown);
  document.addEventListener("keydown", onDocumentKeyDown, true);
  window.addEventListener("resize", onWindowResize);

  mitEditor = {
    el: pop,
    viewRow,
    colIndex,
    cleanup() {
      document.removeEventListener("mousedown", onDocumentMouseDown);
      document.removeEventListener("keydown", onDocumentKeyDown, true);
      window.removeEventListener("resize", onWindowResize);
    },
  };

  setSingleActiveCell(viewRow, colIndex);
}

function openOptionEditor(viewRow, colIndex, initialText = null) {
  const dataIndex = viewMap[viewRow];
  const col = CF_COLUMNS[colIndex];
  const cell = document.querySelector(`.cf-cell[data-row-index="${viewRow}"][data-col-index="${colIndex}"]`);
  if (dataIndex == null || !col || !cell) return;

  injectExtraStyles();
  if (editing) commitEdit();
  closeQuotaEditor({ focusCell: false });
  closeOptionEditor({ focusCell: false });

  const currentValue = String(cfData[dataIndex]?.[col.key] ?? "");
  const seededValue = initialText != null ? String(initialText) : currentValue;
  const rect = cell.getBoundingClientRect();
  const pop = document.createElement("div");
  pop.className = "cf-option-editor";
  pop.style.position = "fixed";
  pop.style.top = `${Math.min(rect.bottom + 8, window.innerHeight - 360)}px`;
  pop.style.left = `${Math.min(rect.left, window.innerWidth - 320)}px`;
  pop.style.zIndex = "2000";

  pop.innerHTML = `
    <div class="cf-option-editor__title">${col.label}</div>
    <input type="text" class="cf-option-editor__input" placeholder="Pesquisar ou digitar..." />
    <div class="cf-option-editor__list"></div>
    <div class="cf-option-editor__footer">
      <button type="button" data-action="clear">Limpar</button>
      <button type="button" data-action="apply">Usar valor digitado</button>
    </div>
  `;

  const input = pop.querySelector(".cf-option-editor__input");
  const list = pop.querySelector(".cf-option-editor__list");
  let options = getSelectOptionsForColumn(col.key, currentValue);

  const commitOptionValue = (value) => {
    closeOptionEditor({ focusCell: false });
    applyCellValueChange(dataIndex, col.key, value, viewRow, colIndex);
  };

  const renderOptions = () => {
    const query = normalizeSearchText(input?.value || "");
    list.innerHTML = "";

    const filtered = options.filter((value) => normalizeSearchText(value).includes(query));
    const typedValue = String(input?.value || "").trim();
    const hasTypedValue = typedValue && !filtered.some((value) => normalizeSearchText(value) === normalizeSearchText(typedValue));

    if (hasTypedValue) {
      const customBtn = document.createElement("button");
      customBtn.type = "button";
      customBtn.className = "cf-option-editor__item is-custom";
      customBtn.textContent = `Usar: ${typedValue}`;
      customBtn.addEventListener("click", () => commitOptionValue(typedValue));
      list.appendChild(customBtn);
    }

    filtered.forEach((value) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = value === currentValue ? "cf-option-editor__item is-active" : "cf-option-editor__item";
      btn.textContent = value;
      btn.title = value;
      btn.addEventListener("click", () => commitOptionValue(value));
      list.appendChild(btn);
    });

    if (!hasTypedValue && !filtered.length) {
      const empty = document.createElement("div");
      empty.className = "cf-option-editor__empty";
      empty.textContent = "Nenhuma opção encontrada.";
      list.appendChild(empty);
    }
  };

  const stop = (ev) => ev.stopPropagation();
  pop.addEventListener("mousedown", stop);
  pop.addEventListener("click", stop);

  const onDocumentMouseDown = (ev) => {
    if (!pop.contains(ev.target)) closeOptionEditor();
  };
  const onWindowResize = () => closeOptionEditor();
  const onDocumentKeyDown = (ev) => {
    if (!optionEditor) return;
    if (ev.key === "Escape") {
      ev.preventDefault();
      closeOptionEditor();
      return;
    }
    if (ev.key === "Enter") {
      ev.preventDefault();
      commitOptionValue(input?.value || "");
      return;
    }
    if (ev.key === "Tab") {
      ev.preventDefault();
      commitOptionValue(input?.value || "");
    }
  };

  input.value = seededValue;
  input.addEventListener("input", renderOptions);
  pop.querySelector('[data-action="clear"]')?.addEventListener("click", () => commitOptionValue(""));
  pop.querySelector('[data-action="apply"]')?.addEventListener("click", () => commitOptionValue(input?.value || ""));

  document.body.appendChild(pop);
  document.addEventListener("mousedown", onDocumentMouseDown);
  document.addEventListener("keydown", onDocumentKeyDown, true);
  window.addEventListener("resize", onWindowResize);

  optionEditor = {
    el: pop,
    viewRow,
    colIndex,
    renderOptions,
    cleanup() {
      document.removeEventListener("mousedown", onDocumentMouseDown);
      document.removeEventListener("keydown", onDocumentKeyDown, true);
      window.removeEventListener("resize", onWindowResize);
    },
  };

  renderOptions();
  setSingleActiveCell(viewRow, colIndex);
  input.focus({ preventScroll: true });
  input.select();

  if (col.key === "resp1" || col.key === "resp2" || col.key === "resp3") {
    ensureAssignableUsersLoaded()
      .then(() => {
        if (!optionEditor || optionEditor.viewRow !== viewRow || optionEditor.colIndex !== colIndex) return;
        options = getSelectOptionsForColumn(col.key, currentValue);
        optionEditor.renderOptions?.();
      })
      .catch(() => {});
  }
}

/* ===========================
   EDIÇÃO
=========================== */
function enterEditMode(viewRow, colIndex, initialText = null, selectAll = false) {
  if (viewMap.length === 0) return;
  const dataIndex = viewMap[viewRow];
  if (dataIndex == null) return;

  const col = CF_COLUMNS[colIndex];
  if (!col) return;

  if (isQuotaColumnKey(col.key)) {
    openQuotaEditor(viewRow, colIndex);
    return;
  }

  if (isMitGenerationColumnKey(col.key)) {
    openMitEditor(viewRow, colIndex);
    return;
  }

  if (isSelectColumnKey(col.key)) {
    openOptionEditor(viewRow, colIndex, initialText);
    return;
  }

  const cell = document.querySelector(`.cf-cell[data-row-index="${viewRow}"][data-col-index="${colIndex}"]`);
  if (!cell) return;

  closeQuotaEditor({ focusCell: false });
  closeOptionEditor({ focusCell: false });
  if (editing) commitEdit();

  const before = String(cfData[dataIndex][col.key] ?? "");
  const startVal = initialText != null ? String(initialText) : before;

  editing = { el: cell, viewRow, colIndex, colKey: col.key, before, dataIndex };

  cell.contentEditable = "true";
  cell.classList.add("is-editing");
  cell.textContent = startVal;

  cell.focus({ preventScroll: true });

  const range = document.createRange();
  range.selectNodeContents(cell);
  if (!selectAll) range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function handleEditingInput(e) {
  if (!editing || editing.el !== e.currentTarget) return;
  if (editing.colKey !== "desligamento") return;

  const formatted = normalizeCellValue(editing.colKey, e.currentTarget.textContent ?? "");
  if (formatted === String(e.currentTarget.textContent ?? "")) return;

  e.currentTarget.textContent = formatted;

  const range = document.createRange();
  range.selectNodeContents(e.currentTarget);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function cancelEdit() {
  if (!editing) return;
  const { el, before } = editing;
  el.textContent = before;
  el.contentEditable = "false";
  el.classList.remove("is-editing");
  editing = null;
  setSingleActiveCell(activeRow, activeCol);
}

function commitEdit() {
  if (!editing) return;

  const { el, before, dataIndex, colKey, viewRow, colIndex } = editing;
  const after = normalizeCellValue(colKey, el.textContent ?? "");

  let finalAfter = after;
  el.textContent = finalAfter;

  if (colKey === "num_quotas") {
    cfData[dataIndex][colKey] = finalAfter;
    syncQuotasByNum(cfData[dataIndex]);
    el.textContent = cfData[dataIndex][colKey];
    finalAfter = cfData[dataIndex][colKey];
  }

  if (colKey === "num_quotas" && String(finalAfter).trim() === "") {
    finalAfter = "3";
    cfData[dataIndex][colKey] = "3";
    syncQuotasByNum(cfData[dataIndex]);
    el.textContent = "3";
  }

  el.contentEditable = "false";
  el.classList.remove("is-editing");

  editing = null;

  if (before !== finalAfter) {
    cfData[dataIndex][colKey] = finalAfter;
    pushUndo({ type: "cell", dataIndex, colKey, before, after: finalAfter });
    markCellDirty(dataIndex, colKey);
    syncPainelTributarioAfterContFlowChange([{ dataIndex, colKey }]);
  }

  setSingleActiveCell(viewRow, colIndex);
}

function isTypingKey(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  const k = e.key;
  if (!k) return false;
  return k.length === 1;
}

/* ===========================
   COPIAR / COLAR
=========================== */
async function copyToClipboard(text) {
  clipboardTextCache = String(text ?? "");
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  } catch (err) {
    console.error("Erro ao copiar:", err);
  }
}

async function copySelection() {
  if (!viewMap.length) return "";
  const { rowMin, rowMax, colMin, colMax } = getSelectionBoundsFallback();

  const lines = [];
  for (let vr = rowMin; vr <= rowMax; vr++) {
    const di = viewMap[vr];
    const row = cfData[di];
    const out = [];
    for (let c = colMin; c <= colMax; c++) {
      const colDef = CF_COLUMNS[c];
      out.push(String((row && row[colDef.key]) ?? ""));
    }
    lines.push(out.join("\t"));
  }
  const text = lines.join("\n");
  await copyToClipboard(text);
  return text;
}

async function pasteFromClipboard(textOverride) {
  if (!viewMap.length) return;
  const text = textOverride ?? (await readClipboardText());
  if (!text) return;

  const rows = text.split(/\r?\n/).filter((l) => l !== "");
  if (!rows.length) return;

  const parsed = rows.map((line) => line.split("\t"));
  const { rowMin, rowMax, colMin, colMax } = getSelectionBoundsFallback();

  const selRows = rowMax - rowMin + 1;
  const selCols = colMax - colMin + 1;
  const maxColIndex = CF_COLUMNS.length - 1;

  if (parsed.length === 1 && parsed[0].length === 1 && (selRows > 1 || selCols > 1)) {
    const value = parsed[0][0];
    const changes = [];

    for (let vr = rowMin; vr <= rowMax; vr++) {
      const di = viewMap[vr];
      if (di == null) continue;

      for (let c = colMin; c <= colMax; c++) {
        const colDef = CF_COLUMNS[c];
        const before = String(cfData[di][colDef.key] ?? "");
        const after = normalizeCellValue(colDef.key, value);
        if (before !== after) {
          cfData[di][colDef.key] = after;
          changes.push({ dataIndex: di, colKey: colDef.key, before, after });
        }
      }
    }

    if (changes.length) {
      pushUndo({ type: "batch", changes });
      markDirtyChanges(changes);
    }

    renderTable();
    return;
  }

  let startViewRow = activeRow;
  let startCol = activeCol;

  const need = startViewRow + parsed.length;
  while (viewMap.length < need) {
    const newRow = createEmptyRow();
    cfData.push(newRow);
    markStructureDirty();
    rebuildViewMap();
  }

  const changes = [];

  parsed.forEach((rowArr, rOffset) => {
    const vr = startViewRow + rOffset;
    const di = viewMap[vr];
    if (di == null) return;

    rowArr.forEach((cellVal, cOffset) => {
      const colIndex = startCol + cOffset;
      if (colIndex > maxColIndex) return;
      const colDef = CF_COLUMNS[colIndex];
      const before = String(cfData[di][colDef.key] ?? "");
      const after = normalizeCellValue(colDef.key, cellVal ?? "");
      if (before !== after) {
        cfData[di][colDef.key] = after;
        changes.push({ dataIndex: di, colKey: colDef.key, before, after });
      }
    });
  });

  if (changes.length) {
    pushUndo({ type: "batch", changes });
    markDirtyChanges(changes);
  }

  const newRowMax = startViewRow + parsed.length - 1;
  const newColMax = Math.min(startCol + (parsed[0]?.length || 1) - 1, maxColIndex);

  selectionAnchor = { row: startViewRow, col: startCol };
  lastSelectionBounds = { rowMin: startViewRow, rowMax: newRowMax, colMin: startCol, colMax: newColMax };

  renderTable();
}

async function handleCopyEvent(e) {
  if (getActiveWorkbookView() !== "contflow") return;
  if (!viewMap.length) return;

  const text = await copySelection();
  if (!text) return;

  if (e.clipboardData) {
    e.preventDefault();
    e.clipboardData.setData("text/plain", text);
  }
}

async function handlePasteEvent(e) {
  if (getActiveWorkbookView() !== "contflow") return;
  if (!viewMap.length) return;

  const text = e.clipboardData?.getData("text/plain");
  if (!text) return;

  e.preventDefault();
  clipboardTextCache = String(text);
  await pasteFromClipboard(text);
}

/* ===========================
   CTRL+SETA
=========================== */
function ctrlJump(viewRow, colIndex, dRow, dCol) {
  if (!viewMap.length || !CF_COLUMNS.length) return { r: 0, c: 0 };

  const maxRow = Math.max(0, viewMap.length - 1);
  const maxCol = Math.max(0, CF_COLUMNS.length - 1);

  let r = clamp(viewRow, 0, maxRow);
  let c = clamp(colIndex, 0, maxCol);

  const colKey = CF_COLUMNS[c]?.key;
  if (!colKey) return { r, c };

  const curDi = viewMap[r];
  const curEmpty = isEmptyCell(curDi, colKey);

  const emptyAtRow = (vr) => isEmptyCell(viewMap[vr], colKey);
  const emptyAtCol = (ci) => {
    const k = CF_COLUMNS[ci]?.key;
    if (!k) return true;
    return isEmptyCell(viewMap[r], k);
  };

  function findNextFilledVertical(startVr, step) {
    for (let j = startVr; j >= 0 && j <= maxRow; j += step) if (!emptyAtRow(j)) return j;
    return null;
  }

  function findNextFilledHorizontal(startCi, step) {
    for (let j = startCi; j >= 0 && j <= maxCol; j += step) if (!emptyAtCol(j)) return j;
    return null;
  }

  if (dCol !== 0) {
    const step = dCol > 0 ? 1 : -1;
    if ((step < 0 && c === 0) || (step > 0 && c === maxCol)) return { r, c };

    if (curEmpty) {
      const next = findNextFilledHorizontal(c + step, step);
      return { r, c: next != null ? next : step > 0 ? maxCol : 0 };
    }

    let j = c + step;
    while (j >= 0 && j <= maxCol && !emptyAtCol(j)) j += step;

    if (j < 0) return { r, c: 0 };
    if (j > maxCol) return { r, c: maxCol };

    const nextFilled = findNextFilledHorizontal(j + step, step);
    if (nextFilled != null) return { r, c: nextFilled };

    return { r, c: clamp(j - step, 0, maxCol) };
  }

  if (dRow !== 0) {
    const step = dRow > 0 ? 1 : -1;
    if ((step < 0 && r === 0) || (step > 0 && r === maxRow)) return { r, c };

    if (curEmpty) {
      const next = findNextFilledVertical(r + step, step);
      return { r: next != null ? next : step > 0 ? maxRow : 0, c };
    }

    let j = r + step;
    while (j >= 0 && j <= maxRow && !emptyAtRow(j)) j += step;

    if (j < 0) return { r: 0, c };
    if (j > maxRow) return { r: maxRow, c };

    const nextFilled = findNextFilledVertical(j + step, step);
    if (nextFilled != null) return { r: nextFilled, c };

    return { r: clamp(j - step, 0, maxRow), c };
  }

  return { r, c };
}

/* ===========================
   RENDER
=========================== */
function ensureTheadRow() {
  const table = document.querySelector(".cf-table");
  if (!table) return null;

  const thead = table.querySelector("thead") || table.createTHead();
  let tr = thead.querySelector("tr");
  if (!tr) {
    tr = document.createElement("tr");
    thead.appendChild(tr);
  }
  tr.id = "cf-thead-row";
  return tr;
}

function renderColgroup() {
  const table = document.querySelector(".cf-table");
  if (!table) return;

  let cg = table.querySelector("colgroup");
  if (!cg) {
    cg = document.createElement("colgroup");
    table.insertBefore(cg, table.firstChild);
  }

  cg.innerHTML = "";

  const c0 = document.createElement("col");
  c0.style.width = "40px";
  cg.appendChild(c0);

  CF_COLUMNS.forEach((col) => {
    const colEl = document.createElement("col");
    const w = colWidths[col.key];
    colEl.style.width = (Number.isFinite(w) ? w : 140) + "px";
    cg.appendChild(colEl);
  });
}

function renderHeaders() {
  const theadRow = ensureTheadRow();
  if (!theadRow) return;

  theadRow.innerHTML = "";

  const thCorner = document.createElement("th");
  thCorner.id = "cf-corner-select";
  thCorner.textContent = "#";
  thCorner.title = "Selecionar tudo";
  theadRow.appendChild(thCorner);

  CF_COLUMNS.forEach((col, idx) => {
    const th = document.createElement("th");
    th.className = "cf-col-header";
    th.dataset.colIndex = String(idx);

    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.alignItems = "center";
    wrap.style.justifyContent = "space-between";
    wrap.style.gap = "8px";

    const label = document.createElement("span");
    label.textContent = col.label;

    const badges = document.createElement("span");
    badges.style.display = "inline-flex";
    badges.style.gap = "6px";
    badges.style.alignItems = "center";
    badges.style.opacity = "0.95";
    badges.style.fontSize = "11px";

    if (sortState && sortState.colKey === col.key) {
      const s = document.createElement("span");
      s.textContent = sortState.dir === 1 ? "▲" : "▼";
      badges.appendChild(s);
    }

    if (filters[col.key] && isFilterActive(filters[col.key])) {
      const f = document.createElement("span");
      f.textContent = "⎇";
      badges.appendChild(f);
    }

    const btnFilter = document.createElement("button");
    btnFilter.type = "button";
    btnFilter.className = "cf-filter-btn";
    btnFilter.textContent = "⏷";
    btnFilter.title = `Filtrar: ${col.label}`;
    btnFilter.style.border = "0";
    btnFilter.style.background = "transparent";
    btnFilter.style.color = "rgba(232,237,246,.9)";
    btnFilter.style.cursor = "pointer";
    btnFilter.style.fontSize = "14px";
    btnFilter.style.padding = "2px 6px";
    btnFilter.style.borderRadius = "8px";

    btnFilter.onmouseenter = () => (btnFilter.style.background = "rgba(255,255,255,.08)");
    btnFilter.onmouseleave = () => (btnFilter.style.background = "transparent");

    btnFilter.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      openFilterDropdownForHeader(th, idx);
    };

    badges.appendChild(btnFilter);

    wrap.appendChild(label);
    wrap.appendChild(badges);
    th.appendChild(wrap);

    const res = document.createElement("span");
    res.className = "cf-col-resizer";
    res.title = "Arraste para ajustar";
    res.style.position = "absolute";
    res.style.top = "0";
    res.style.right = "0";
    res.style.width = "10px";
    res.style.height = "100%";
    res.style.cursor = "col-resize";
    res.style.userSelect = "none";

    th.style.position = "sticky";
    th.style.top = "0";
    th.appendChild(res);

    theadRow.appendChild(th);
  });

  bindHeaderInteractions();
}

function getContFlowFrozenIndexes() {
  return CF_COLUMNS.reduce((acc, col, idx) => {
    if (CF_FROZEN_COL_KEYS.includes(col.key)) acc.push(idx);
    return acc;
  }, []);
}

function applyContFlowFrozenColumns() {
  const table = document.getElementById("cf-table");
  if (!table) return;

  const corner = document.getElementById("cf-corner-select");
  if (corner) {
    corner.style.setProperty("position", "sticky", "important");
    corner.style.setProperty("left", "0px", "important");
    corner.style.setProperty("top", "0px", "important");
    corner.style.setProperty("z-index", "48", "important");
  }

  table.querySelectorAll(".cf-col-header, .cf-cell, .cf-row-index").forEach((el) => {
    el.classList.remove("cf-frozen-col");
    el.classList.remove("cf-frozen-col-last");
    el.style.removeProperty("left");
    el.style.removeProperty("width");
    el.style.removeProperty("min-width");
    el.style.removeProperty("max-width");
    el.style.removeProperty("position");
    el.style.removeProperty("top");
    el.style.removeProperty("z-index");
  });

  table.querySelectorAll(".cf-row-index").forEach((cell) => {
    cell.style.setProperty("position", "sticky", "important");
    cell.style.setProperty("left", "0px", "important");
    cell.style.setProperty("z-index", "24", "important");
  });

  const frozenIndexes = getContFlowFrozenIndexes();
  if (!frozenIndexes.length) return;

  let left = 40;

  frozenIndexes.forEach((colIndex, frozenPos) => {
    const col = CF_COLUMNS[colIndex];
    if (!col) return;

    const width = Number.isFinite(colWidths[col.key]) ? colWidths[col.key] : 140;
    const leftPx = `${left}px`;
    const widthPx = `${width}px`;
    const isLastFrozen = frozenPos === frozenIndexes.length - 1;

    const header = table.querySelector(`.cf-col-header[data-col-index="${colIndex}"]`);
    if (header) {
      header.classList.add("cf-frozen-col");
      if (isLastFrozen) header.classList.add("cf-frozen-col-last");
      header.style.setProperty("position", "sticky", "important");
      header.style.setProperty("top", "0px", "important");
      header.style.setProperty("left", leftPx, "important");
      header.style.setProperty("width", widthPx, "important");
      header.style.setProperty("min-width", widthPx, "important");
      header.style.setProperty("max-width", widthPx, "important");
      header.style.setProperty("z-index", isLastFrozen ? "46" : "45", "important");
    }

    table.querySelectorAll(`.cf-cell[data-col-index="${colIndex}"]`).forEach((cell) => {
      cell.classList.add("cf-frozen-col");
      if (isLastFrozen) cell.classList.add("cf-frozen-col-last");
      cell.style.setProperty("position", "sticky", "important");
      cell.style.setProperty("left", leftPx, "important");
      cell.style.setProperty("width", widthPx, "important");
      cell.style.setProperty("min-width", widthPx, "important");
      cell.style.setProperty("max-width", widthPx, "important");
      cell.style.setProperty("z-index", isLastFrozen ? "18" : "17", "important");
    });

    left += width;
  });
}

function renderTable(options = {}) {
  const preserveFocus = options?.preserveFocus || null;
  const suppressCellFocus = Boolean(options?.suppressCellFocus);
  if (quotaEditor) closeQuotaEditor({ focusCell: false });
  if (mitEditor) closeMitEditor({ focusCell: false });
  if (optionEditor) closeOptionEditor({ focusCell: false });
  renderColgroup();

  function ensureTbody() {
    const table = document.querySelector(".cf-table");
    if (!table) return null;

    let tbody = document.getElementById("cf-tbody");
    if (tbody) return tbody;

    tbody = table.querySelector("tbody");
    if (!tbody) {
      tbody = document.createElement("tbody");
      table.appendChild(tbody);
    }

    tbody.id = "cf-tbody";
    return tbody;
  }

  renderHeaders();
  rebuildViewMap();

  const tbody = ensureTbody();
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!cfData.length) {
    cfData.push(createEmptyRow());
    markStructureDirty();
    rebuildViewMap();
  }

  viewMap.forEach((dataIndex, viewRowIndex) => {
    const row = cfData[dataIndex];
    const tr = document.createElement("tr");

    const tdIndex = document.createElement("td");
    tdIndex.className = "cf-row-index";
    tdIndex.textContent = String(viewRowIndex + 1);
    tdIndex.dataset.rowIndex = String(viewRowIndex);
    tdIndex.addEventListener("click", handleRowIndexClick);
    tdIndex.addEventListener("contextmenu", (e) => openContextMenu(e, { type: "row", viewRow: viewRowIndex }));
    tr.appendChild(tdIndex);

    CF_COLUMNS.forEach((col, colIndex) => {
      const td = document.createElement("td");
      td.classList.add("cf-cell");

      const lbl = normalizeLabel(col.label);
      if (/(razao|social|obs|observ|controle|histor|descricao)/.test(lbl)) td.classList.add("cf-cell--obs");
      if (/(cod|cód|trib|tipo|num)/.test(lbl)) td.classList.add("cf-cell--tiny");
      if (isQuotaColumnKey(col.key)) td.classList.add("cf-cell--quota");
      if (isMitGenerationColumnKey(col.key)) td.classList.add("cf-cell--select");
      if (isSelectColumnKey(col.key)) td.classList.add("cf-cell--select");

      if (isCellMarkedDirty(row, col.key)) {
        td.classList.add("is-dirty");
      }

      td.contentEditable = "false";
      td.tabIndex = 0;
      const rawCellValue = String(row[col.key] ?? "");
      if (isQuotaColumnKey(col.key)) {
        td.title = "Abrir seletor de quota";
        td.innerHTML = "";
        const trigger = document.createElement("button");
        trigger.type = "button";
        trigger.className = rawCellValue.trim() ? "cf-quota-trigger is-filled" : "cf-quota-trigger";
        trigger.innerHTML = `
          <span class="cf-quota-trigger__label">${rawCellValue.trim() || "Selecionar"}</span>
          <span class="cf-quota-trigger__icon">▾</span>
        `;
        trigger.addEventListener("mousedown", (ev) => ev.stopPropagation());
        trigger.addEventListener("click", (ev) => {
          ev.stopPropagation();
          setSingleActiveCell(viewRowIndex, colIndex);
          openQuotaEditor(viewRowIndex, colIndex);
        });
        td.appendChild(trigger);
      } else if (isMitGenerationColumnKey(col.key)) {
        td.title = "Abrir opções de MIT - geração";
        td.innerHTML = "";
        const trigger = document.createElement("button");
        trigger.type = "button";
        trigger.className = rawCellValue.trim() ? "cf-quota-trigger is-filled" : "cf-quota-trigger";
        trigger.innerHTML = `
          <span class="cf-quota-trigger__label">${rawCellValue.trim() || "Selecionar"}</span>
          <span class="cf-quota-trigger__icon">▾</span>
        `;
        trigger.addEventListener("mousedown", (ev) => ev.stopPropagation());
        trigger.addEventListener("click", (ev) => {
          ev.stopPropagation();
          setSingleActiveCell(viewRowIndex, colIndex);
          openMitEditor(viewRowIndex, colIndex);
        });
        td.appendChild(trigger);
      } else if (isSelectColumnKey(col.key)) {
        td.title = "Abrir lista suspensa";
        td.innerHTML = "";
        const trigger = document.createElement("button");
        trigger.type = "button";
        trigger.className = rawCellValue.trim() ? "cf-select-trigger is-filled" : "cf-select-trigger";
        trigger.innerHTML = `
          <span class="cf-select-trigger__label">${rawCellValue.trim() || "Selecionar"}</span>
          <span class="cf-select-trigger__icon">▾</span>
        `;
        trigger.addEventListener("mousedown", (ev) => ev.stopPropagation());
        trigger.addEventListener("click", (ev) => {
          ev.stopPropagation();
          setSingleActiveCell(viewRowIndex, colIndex);
          openOptionEditor(viewRowIndex, colIndex);
        });
        td.appendChild(trigger);
      } else {
        td.textContent = rawCellValue;
      }

      td.dataset.rowIndex = String(viewRowIndex);
      td.dataset.colIndex = String(colIndex);
      td.dataset.colKey = col.key;

      td.addEventListener("click", handleCellClick);
      td.addEventListener("dblclick", () => enterEditMode(viewRowIndex, colIndex, null, true));
      td.addEventListener("mousedown", handleCellMouseDown);
      td.addEventListener("mouseenter", handleCellMouseEnter);
      td.addEventListener("input", handleEditingInput);
      td.addEventListener("blur", () => {
        if (editing && editing.el === td) commitEdit();
      });
      td.addEventListener("contextmenu", (e) => openContextMenu(e, { type: "cell", viewRow: viewRowIndex, colIndex }));

      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  const maxRow = Math.max(0, viewMap.length - 1);
  const maxCol = Math.max(0, CF_COLUMNS.length - 1);
  const r = clamp(activeRow, 0, maxRow);
  const c = clamp(activeCol, 0, maxCol);

  if (!selectionAnchor) {
    setTimeout(() => {
      if (!suppressCellFocus) {
        setSingleActiveCell(r, c);
      }
      refreshDirtyVisuals();
    }, 0);
  } else {
    const aR = clamp(selectionAnchor.row, 0, maxRow);
    const aC = clamp(selectionAnchor.col, 0, maxCol);
    setTimeout(() => {
      applySelection(aR, aC, r, c);
      refreshDirtyVisuals();
    }, 0);
  }

  applyFindHighlights();
  requestAnimationFrame(() => applyContFlowFrozenColumns());
  syncPainelTributarioFromContFlow();

  if (preserveFocus?.element) {
    const targetEl = preserveFocus.element;
    const start = Number.isFinite(preserveFocus.start) ? preserveFocus.start : null;
    const end = Number.isFinite(preserveFocus.end) ? preserveFocus.end : start;
    setTimeout(() => {
      if (!targetEl || typeof targetEl.focus !== "function") return;
      targetEl.focus({ preventScroll: true });
      if (
        targetEl === document.activeElement &&
        typeof targetEl.setSelectionRange === "function" &&
        start != null
      ) {
        targetEl.setSelectionRange(start, end ?? start);
      }
    }, 0);
  }
}

/* ===========================
   EVENTOS DE CÉLULA
=========================== */
function handleRowIndexClick(e) {
  const r = parseInt(e.currentTarget.dataset.rowIndex, 10);
  if (Number.isNaN(r) || !viewMap.length) return;
  const maxCol = CF_COLUMNS.length - 1;
  selectionAnchor = { row: r, col: 0 };
  applySelection(r, 0, r, maxCol);
}

function handleCellClick(e) {
  if (suppressClickSelect) return;
  const cell = e.currentTarget;
  const rowIndex = parseInt(cell.dataset.rowIndex, 10);
  const colIndex = parseInt(cell.dataset.colIndex, 10);
  if (Number.isNaN(rowIndex) || Number.isNaN(colIndex)) return;
  setSingleActiveCell(rowIndex, colIndex);
}

function handleCellMouseDown(e) {
  if (e.button !== 0) return;
  const cell = e.currentTarget;
  const rowIndex = parseInt(cell.dataset.rowIndex, 10);
  const colIndex = parseInt(cell.dataset.colIndex, 10);
  if (Number.isNaN(rowIndex) || Number.isNaN(colIndex)) return;

  if (quotaEditor) closeQuotaEditor({ focusCell: false });
  if (mitEditor) closeMitEditor({ focusCell: false });
  if (optionEditor) closeOptionEditor({ focusCell: false });
  if (editing) commitEdit();

  e.preventDefault();
  suppressClickSelect = true;

  setTimeout(() => (suppressClickSelect = false), 0);

  mouseSelecting = true;
  selectionAnchor = { row: rowIndex, col: colIndex };
  applySelection(rowIndex, colIndex, rowIndex, colIndex);
}

function handleCellMouseEnter(e) {
  if (!mouseSelecting || !selectionAnchor) return;
  const cell = e.currentTarget;
  const rowIndex = parseInt(cell.dataset.rowIndex, 10);
  const colIndex = parseInt(cell.dataset.colIndex, 10);
  if (Number.isNaN(rowIndex) || Number.isNaN(colIndex)) return;
  applySelection(selectionAnchor.row, selectionAnchor.col, rowIndex, colIndex);
}

/* ===========================
   KEYBOARD
=========================== */
function isSpaceKey(e) {
  return e.code === "Space" || e.key === " " || e.key === "Spacebar";
}

function clearSelectionValues() {
  if (!viewMap.length) return;

  const { rowMin, rowMax, colMin, colMax } = getSelectionBoundsFallback();

  const changes = [];
  for (let vr = rowMin; vr <= rowMax; vr++) {
    const di = viewMap[vr];
    if (di == null) continue;
    for (let ci = colMin; ci <= colMax; ci++) {
      const colKey = CF_COLUMNS[ci]?.key;
      if (!colKey) continue;
      const before = String(cfData[di][colKey] ?? "");
      const after = "";
      if (before !== after) {
        cfData[di][colKey] = after;
        changes.push({ dataIndex: di, colKey, before, after });
      }
    }
  }

  if (changes.length) {
    pushUndo({ type: "batch", changes });
    markDirtyChanges(changes);
  }

  renderTable();
}

async function handleGlobalKeyDown(e) {
  if (getActiveWorkbookView() !== "contflow") return;

  if (quotaEditor) {
    if (e.key === "Escape") {
      e.preventDefault();
      closeQuotaEditor();
      return;
    }
    if (e.key === "Tab" || e.key === "Enter") {
      e.preventDefault();
      const dataIndex = viewMap[quotaEditor.viewRow];
      const col = CF_COLUMNS[quotaEditor.colIndex];
      const pendingValue = getQuotaEditorPendingValue(quotaEditor);
      closeQuotaEditor({ focusCell: false });
      if (dataIndex != null && col) {
        applyCellValueChange(
          dataIndex,
          col.key,
          pendingValue,
          quotaEditor.viewRow,
          quotaEditor.colIndex
        );
      }
      return;
    }
  }

  if (mitEditor) {
    if (e.key === "Escape") {
      e.preventDefault();
      closeMitEditor();
      return;
    }
    return;
  }

  if (optionEditor) {
    if (e.key === "Escape") {
      e.preventDefault();
      closeOptionEditor();
      return;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      const input = optionEditor.el?.querySelector(".cf-option-editor__input");
      const dataIndex = viewMap[optionEditor.viewRow];
      const col = CF_COLUMNS[optionEditor.colIndex];
      closeOptionEditor({ focusCell: false });
      if (dataIndex != null && col) {
        applyCellValueChange(
          dataIndex,
          col.key,
          String(input?.value || ""),
          optionEditor.viewRow,
          optionEditor.colIndex
        );
      }
      return;
    }
    return;
  }

  if ((e.ctrlKey || e.metaKey) && (e.key === "f" || e.key === "F")) {
    e.preventDefault();
    openFindUI();
    return;
  }

  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === "z" || e.key === "Z")) {
    e.preventDefault();
    undo();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && (e.key === "y" || e.key === "Y")) {
    e.preventDefault();
    redo();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "Z" || e.key === "z")) {
    e.preventDefault();
    redo();
    return;
  }

  if (editing) {
    if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      commitEdit();
      const targetRow = clamp(activeRow + 1, 0, viewMap.length - 1);
      setSingleActiveCell(targetRow, activeCol);
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      commitEdit();
      const maxCol = CF_COLUMNS.length - 1;
      const targetCol = clamp(activeCol + (e.shiftKey ? -1 : 1), 0, maxCol);
      setSingleActiveCell(activeRow, targetCol);
      return;
    }
    return;
  }

  if (!viewMap.length) return;

  const maxRow = viewMap.length - 1;
  const maxCol = CF_COLUMNS.length - 1;

  const isShift = e.shiftKey;
  const isCtrl = e.ctrlKey || e.metaKey;

  const grid = document.querySelector(".cf-grid-container");
  const activeEl = document.activeElement;

  const insideGrid =
    (activeEl && activeEl.classList && activeEl.classList.contains("cf-cell")) ||
    (activeEl && activeEl.closest && activeEl.closest(".cf-grid-container")) ||
    (grid && activeEl && grid.contains(activeEl));

  if (!insideGrid) return;

  if (cfFilterDD && cfFilterDD.style.display !== "none") {
    if (e.key === "Escape") {
      hideFilterDropdown();
    }
  }

  if (isTypingKey(e)) {
    e.preventDefault();
    enterEditMode(activeRow, activeCol, e.key, false);
    return;
  }

  if (e.key === "F2") {
    e.preventDefault();
    enterEditMode(activeRow, activeCol, null, false);
    return;
  }

  if (isCtrl && !isShift && (e.key === "c" || e.key === "C")) {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;
    e.preventDefault();
    await copySelection();
    return;
  }
  if (isCtrl && !isShift && (e.key === "v" || e.key === "V")) {
    e.preventDefault();
    await pasteFromClipboard();
    return;
  }

  if ((e.key === "Delete" || e.key === "Backspace") && !isCtrl) {
    e.preventDefault();
    clearSelectionValues();
    return;
  }

  if (isCtrl && isShift && e.key === "Enter") {
    e.preventDefault();
    insertRowBelow();
    return;
  }

  if (isCtrl && !isShift && (e.key === "d" || e.key === "D")) {
    e.preventDefault();
    duplicateSelectedRows();
    return;
  }

  if (isCtrl && isShift && (e.key === "=" || e.key === "+")) {
    e.preventDefault();
    const name = prompt("Nome da nova coluna:", `Coluna ${CF_COLUMNS.length + 1}`);
    if (name !== null) addColumnAfter(activeCol, name);
    return;
  }
  if (isCtrl && isShift && e.key === "-") {
    e.preventDefault();
    deleteColumn(activeCol);
    return;
  }

  if (e.key === "Enter") {
    e.preventDefault();
    let targetRow = activeRow + (e.shiftKey ? -1 : 1);
    targetRow = clamp(targetRow, 0, maxRow);

    if (!e.shiftKey && activeRow === maxRow) {
      const newRow = createEmptyRow();
      cfData.push(newRow);
      pushUndo({ type: "rows_insert", at: cfData.length - 1, rows: [deepClone(newRow)] });
      markStructureDirty();
      rebuildViewMap();
      renderTable();
      targetRow = clamp(activeRow + 1, 0, viewMap.length - 1);
    }

    selectionAnchor = null;
    setSingleActiveCell(targetRow, activeCol);
    return;
  }

  if (e.key === "Tab") {
    e.preventDefault();
    let targetRow = activeRow;
    let targetCol = activeCol + (e.shiftKey ? -1 : 1);

    if (targetCol > maxCol) {
      targetCol = 0;
      targetRow = clamp(activeRow + 1, 0, maxRow);
    } else if (targetCol < 0) {
      targetCol = maxCol;
      targetRow = clamp(activeRow - 1, 0, maxRow);
    }

    selectionAnchor = null;
    setSingleActiveCell(targetRow, targetCol);
    return;
  }

  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
    e.preventDefault();

    let dRow = 0;
    let dCol = 0;
    if (e.key === "ArrowUp") dRow = -1;
    if (e.key === "ArrowDown") dRow = 1;
    if (e.key === "ArrowLeft") dCol = -1;
    if (e.key === "ArrowRight") dCol = 1;

    let targetRow = activeRow + dRow;
    let targetCol = activeCol + dCol;

      if (isCtrl) {
        const jumped = ctrlJump(activeRow, activeCol, dRow, dCol);
        targetRow = jumped.r;
        targetCol = jumped.c;
    } else {
      targetRow = clamp(targetRow, 0, maxRow);
      targetCol = clamp(targetCol, 0, maxCol);
    }

    if (isShift) expandSelectionTo(targetRow, targetCol);
    else {
      selectionAnchor = null;
      setSingleActiveCell(targetRow, targetCol);
    }
    return;
  }

  if (isSpaceKey(e) && isShift && !isCtrl) {
    e.preventDefault();
    selectionAnchor = { row: activeRow, col: 0 };
    applySelection(activeRow, 0, activeRow, maxCol);
    return;
  }

  if (isSpaceKey(e) && isCtrl && !isShift) {
    e.preventDefault();
    selectionAnchor = { row: 0, col: activeCol };
    applySelection(0, activeCol, maxRow, activeCol);
    return;
  }

  if ((e.key === "a" || e.key === "A") && isCtrl) {
    e.preventDefault();
    selectionAnchor = { row: 0, col: 0 };
    applySelection(0, 0, maxRow, maxCol);
  }
}

/* ===========================
   LINHAS
=========================== */
function insertRowBelow() {
  if (!viewMap.length) return;
  const sel = getSelectionBoundsFallback();
  const targetViewRow = sel.rowMax;
  const afterDataIndex = viewMap[targetViewRow];
  if (afterDataIndex == null) return;

  const at = afterDataIndex + 1;
  const newRow = createEmptyRow();

  cfData.splice(at, 0, newRow);
  pushUndo({ type: "rows_insert", at, rows: [deepClone(newRow)] });
  markStructureDirty();

  rebuildViewMap();
  renderTable();

  const newView = viewMap.indexOf(at);
  setSingleActiveCell(newView >= 0 ? newView : clamp(targetViewRow + 1, 0, viewMap.length - 1), activeCol);
}

function deleteSelectedRows() {
  const dataIdx = getSelectedDataIndices();
  if (!dataIdx.length) return alert("Nenhuma seleção ativa para excluir.");

  const ok = confirm(`Excluir ${dataIdx.length} linha(s)?`);
  if (!ok) return;

  let start = dataIdx[0];
  let prev = dataIdx[0];
  let bucket = [deepClone(cfData[start])];
  const actions = [];

  for (let i = 1; i < dataIdx.length; i++) {
    const cur = dataIdx[i];
    if (cur === prev + 1) {
      bucket.push(deepClone(cfData[cur]));
      prev = cur;
    } else {
      actions.push({ at: start, rows: bucket });
      start = cur;
      prev = cur;
      bucket = [deepClone(cfData[cur])];
    }
  }
  actions.push({ at: start, rows: bucket });

  for (let i = actions.length - 1; i >= 0; i--) {
    const a = actions[i];
    cfData.splice(a.at, a.rows.length);
    pushUndo({ type: "rows_delete", at: a.at, rows: deepClone(a.rows) });
  }

  if (!cfData.length) cfData.push(createEmptyRow());

  markStructureDirty();
  rebuildViewMap();
  renderTable();

  setSingleActiveCell(clamp(activeRow, 0, viewMap.length - 1), clamp(activeCol, 0, CF_COLUMNS.length - 1));
}

function duplicateSelectedRows() {
  const dataIdx = getSelectedDataIndices();
  if (!dataIdx.length) return;

  const last = dataIdx[dataIdx.length - 1];
  const at = last + 1;

  const clones = dataIdx.map((i) => {
    const r = deepClone(cfData[i]);
    r.__id = genId();
    return r;
  });

  cfData.splice(at, 0, ...clones);
  pushUndo({ type: "rows_insert", at, rows: deepClone(clones) });
  markStructureDirty();

  rebuildViewMap();
  renderTable();

  const startView = viewMap.indexOf(at);
  if (startView >= 0) {
    selectionAnchor = { row: startView, col: 0 };
    applySelection(startView, 0, startView + clones.length - 1, CF_COLUMNS.length - 1);
  }
}

/* ===========================
   IMPORT / EXPORT
=========================== */
function detectDelimiter(firstLine) {
  const countComma = (firstLine.match(/,/g) || []).length;
  const countSemi = (firstLine.match(/;/g) || []).length;
  return countSemi > countComma ? ";" : ",";
}

function parseCSVToRaw(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (!lines.length) return [];
  const delimiter = detectDelimiter(lines[0]);
  return lines.map((line) => line.split(delimiter).map((part) => part.replace(/^"|"$/g, "").trim()));
}

function parseExcelSheetToRaw(sheet) {
  if (typeof XLSX === "undefined") throw new Error("Biblioteca XLSX não carregada.");
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
}

function rawToData(rawRows) {
  if (!rawRows || !rawRows.length) return { cols: [], rows: [] };

  const headerRow = rawRows[0];
  const labels = (headerRow || []).map((h) => canonicalContFlowLabel(h));
  const cols = ensureUniqueKeys(
    labels
      .filter((h) => h !== "")
      .map((label) => ({ label, key: slugKeyFromLabel(label) }))
  );

  const rows = rawRows.slice(1).map((cells) => {
    const row = {};
    cols.forEach((c, i) => (row[c.key] = cells[i] ?? ""));
    row.__id = genId();
    return row;
  }).filter((row) =>
    cols.some((c) => String(row[c.key] ?? "").trim() !== "")
  );

  return { cols, rows };
}

function toCSV(dataIndices) {
  const delimiter = ";";
  const header = CF_COLUMNS.map((col) => col.label).join(delimiter);

  const rows = dataIndices.map((di) => {
    const row = cfData[di];
    return CF_COLUMNS.map((col) => {
      let value = row[col.key] ?? "";
      value = String(value).replace(/"/g, '""');
      return `"${value}"`;
    }).join(delimiter);
  });

  return [header, ...rows].join("\r\n");
}

function exportToXLSX(dataIndices) {
  if (typeof XLSX === "undefined") {
    alert("Não foi possível exportar XLSX (biblioteca XLSX não carregou).");
    return;
  }

  const header = CF_COLUMNS.map((col) => col.label);
  const rows = dataIndices.map((di) => {
    const row = cfData[di];
    return CF_COLUMNS.map((col) => row[col.key] ?? "");
  });

  const aoa = [header, ...rows];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "ContFlow");

  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `contflow_${stamp}.xlsx`);
}

function chooseMergeKey(colSet) {
  const byLabel = (re) => (colSet || []).find((c) => re.test(normalizeLabel(c.label)));
  return byLabel(/\bcod\b|cód/) || byLabel(/cnpj/) || byLabel(/cpf/) || (colSet && colSet[0]) || null;
}

function mergeImportRows(importCols, importRows) {
  CF_COLUMNS = unionColumnsByLabel(CF_COLUMNS, importCols);
  CF_COLUMNS = ensureUniqueKeys(CF_COLUMNS);
  CF_COLUMNS.forEach((c) => setDefaultWidthForCol(c.key));

  cfData = coerceRowsToCurrentColumns(cfData);

  const importMap = new Map(
    (importCols || []).map((c) => [normalizeLabel(canonicalContFlowLabel(c.label)), c.key])
  );

  const incoming = (importRows || []).map((r) => {
    const out = {};
    CF_COLUMNS.forEach((c) => (out[c.key] = ""));

      CF_COLUMNS.forEach((c) => {
      const ik = importMap.get(normalizeLabel(canonicalContFlowLabel(c.label)));
      if (ik && r[ik] != null) {
        out[c.key] = String(r[ik]).trim();
      }
    });

    out.__id = genId();
    return out;
  });

  const keyCol = chooseMergeKey(CF_COLUMNS);
  if (!keyCol) {
    const at = cfData.length;
    cfData.push(...incoming);
    pushUndo({ type: "rows_insert", at, rows: deepClone(incoming) });
    markStructureDirty();
    return;
  }

  const keyKey = keyCol.key;
  const index = new Map();

  cfData.forEach((r, i) => {
    const k = String(r[keyKey] || "").trim().toLowerCase();
    if (k) index.set(k, i);
  });

  const changes = [];
  const inserted = [];

  incoming.forEach((r) => {
    const k = String(r[keyKey] || "").trim().toLowerCase();

    if (!k || !index.has(k)) {
      inserted.push(r);
      return;
    }

    const i = index.get(k);
    const baseRow = cfData[i];

    CF_COLUMNS.forEach((c) => {
      const newVal = String(r[c.key] || "").trim();

      if (!newVal) return;

      const before = String(baseRow[c.key] || "").trim();
      if (before === newVal) return;

      baseRow[c.key] = newVal;

      changes.push({
        dataIndex: i,
        colKey: c.key,
        before,
        after: newVal,
      });
    });
  });

  if (inserted.length) {
    const at = cfData.length;
    cfData.push(...inserted);

    pushUndo({
      type: "rows_insert",
      at,
      rows: deepClone(inserted),
    });

    markStructureDirty();
  }

  if (changes.length) {
    pushUndo({ type: "batch", changes });

    changes.forEach((c) => {
      markCellDirty(c.dataIndex, c.colKey);
    });
    refreshDirtyVisuals();
  }
}

function handleImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;

  const name = file.name.toLowerCase();

  const modeRaw = prompt(
    "Importação:\n1 = Substituir\n2 = Anexar\n3 = Mesclar por chave (Cód./CNPJ/primeira coluna)\n\nDigite 1, 2 ou 3:",
    "1"
  );
  if (!modeRaw) return;
  const mode = String(modeRaw).trim();

  const finish = ({ cols, rows }) => {
    if (!cols.length) return alert("Arquivo sem cabeçalho válido.");

    if (mode === "1") {
      const before = snapshotState();

      CF_COLUMNS = ensureUniqueKeys(sanitizeContFlowColumns(cols));
      forceDefaultColumns(getRequiredContFlowColumns());

      CF_COLUMNS.forEach((c) => setDefaultWidthForCol(c.key));
      cfData = coerceRowsToCurrentColumns(rows);

      sortState = null;
      filters = {};

      const after = snapshotState();
      pushUndo({ type: "snapshot", before, after });
      markStructureDirty();
    } else if (mode === "2") {
      const before = snapshotState();

      CF_COLUMNS = unionColumnsByLabel(CF_COLUMNS, sanitizeContFlowColumns(cols));
      forceDefaultColumns(getRequiredContFlowColumns());

      CF_COLUMNS.forEach((c) => setDefaultWidthForCol(c.key));

      const importMap = new Map(
        cols.map((c) => [normalizeLabel(canonicalContFlowLabel(c.label)), c.key])
      );
      const incoming = rows.map((r) => {
        const out = createEmptyRow();
        CF_COLUMNS.forEach((c) => {
          const ik = importMap.get(normalizeLabel(canonicalContFlowLabel(c.label)));
          if (ik && r[ik] != null) out[c.key] = r[ik];
        });
        out.__id = genId();
        return out;
      });

      const at = cfData.length;
      cfData.push(...incoming);
      pushUndo({ type: "rows_insert", at, rows: deepClone(incoming) });

      const after = snapshotState();
      pushUndo({ type: "snapshot", before, after });
      markStructureDirty();
    } else {
      const before = snapshotState();
      mergeImportRows(cols, rows);
      forceDefaultColumns(getRequiredContFlowColumns());
      const after = snapshotState();
      pushUndo({ type: "snapshot", before, after });
      markStructureDirty();
    }

    rebuildViewMap();
    activeRow = 0;
    activeCol = 0;
    selectionAnchor = null;

    renderTable();
  };

  const readCSV = () => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target.result;
        const raw = parseCSVToRaw(text);
        const parsed = rawToData(raw);
        finish(parsed);
      } catch (err) {
        console.error(err);
        alert("Não foi possível importar CSV.");
      }
    };
    reader.readAsText(file, "utf-8");
  };

  const readXLSX = () => {
    if (typeof XLSX === "undefined") return alert("XLSX não carregou (biblioteca XLSX).");

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target.result);
        const wb = XLSX.read(data, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const raw = parseExcelSheetToRaw(sheet);
        const parsed = rawToData(raw);
        finish(parsed);
      } catch (err) {
        console.error(err);
        alert("Não foi possível importar XLS/XLSX.");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  if (name.endsWith(".csv")) readCSV();
  else if (name.endsWith(".xls") || name.endsWith(".xlsx")) readXLSX();
  else alert("Formato não suportado. Use CSV, XLS ou XLSX.");

  e.target.value = "";
}

function handleExportCSV() {
  const dataIndices = viewMap.slice();
  if (!dataIndices.length) {
    const ok = confirm("A visão está vazia (filtros?). Exportar mesmo assim?");
    if (!ok) return;
  }

  const csv = toCSV(dataIndices);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = `contflow_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function handleExportXLSX() {
  const dataIndices = viewMap.slice();
  if (!dataIndices.length) {
    const ok = confirm("A visão está vazia (filtros?). Exportar mesmo assim?");
    if (!ok) return;
  }
  exportToXLSX(dataIndices);
}

/* ===========================
   SAVE / LOAD API ONLY
=========================== */
function initBroadcast() {
  try {
    if (typeof BroadcastChannel !== "undefined") {
      cfBC = new BroadcastChannel(CF_BC_NAME);
    }
  } catch (_) {
    cfBC = null;
  }
}

function stableStringify(obj) {
  const seen = new WeakSet();
  const stringify = (v) => {
    if (v === null || typeof v !== "object") return v;
    if (seen.has(v)) return "[Circular]";
    seen.add(v);

    if (Array.isArray(v)) return v.map(stringify);

    const keys = Object.keys(v).sort();
    const out = {};
    keys.forEach((k) => (out[k] = stringify(v[k])));
    return out;
  };
  return JSON.stringify(stringify(obj));
}

function summarizeRow(r) {
  const codKey = findColKeyByLabelRegex(/\bcod\b|cód/);
  const razKey = findColKeyByLabelRegex(/razao|razão|social/);
  const docKey = findColKeyByLabelRegex(/cnpj|cpf/);

  const cod = codKey ? String(r?.[codKey] ?? "").trim() : "";
  const raz = razKey ? String(r?.[razKey] ?? "").trim() : "";
  const doc = docKey ? String(r?.[docKey] ?? "").trim() : "";

  return {
    id: String(r?.__id ?? ""),
    cod,
    razao: raz,
    doc,
    label: [cod, raz, doc].filter(Boolean).join(" · ").trim(),
  };
}

function computeDelta(prevPayload, nextPayload) {
  const prevRows = Array.isArray(prevPayload?.data) ? prevPayload.data : [];
  const nextRows = Array.isArray(nextPayload?.data) ? nextPayload.data : [];

  const prevMap = new Map();
  prevRows.forEach((r) => {
    const id = String(r?.__id ?? "");
    if (!id) return;
    prevMap.set(id, stableStringify(r));
  });

  const nextMap = new Map();
  nextRows.forEach((r) => {
    const id = String(r?.__id ?? "");
    if (!id) return;
    nextMap.set(id, stableStringify(r));
  });

  const added = [];
  const changed = [];
  const removed = [];

  nextRows.forEach((r) => {
    const id = String(r?.__id ?? "");
    if (!id) return;
    if (!prevMap.has(id)) {
      added.push(summarizeRow(r));
      return;
    }
    const beforeSig = prevMap.get(id);
    const afterSig = nextMap.get(id);
    if (beforeSig !== afterSig) changed.push(summarizeRow(r));
  });

  prevRows.forEach((r) => {
    const id = String(r?.__id ?? "");
    if (!id) return;
    if (!nextMap.has(id)) removed.push(summarizeRow(r));
  });

  return { added, changed, removed };
}

function publishContFlowUpdate(eventPayload) {
  try {
    if (cfBC) cfBC.postMessage(eventPayload);
  } catch (_) {}
}

async function saveBase(silent = false, options = {}) {
  if (saveInFlight) {
    queuedSaveAfterFlight = true;
    return;
  }

  saveInFlight = true;

  try {
    if (editing) commitEdit();

    const payload = buildServerPayload();
    const prev = lastSavedPayload ? deepClone(lastSavedPayload) : null;
    createLocalBackupSnapshot("before_local_save", payload);

    const responsePayload = await persistBaseToApi(payload);

    if (responsePayload && typeof responsePayload === "object") {
      hydrateContFlowFromApiPayload(responsePayload);
      saveLocalDraft(buildServerPayload());
    } else {
      lastSavedPayload = deepClone(payload);
      saveLocalDraft(payload);
      clearDirtyState();
    }

    syncPainelTributarioFromContFlow(true, { persist: true });

    const delta = computeDelta(prev, payload);

    publishContFlowUpdate({
      ts: new Date().toISOString(),
      kind: "contflow_update",
      saveMode: String(options?.mode || "base"),
      summary: {
        added: delta.added.length,
        changed: delta.changed.length,
        removed: delta.removed.length,
      },
      delta: {
        added: delta.added.slice(0, 60),
        changed: delta.changed.slice(0, 60),
        removed: delta.removed.slice(0, 60),
      },
    });
    if (!silent) {
      const mode = String(options?.mode || "base");
      if (mode === "cells") {
        alert("Células salvas 💾");
      } else {
        alert("Base salva 💾");
      }
    }
  } catch (err) {
    console.error("Erro ao salvar base na API:", err);

    if (Number(err?.status) === 403) {
      if (!silent) {
        alert(err?.payload?.error || "Apenas Leandro pode salvar a base completa. Use Salvar células.");
      }
      return;
    }

    const payload = buildServerPayload();
    lastSavedPayload = deepClone(payload);
    saveLocalDraft(payload);
    clearDirtyState();

    if (!silent) {
      const mode = String(options?.mode || "base");
      if (mode === "cells") {
        alert("API indisponível. Células salvas localmente neste navegador 💾");
      } else {
        alert("API indisponível. Base salva localmente neste navegador 💾");
      }
    }
    return;
  } finally {
    saveInFlight = false;

    if (queuedSaveAfterFlight) {
      queuedSaveAfterFlight = false;
      saveBase(true, { mode: "queued" }).catch((err) => console.error("Erro ao salvar fila pendente:", err));
    }
  }
}

/* ===========================
   MODAL
=========================== */
function openModal() {
  const backdrop = document.getElementById("cf-modal-backdrop");
  const modal = document.getElementById("cf-modal");
  if (!backdrop || !modal) return;
  if (!canManageContFlowBase(getSessionUser())) return;
  backdrop.classList.add("is-open");
  modal.classList.add("is-open");
  closeBackupsPanel();
}

function closeModal() {
  const backdrop = document.getElementById("cf-modal-backdrop");
  const modal = document.getElementById("cf-modal");
  if (!backdrop || !modal) return;
  backdrop.classList.remove("is-open");
  modal.classList.remove("is-open");
  closeBackupsPanel();
}

/* ===========================
   SIDEBAR
=========================== */
function setOverlayState() {
  const overlay = document.getElementById("overlay");
  if (!overlay) return;
  const open = document.body.classList.contains("sidebar-open");
  overlay.setAttribute("aria-hidden", open ? "false" : "true");
}

/* ===========================
   USERCARD
=========================== */
function renderUserCard() {
  const userCard = document.querySelector("[data-usercard]");
  if (!userCard) return;

  const elUserName = userCard.querySelector("[data-user-name]");
  const elUserRole = userCard.querySelector("[data-user-role]");
  const elUserAvatar = userCard.querySelector("[data-user-avatar]");

  const u = getSessionUser();

  if (!u) {
    elUserName && (elUserName.textContent = "Usuário");
    elUserRole && (elUserRole.textContent = "Deslogado");
    elUserAvatar && (elUserAvatar.textContent = "U");
    applyContFlowBaseAccess();
    return;
  }

  const nome = u.nome || u.name || "Usuário";
  const role = u.role || "user";

  elUserName && (elUserName.textContent = nome);
  elUserRole && (elUserRole.textContent = roleLabel(role));
  elUserAvatar && (elUserAvatar.textContent = avatarFromName(nome));
  applyContFlowBaseAccess();
}

/* ===========================
   HEADER INTERACTIONS
=========================== */
function bindHeaderInteractions() {
  const corner = document.getElementById("cf-corner-select");
  if (corner) {
    corner.onclick = () => {
      if (!viewMap.length) return;
      selectionAnchor = { row: 0, col: 0 };
      applySelection(0, 0, viewMap.length - 1, CF_COLUMNS.length - 1);
    };
    corner.oncontextmenu = (e) => openContextMenu(e, { type: "corner" });
  }

  const headers = document.querySelectorAll(".cf-col-header");
  headers.forEach((th) => {
    const idx = parseInt(th.dataset.colIndex, 10);
    if (Number.isNaN(idx)) return;

    th.onclick = (e) => {
      if (e.target && e.target.classList && e.target.classList.contains("cf-col-resizer")) return;
      if (e.target && e.target.classList && e.target.classList.contains("cf-filter-btn")) return;

      const col = CF_COLUMNS[idx];
      if (!col) return;

      if (e.shiftKey) promptFilter(col.key, col.label);
      else cycleSort(col.key);
    };

    th.oncontextmenu = (e) => openContextMenu(e, { type: "header", colIndex: idx });

    const res = th.querySelector(".cf-col-resizer");
    if (res) {
      res.onmousedown = (e) => {
        e.preventDefault();
        e.stopPropagation();

        const col = CF_COLUMNS[idx];
        if (!col) return;

        const startX = e.clientX;
        const startW = Number.isFinite(colWidths[col.key]) ? colWidths[col.key] : th.offsetWidth;

        const move = (ev) => {
          const dx = ev.clientX - startX;
          const w = clamp(startW + dx, 60, 900);
          colWidths[col.key] = w;
          renderColgroup();
          markConfigDirty();
        };

        const up = () => {
          window.removeEventListener("mousemove", move);
          window.removeEventListener("mouseup", up);
        };

        window.addEventListener("mousemove", move);
        window.addEventListener("mouseup", up);
      };
    }

    th.draggable = true;
    th.ondragstart = (e) => e.dataTransfer.setData("text/plain", String(idx));
    th.ondragover = (e) => e.preventDefault();
    th.ondrop = (e) => {
      e.preventDefault();
      const from = parseInt(e.dataTransfer.getData("text/plain"), 10);
      const to = idx;
      if (Number.isNaN(from) || Number.isNaN(to)) return;
      moveColumn(from, to);
    };
  });
}

/* ===========================
   CONTEXT MENU
=========================== */
function ensureCtxMenu() {
  if (ctxMenuEl) return ctxMenuEl;

  ctxMenuEl = document.createElement("div");
  ctxMenuEl.id = "cf-ctx-menu";
  ctxMenuEl.style.position = "fixed";
  ctxMenuEl.style.zIndex = "9999";
  ctxMenuEl.style.minWidth = "220px";
  ctxMenuEl.style.background = "rgba(2,6,23,0.98)";
  ctxMenuEl.style.border = "1px solid rgba(255,255,255,0.12)";
  ctxMenuEl.style.borderRadius = "12px";
  ctxMenuEl.style.boxShadow = "0 18px 50px rgba(0,0,0,.55)";
  ctxMenuEl.style.padding = "6px";
  ctxMenuEl.style.display = "none";

  document.body.appendChild(ctxMenuEl);

  document.addEventListener("click", () => hideCtxMenu());
  document.addEventListener("scroll", () => hideCtxMenu(), true);

  return ctxMenuEl;
}

function hideCtxMenu() {
  if (!ctxMenuEl) return;
  ctxMenuEl.style.display = "none";
  ctxMenuEl.innerHTML = "";
}

function addMenuItem(menu, label, fn, danger = false) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = label;
  btn.style.width = "100%";
  btn.style.textAlign = "left";
  btn.style.padding = "10px 10px";
  btn.style.borderRadius = "10px";
  btn.style.border = "0";
  btn.style.cursor = "pointer";
  btn.style.background = "transparent";
  btn.style.color = danger ? "#ffb4b4" : "#e8edf6";
  btn.style.font = "inherit";
  btn.onmouseenter = () => (btn.style.background = "rgba(255,255,255,0.06)");
  btn.onmouseleave = () => (btn.style.background = "transparent");
  btn.onclick = () => {
    hideCtxMenu();
    fn && fn();
  };
  menu.appendChild(btn);
}

function addMenuSep(menu) {
  const hr = document.createElement("div");
  hr.style.height = "1px";
  hr.style.margin = "6px 0";
  hr.style.background = "rgba(255,255,255,0.08)";
  menu.appendChild(hr);
}

function openContextMenu(e, ctx) {
  e.preventDefault();
  if (editing) commitEdit();

  const menu = ensureCtxMenu();
  menu.innerHTML = "";

  menu.style.left = clamp(e.clientX, 8, window.innerWidth - 240) + "px";
  menu.style.top = clamp(e.clientY, 8, window.innerHeight - 260) + "px";
  menu.style.display = "block";

  if (ctx.type === "cell") {
    const { viewRow, colIndex } = ctx;
    setSingleActiveCell(viewRow, colIndex);

    addMenuItem(menu, "Editar (F2)", () => enterEditMode(viewRow, colIndex, null, true));
    addMenuItem(menu, "Copiar", () => copySelection());
    addMenuItem(menu, "Colar", () => pasteFromClipboard());
    addMenuSep(menu);

    addMenuItem(menu, "Inserir linha abaixo", () => insertRowBelow());
    addMenuItem(menu, "Duplicar linha(s) (Ctrl+D)", () => duplicateSelectedRows());
    addMenuItem(menu, "Excluir linha(s)", () => deleteSelectedRows(), true);

    addMenuSep(menu);

    addMenuItem(menu, "Nova coluna à direita", () => {
      const name = prompt("Nome da nova coluna:", `Coluna ${CF_COLUMNS.length + 1}`);
      if (name !== null) addColumnAfter(activeCol, name);
    });
    addMenuItem(menu, "Renomear coluna", () => {
      const col = CF_COLUMNS[activeCol];
      const name = prompt("Novo nome da coluna:", col?.label || "");
      if (name) renameColumn(activeCol, name);
    });
    addMenuItem(menu, "Excluir coluna", () => deleteColumn(activeCol), true);

    addMenuSep(menu);

    addMenuItem(menu, "Filtro dropdown", () => {
      const th = document.querySelector(`.cf-col-header[data-col-index="${colIndex}"]`);
      if (th) openFilterDropdownForHeader(th, colIndex);
    });

    addMenuItem(menu, "Filtrar por este valor (=)", () => {
      const di = viewMap[viewRow];
      const col = CF_COLUMNS[colIndex];
      const v = String(cfData[di]?.[col.key] ?? "");
      filters[col.key] = { mode: "equals", value: v, raw: "=" + v };
      rebuildViewMap();
      renderTable();
      markConfigDirty();
    });

    addMenuItem(menu, "Limpar filtros", () => clearAllFilters());
  } else if (ctx.type === "header") {
    const col = CF_COLUMNS[ctx.colIndex];
    addMenuItem(menu, `Ordenar: ${col.label}`, () => cycleSort(col.key));
    addMenuItem(menu, `Filtro dropdown: ${col.label}`, () => {
      const th = document.querySelector(`.cf-col-header[data-col-index="${ctx.colIndex}"]`);
      if (th) openFilterDropdownForHeader(th, ctx.colIndex);
    });
    addMenuItem(menu, `Filtro prompt: ${col.label}`, () => promptFilter(col.key, col.label));
    addMenuItem(menu, "Limpar filtros", () => clearAllFilters());

    addMenuSep(menu);

    addMenuItem(menu, "Nova coluna à direita", () => {
      const name = prompt("Nome da nova coluna:", `Coluna ${CF_COLUMNS.length + 1}`);
      if (name !== null) addColumnAfter(ctx.colIndex, name);
    });
    addMenuItem(menu, "Renomear coluna", () => {
      const name = prompt("Novo nome da coluna:", col.label);
      if (name) renameColumn(ctx.colIndex, name);
    });
    addMenuItem(menu, "Excluir coluna", () => deleteColumn(ctx.colIndex), true);
  } else if (ctx.type === "row") {
    setSingleActiveCell(ctx.viewRow, activeCol);
    addMenuItem(menu, "Inserir linha abaixo", () => insertRowBelow());
    addMenuItem(menu, "Duplicar linha(s)", () => duplicateSelectedRows());
    addMenuItem(menu, "Excluir linha(s)", () => deleteSelectedRows(), true);
  } else if (ctx.type === "corner") {
    addMenuItem(menu, "Selecionar tudo", () => {
      if (!viewMap.length) return;
      selectionAnchor = { row: 0, col: 0 };
      applySelection(0, 0, viewMap.length - 1, CF_COLUMNS.length - 1);
    });
    addMenuItem(menu, "Limpar filtros", () => clearAllFilters());
    addMenuItem(menu, "Salvar base agora", () => saveVersion());
    addMenuItem(menu, "Histórico de backups", () => restoreVersion());
  }
}

async function readClipboardText() {
  try {
    if (navigator.clipboard && navigator.clipboard.readText) {
      const text = await navigator.clipboard.readText();
      if (text != null && String(text) !== "") {
        clipboardTextCache = String(text);
        return clipboardTextCache;
      }
    }
  } catch (err) {
    console.warn("Clipboard indisponível, usando cache local.", err);
  }
  return clipboardTextCache || "";
}

/* ===========================
   FIND UI
=========================== */
function injectExtraStyles() {
  if (document.getElementById("cf-extra-styles")) return;
  const st = document.createElement("style");
  st.id = "cf-extra-styles";
  st.textContent = `
    .cf-cell.is-editing{ outline:2px solid rgba(78,204,163,.9)!important; outline-offset:-2px; background:var(--cf-active-bg)!important; box-shadow: inset 0 0 0 9999px var(--cf-active-bg); }
    .cf-cell.is-row-active{ background:var(--cf-row-active-bg); box-shadow: inset 0 0 0 9999px var(--cf-row-active-bg); }
    .cf-cell.is-col-active{ background:var(--cf-col-active-bg); box-shadow: inset 0 0 0 9999px var(--cf-col-active-bg); }
    .cf-cell.is-find-hit{ box-shadow: inset 0 0 0 9999px rgba(56,189,248,.12); }
    .cf-cell.is-find-current{ outline:2px solid rgba(56,189,248,.95)!important; outline-offset:-2px; }
    .cf-cell.is-dirty{ box-shadow: inset 0 0 0 9999px rgba(250,204,21,.10); border-color: rgba(250,204,21,.35)!important; }
    .cf-cell--quota{ cursor:default; padding:4px 6px!important; }
    .cf-cell--select{ cursor:default; padding:4px 6px!important; }
    .cf-inline-quota-select{ width:100%; min-height:32px; border-radius:10px; border:1px solid rgba(96,165,250,.35); background:#0f2741; color:#f8fbff; padding:0 10px; font:inherit; cursor:pointer; outline:none; }
    .cf-inline-quota-select:hover{ background:#163354; }
    .cf-inline-quota-select option{ color:#111827; }
    .cf-quota-trigger{ width:100%; display:flex; align-items:center; justify-content:space-between; gap:8px; height:32px; border-radius:10px; border:1px solid rgba(96,165,250,.35); background:#0f2741; color:#f8fbff; padding:0 10px; font:inherit; font-weight:700; cursor:pointer; }
    .cf-quota-trigger:hover{ background:#163354; }
    .cf-quota-trigger.is-filled{ background:#14304f; }
    .cf-quota-trigger__label{ overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .cf-quota-trigger__icon{ color:#bfdbfe; font-size:12px; flex:0 0 auto; }
    .cf-select-trigger{ width:100%; display:flex; align-items:center; justify-content:space-between; gap:8px; min-height:32px; border-radius:10px; border:1px solid rgba(148,163,184,.28); background:rgba(15,23,42,.92); color:#f8fbff; padding:0 10px; font:inherit; cursor:pointer; }
    .cf-select-trigger:hover{ background:rgba(30,41,59,.96); }
    .cf-select-trigger.is-filled{ border-color:rgba(56,189,248,.28); }
    .cf-select-trigger__label{ overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-align:left; }
    .cf-select-trigger__icon{ color:#bfdbfe; font-size:12px; flex:0 0 auto; }
    .cf-mobile-popover-open{ overflow:hidden; }
    .cf-quota-editor{ width:min(320px,calc(100vw - 20px)); max-height:min(82vh,640px); display:grid; grid-template-rows:auto auto minmax(0,1fr) auto; overflow:hidden; padding:16px; border-radius:18px; border:1px solid rgba(96,165,250,.18); background:linear-gradient(180deg,rgba(8,15,30,.985),rgba(9,19,37,.97)); box-shadow:0 28px 70px rgba(0,0,0,.46); backdrop-filter:blur(14px); overscroll-behavior:contain; }
    .cf-quota-editor__head{ display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:10px; }
    .cf-quota-editor__eyebrow{ font-size:10px; font-weight:800; letter-spacing:.12em; text-transform:uppercase; color:rgba(125,211,252,.82); margin-bottom:4px; }
    .cf-quota-editor__title{ font-weight:800; font-size:16px; line-height:1.1; color:#f8fbff; }
    .cf-quota-editor__value-badge{ max-width:120px; padding:7px 10px; border-radius:999px; border:1px solid rgba(255,255,255,.08); background:rgba(15,23,42,.9); color:rgba(226,232,240,.92); font-size:11px; font-weight:700; text-align:right; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .cf-quota-editor__subtitle{ font-size:12px; line-height:1.45; color:rgba(226,232,240,.72); margin-bottom:14px; }
    .cf-quota-editor__scroll{ min-height:0; overflow-y:auto; overflow-x:hidden; -webkit-overflow-scrolling:touch; touch-action:pan-y pinch-zoom; padding-right:2px; }
    .cf-quota-editor__options-label{ font-size:11px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; color:rgba(191,219,254,.82); margin-bottom:8px; }
    .cf-quota-editor__options{ display:grid; grid-template-columns:1fr; gap:8px; margin-bottom:14px; }
    .cf-quota-editor__option{ border:1px solid rgba(148,163,184,.18); background:linear-gradient(180deg,rgba(17,24,39,.94),rgba(15,23,42,.9)); color:#e8edf6; border-radius:14px; padding:11px 12px; cursor:pointer; font:inherit; text-align:left; transition:background .15s ease,border-color .15s ease,transform .15s ease,box-shadow .15s ease; display:flex; flex-direction:column; gap:2px; }
    .cf-quota-editor__option:hover{ background:linear-gradient(180deg,rgba(18,39,70,.98),rgba(14,30,55,.96)); border-color:rgba(56,189,248,.38); transform:translateY(-1px); box-shadow:0 8px 24px rgba(14,165,233,.12); }
    .cf-quota-editor__option.is-active{ background:linear-gradient(180deg,rgba(18,52,86,.98),rgba(18,46,74,.98)); border-color:rgba(34,197,94,.45); box-shadow:inset 0 0 0 1px rgba(34,197,94,.18),0 10px 24px rgba(34,197,94,.08); }
    .cf-quota-editor__option-title{ font-weight:800; font-size:14px; color:#f8fbff; }
    .cf-quota-editor__option-hint{ font-size:11px; color:rgba(191,219,254,.74); }
    .cf-quota-editor__divider{ height:1px; background:linear-gradient(90deg,rgba(96,165,250,.16),rgba(148,163,184,.05)); margin:4px 0 12px; }
    .cf-quota-editor__date-card{ border:1px solid rgba(56,189,248,.18); background:linear-gradient(180deg,rgba(10,23,42,.82),rgba(9,19,37,.72)); border-radius:15px; padding:12px; margin-bottom:12px; box-shadow:inset 0 1px 0 rgba(255,255,255,.03); }
    .cf-quota-editor__date-head{ display:flex; align-items:flex-start; justify-content:space-between; gap:10px; margin-bottom:10px; }
    .cf-quota-editor__date-label{ font-size:13px; font-weight:800; color:#f8fbff; }
    .cf-quota-editor__date-hint{ font-size:11px; color:rgba(191,219,254,.72); margin-top:2px; line-height:1.4; }
    .cf-quota-editor__date-preview{ padding:7px 10px; border-radius:999px; border:1px solid rgba(148,163,184,.18); background:rgba(15,23,42,.86); color:#e2e8f0; font-size:11px; font-weight:800; white-space:nowrap; }
    .cf-quota-editor__date-preview.is-empty{ color:rgba(148,163,184,.88); }
    .cf-quota-editor__field--date{ margin-bottom:8px; }
    .cf-quota-editor__date-actions{ display:flex; gap:8px; flex-wrap:wrap; }
    .cf-quota-editor__date-action{ border:1px solid rgba(148,163,184,.18); background:rgba(15,23,42,.86); color:#e8edf6; border-radius:11px; padding:8px 10px; cursor:pointer; font:inherit; font-size:12px; font-weight:800; transition:transform .15s ease,border-color .15s ease,background .15s ease; }
    .cf-quota-editor__date-action:hover{ transform:translateY(-1px); background:rgba(18,39,70,.94); border-color:rgba(56,189,248,.35); }
    .cf-quota-editor__field{ display:flex; flex-direction:column; gap:6px; font-size:12px; color:rgba(232,237,246,.8); margin-bottom:10px; }
    .cf-quota-editor__field span{ font-weight:700; color:rgba(226,232,240,.82); }
    .cf-quota-editor__field input,
    .cf-quota-editor__field select{ height:42px; border-radius:13px; border:1px solid rgba(148,163,184,.18); background:rgba(255,255,255,.05); color:#f8fbff; padding:0 12px; outline:none; box-shadow:inset 0 1px 0 rgba(255,255,255,.02); }
    .cf-quota-editor__field input:focus,
    .cf-quota-editor__field select:focus{ border-color:rgba(56,189,248,.5); box-shadow:0 0 0 3px rgba(14,165,233,.14); }
    .cf-quota-editor__field select option{ color:#111827; }
    .cf-quota-editor__footer{ display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:14px; flex:0 0 auto; padding-top:12px; padding-bottom:2px; background:linear-gradient(180deg,rgba(8,15,30,0),rgba(9,19,37,.98) 22%,rgba(9,19,37,.995) 100%); }
    .cf-quota-editor__footer-btn{ border:1px solid rgba(148,163,184,.18); color:#e8edf6; border-radius:13px; padding:11px 12px; cursor:pointer; font:inherit; font-weight:800; transition:transform .15s ease,border-color .15s ease,background .15s ease,box-shadow .15s ease; }
    .cf-quota-editor__footer-btn:hover{ transform:translateY(-1px); }
    .cf-quota-editor__footer-btn.is-ghost{ background:rgba(15,23,42,.86); }
    .cf-quota-editor__footer-btn.is-ghost:hover{ background:rgba(30,41,59,.96); border-color:rgba(148,163,184,.3); }
    .cf-quota-editor__footer-btn.is-primary{ background:linear-gradient(135deg,#0ea5e9,#2563eb); border-color:rgba(96,165,250,.38); color:#f8fbff; box-shadow:0 12px 28px rgba(37,99,235,.22); }
    .cf-quota-editor__footer-btn.is-primary:hover{ box-shadow:0 16px 32px rgba(37,99,235,.28); }
    .cf-option-editor{ width:300px; padding:14px; border-radius:16px; border:1px solid rgba(255,255,255,.12); background:rgba(2,6,23,.97); box-shadow:0 24px 60px rgba(0,0,0,.42); backdrop-filter:blur(12px); }
    .cf-option-editor__title{ font-weight:700; font-size:13px; color:#e8edf6; margin-bottom:12px; }
    .cf-option-editor__input{ width:100%; height:38px; border-radius:12px; border:1px solid rgba(255,255,255,.14); background:rgba(255,255,255,.06); color:#e8edf6; padding:0 10px; outline:none; }
    .cf-option-editor__list{ margin-top:12px; max-height:240px; overflow:auto; display:grid; gap:8px; }
    .cf-option-editor__item{ width:100%; text-align:left; border:1px solid rgba(255,255,255,.12); background:rgba(15,23,42,.92); color:#e8edf6; border-radius:12px; padding:10px 12px; cursor:pointer; font:inherit; }
    .cf-option-editor__item:hover,.cf-option-editor__item.is-active{ background:rgba(30,41,59,.98); border-color:rgba(56,189,248,.35); }
    .cf-option-editor__item.is-custom{ border-style:dashed; }
    .cf-option-editor__empty{ color:rgba(232,237,246,.65); font-size:12px; padding:8px 4px; }
    .cf-option-editor__footer{ display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:12px; }
    .cf-option-editor__footer button{ border:1px solid rgba(255,255,255,.12); background:rgba(15,23,42,.92); color:#e8edf6; border-radius:12px; padding:10px 12px; cursor:pointer; font:inherit; }
    .cf-option-editor__footer button:hover{ background:rgba(30,41,59,.96); }
    @media (max-width: 560px){
      .cf-quota-editor{ width:calc(100vw - 16px); padding:14px; border-radius:16px; }
      .cf-quota-editor.is-mobile{
        inset:8px!important;
        width:auto!important;
        height:auto!important;
        max-height:none!important;
        padding-bottom:92px;
        overflow-y:auto!important;
        overflow-x:hidden!important;
        -webkit-overflow-scrolling:touch;
        overscroll-behavior:contain;
      }
      .cf-quota-editor__head,
      .cf-quota-editor__date-head{ flex-direction:column; align-items:stretch; }
      .cf-quota-editor__value-badge,
      .cf-quota-editor__date-preview{ max-width:none; text-align:left; }
      .cf-quota-editor__subtitle{ margin-bottom:10px; }
      .cf-quota-editor__scroll{ min-height:0; padding-bottom:18px; }
      .cf-quota-editor.is-mobile .cf-quota-editor__footer{
        position:fixed;
        left:20px;
        right:20px;
        bottom:20px;
        z-index:2002;
        grid-template-columns:1fr;
        margin-top:0;
        padding:12px;
        border-radius:16px;
        border:1px solid rgba(96,165,250,.18);
        background:linear-gradient(180deg,rgba(8,15,30,.98),rgba(9,19,37,.995));
        box-shadow:0 18px 44px rgba(0,0,0,.34);
      }
      .cf-quota-editor__footer-btn{ min-height:44px; }
      .cf-quota-editor__custom-wrap{ margin-bottom:4px; }
      .cf-quota-editor.is-mobile::-webkit-scrollbar{ width:8px; }
      .cf-quota-editor.is-mobile::-webkit-scrollbar-thumb{ background:rgba(96,165,250,.35); border-radius:999px; }
    }
    #cf-corner-select{ z-index: 40 !important; }
    .cf-row-index{ z-index: 35 !important; }
    .cf-table thead th{ z-index: 30 !important; }
  `;
  document.head.appendChild(st);
}

function openFindUI() {
  injectExtraStyles();

  if (findUI) {
    findUI.style.display = "block";
    const input = findUI.querySelector("input");
    input && input.focus();
    return;
  }

  findUI = document.createElement("div");
  findUI.id = "cf-find-ui";
  findUI.style.position = "fixed";
  findUI.style.right = "18px";
  findUI.style.top = "88px";
  findUI.style.zIndex = "9998";
  findUI.style.background = "rgba(2,6,23,.96)";
  findUI.style.border = "1px solid rgba(255,255,255,.12)";
  findUI.style.borderRadius = "14px";
  findUI.style.boxShadow = "0 18px 50px rgba(0,0,0,.55)";
  findUI.style.padding = "10px";
  findUI.style.minWidth = "320px";
  findUI.style.display = "block";

  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.gap = "8px";
  row.style.alignItems = "center";

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Localizar… (Enter = próximo)";
  input.style.flex = "1";
  input.style.height = "34px";
  input.style.borderRadius = "10px";
  input.style.border = "1px solid rgba(255,255,255,.14)";
  input.style.background = "rgba(255,255,255,.06)";
  input.style.color = "#e8edf6";
  input.style.padding = "0 10px";
  input.style.outline = "none";

  const btnPrev = document.createElement("button");
  btnPrev.textContent = "◀";
  const btnNext = document.createElement("button");
  btnNext.textContent = "▶";
  const btnClose = document.createElement("button");
  btnClose.textContent = "✕";

  [btnPrev, btnNext, btnClose].forEach((b) => {
    b.type = "button";
    b.style.width = "40px";
    b.style.height = "34px";
    b.style.borderRadius = "10px";
    b.style.border = "1px solid rgba(255,255,255,.14)";
    b.style.background = "rgba(255,255,255,.06)";
    b.style.color = "#e8edf6";
    b.style.cursor = "pointer";
  });

  const info = document.createElement("div");
  info.style.marginTop = "8px";
  info.style.fontSize = "12px";
  info.style.color = "rgba(232,237,246,.7)";
  info.textContent = "0 resultados";

  row.appendChild(input);
  row.appendChild(btnPrev);
  row.appendChild(btnNext);
  row.appendChild(btnClose);
  findUI.appendChild(row);
  findUI.appendChild(info);
  document.body.appendChild(findUI);

  function runFind() {
    const q = String(input.value || "").trim().toLowerCase();
    findResults = [];
    findIndex = -1;

    if (!q) {
      info.textContent = "0 resultados";
      applyFindHighlights();
      return;
    }

    for (let vr = 0; vr < viewMap.length; vr++) {
      const di = viewMap[vr];
      const rowObj = cfData[di];
      for (let c = 0; c < CF_COLUMNS.length; c++) {
        const k = CF_COLUMNS[c].key;
        const v = String(rowObj[k] ?? "").toLowerCase();
        if (v.includes(q)) findResults.push({ vr, c });
      }
    }

    info.textContent = `${findResults.length} resultado(s)`;
    if (findResults.length) {
      findIndex = 0;
      gotoFindResult(0);
    } else {
      applyFindHighlights();
    }
  }

  function gotoFindResult(i) {
    if (!findResults.length) return;
    findIndex = (i + findResults.length) % findResults.length;
    const hit = findResults[findIndex];
    setSingleActiveCell(hit.vr, hit.c);
    applyFindHighlights();
  }

  input.addEventListener("input", runFind);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (!findResults.length) runFind();
      else gotoFindResult(findIndex + 1);
    }
    if (e.key === "Escape") {
      e.preventDefault();
      findUI.style.display = "none";
      clearFind();
    }
  });

  btnNext.onclick = () => {
    if (!findResults.length) runFind();
    else gotoFindResult(findIndex + 1);
  };
  btnPrev.onclick = () => {
    if (!findResults.length) runFind();
    else gotoFindResult(findIndex - 1);
  };
  btnClose.onclick = () => {
    findUI.style.display = "none";
    clearFind();
  };

  input.focus();
}

function clearFind() {
  findResults = [];
  findIndex = -1;
  applyFindHighlights();
}

function applyFindHighlights() {
  const cells = document.querySelectorAll(".cf-cell");
  cells.forEach((c) => c.classList.remove("is-find-hit", "is-find-current"));

  if (!findResults.length) return;

  findResults.forEach((hit, i) => {
    const el = document.querySelector(`.cf-cell[data-row-index="${hit.vr}"][data-col-index="${hit.c}"]`);
    if (!el) return;
    el.classList.add("is-find-hit");
    if (i === findIndex) el.classList.add("is-find-current");
  });
}

/* ===========================
   INIT
=========================== */
document.addEventListener("DOMContentLoaded", async () => {
  injectExtraStyles();
  initBroadcast();

  const me = await requireAuthOrRedirect();
  if (!me) return;

  await loadModulesMap();
  if (!canAccessModule("contflow", me)) {
    alert("Seu perfil não possui acesso ao ContFlow.");
    goto("../dashboard/dashboard.html");
    return;
  }
  syncSidebarFromStore();
  applyRoleToSidebar();

  window.addEventListener("beforeunload", (e) => {
    if (!hasAnyPendingChanges()) return;
    e.preventDefault();
    e.returnValue = "";
  });

  const menuBtn = document.getElementById("menuBtn");
  const overlay = document.getElementById("overlay");

  menuBtn?.addEventListener("click", () => {
    document.body.classList.toggle("sidebar-open");
    setOverlayState();
  });

  overlay?.addEventListener("click", () => {
    document.body.classList.remove("sidebar-open");
    setOverlayState();
  });

  setOverlayState();
  window.addEventListener("resize", () => requestAnimationFrame(() => applyContFlowFrozenColumns()));

  document.querySelectorAll(".modulos-sidebar .cards-modulos[data-src]").forEach((button) => {
    button.onclick = null;

    button.addEventListener(
      "click",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === "function") {
          e.stopImmediatePropagation();
        }

        const disabled = button.getAttribute("data-disabled") === "true";
        const noAccess = button.getAttribute("data-noaccess") === "true";
        const src = String(button.dataset.src || "").trim();

        console.log("Clique módulo:", {
          module: button.dataset.moduleId,
          disabled,
          noAccess,
          src,
          dirty: hasAnyPendingChanges(),
        });

        if (disabled) {
          alert("Este módulo está offline ou desabilitado.");
          return;
        }

        if (noAccess) {
          alert("Você não tem permissão para acessar este módulo.");
          return;
        }

        if (!src) {
          alert("Este módulo está sem rota configurada.");
          return;
        }

        if (hasAnyPendingChanges()) {
          const ok = confirm("Existem alterações não salvas. Deseja sair mesmo assim?");
          if (!ok) return;
        }

        if (window.innerWidth <= 1100) {
          document.body.classList.remove("sidebar-open");
          setOverlayState();
        }
        window.location.href = src;
      },
      true
    )
  })

  window.addEventListener("resize", () => {
    if (window.innerWidth > 1100 && document.body.classList.contains("sidebar-open")) {
      document.body.classList.remove("sidebar-open");
    }
    setOverlayState();
  });
  const userCard = document.querySelector("[data-usercard]");
  const btnLogout = document.querySelector("[data-logout]");
  userCard?.addEventListener("click", (e) => {
    if (e.target.closest("[data-logout]")) return;
    e.preventDefault();

    if (hasAnyPendingChanges()) {
      const ok = confirm("Existem alterações não salvas. Deseja sair mesmo assim?");
      if (!ok) return;
    }

    goto(USER_PAGE_URL);
  });

  btnLogout?.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (hasAnyPendingChanges()) {
      const ok = confirm("Existem alterações não salvas. Deseja sair mesmo assim?");
      if (!ok) return;
    }

    await logout();
  });

  renderUserCard();

  if (window.PainelTributarioSheet && typeof window.PainelTributarioSheet.init === "function") {
    await window.PainelTributarioSheet.init();
  }

  if (window.PainelTributarioLRSheet && typeof window.PainelTributarioLRSheet.init === "function") {
    await window.PainelTributarioLRSheet.init();
  }

  if (window.PainelTributarioLRASheet && typeof window.PainelTributarioLRASheet.init === "function") {
    await window.PainelTributarioLRASheet.init();
  }

  syncPainelTributarioFromContFlow(true);
  syncPainelTributarioRevenueToLR(true);
  window.addEventListener("painel-tributario:revenue-sync", (event) => {
    syncPainelTributarioRevenueToLR(Boolean(event?.detail?.sheets));
  });

  const btnAdd = document.getElementById("cf-add-row");
  const inputFile = document.getElementById("cf-import");
  const btnExportCSV = document.getElementById("cf-export");
  const btnExportXLSX = document.getElementById("cf-export-xlsx");
  const btnExportXLSXTop = document.getElementById("cf-export-xlsx-top");
  const btnSaveCells = document.getElementById("cf-save-cells");
  const btnSaveBase = document.getElementById("cf-save-base");
  const btnSaveBaseTop = document.getElementById("cf-save-base-top");
  const btnClearFiltersTop = document.getElementById("cf-clear-filters-top");
  const btnDeleteSelected = document.getElementById("cf-delete-selected");
  const btnSaveCellsTop = document.getElementById("cf-save-cells-top");
  const globalSearchInput = document.getElementById("cf-global-search");
  const cfSheetTabs = Array.from(
    document.querySelectorAll("#view-contflow .cf-main-sheet-tab")
  );

  const baseBtn = document.getElementById("cf-base-btn");
  const modalClose = document.getElementById("cf-modal-close");
  const modalBackdrop = document.getElementById("cf-modal-backdrop");
  const backupsRefreshBtn = document.getElementById("cf-backups-refresh");
  const backupsCloseBtn = document.getElementById("cf-backups-close");

  activeContFlowSheetIndex = restoreActiveContFlowQuarter();
  updateContFlowSheetUI();
  persistActiveContFlowQuarter(activeContFlowSheetIndex);

  cfSheetTabs.forEach((btn) => {
    btn.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await window.switchContFlowQuarter(btn.dataset.cfSheet);
    });
  });

  const modalActions = document.querySelector(".cf-modal-actions");
  if (modalActions && !modalActions.dataset.enhanced) {
    modalActions.dataset.enhanced = "1";

    const extra = document.createElement("div");
    extra.className = "cf-modal-extra-actions";
    extra.style.marginTop = "10px";

    const b2 = document.createElement("button");
    b2.className = "cf-btn";
    b2.type = "button";
    b2.textContent = "Histórico de backups";
    b2.onclick = () => restoreVersion();

    const b4 = document.createElement("button");
    b4.className = "cf-btn";
    b4.type = "button";
    b4.textContent = "Buscar (Ctrl+F)";
    b4.onclick = () => openFindUI();

    extra.appendChild(b2);
    extra.appendChild(b4);
    modalActions.appendChild(extra);
  }

  btnAdd?.addEventListener("click", () => {
    if (editing) commitEdit();
    const newRow = createEmptyRow();
    cfData.push(newRow);
    pushUndo({ type: "rows_insert", at: cfData.length - 1, rows: [deepClone(newRow)] });
    markStructureDirty();
    rebuildViewMap();
    renderTable();
    closeModal();
    setSingleActiveCell(viewMap.length - 1, 0);
  });

  inputFile?.addEventListener("change", (ev) => {
    handleImportFile(ev);
    closeModal();
  });

  btnExportCSV?.addEventListener("click", () => {
    handleExportCSV();
    closeModal();
  });

  btnExportXLSX?.addEventListener("click", () => {
    handleExportXLSX();
    closeModal();
  });

  btnExportXLSXTop?.addEventListener("click", () => {
    handleExportXLSX();
  });

  btnSaveCells?.addEventListener("click", async () => {
    await saveDirtyCells(false);
  });

  if (btnSaveCellsTop) {
    btnSaveCellsTop.addEventListener("click", async () => {
      await saveDirtyCells(false);
    });
  }

  btnSaveBase?.addEventListener("click", async () => {
    await saveBase(false, { mode: "base" });
    closeModal();
  });

  if (btnSaveBaseTop) {
    btnSaveBaseTop.addEventListener("click", async () => {
      if (!canManageContFlowBase(getSessionUser())) return;
      await saveBase(false, { mode: "base" });
    });
  }

  if (btnClearFiltersTop) {
    btnClearFiltersTop.addEventListener("click", () => {
      clearAllFilters();
    });
  }

  globalSearchInput?.addEventListener("input", () => {
    const selectionStart = globalSearchInput.selectionStart;
    const selectionEnd = globalSearchInput.selectionEnd;
    globalSearch = globalSearchInput.value || "";
    rebuildViewMap();
    activeRow = clamp(activeRow, 0, Math.max(0, viewMap.length - 1));
    selectionAnchor = null;
    lastSelectionBounds = null;
    renderTable({
      suppressCellFocus: true,
      preserveFocus: {
        element: globalSearchInput,
        start: selectionStart,
        end: selectionEnd,
      },
    });
    refreshDirtyVisuals();
  });

  btnDeleteSelected?.addEventListener("click", () => {
    deleteSelectedRows();
    closeModal();
  });

  baseBtn?.addEventListener("click", openModal);
  modalClose?.addEventListener("click", closeModal);
  modalBackdrop?.addEventListener("click", closeModal);
  backupsRefreshBtn?.addEventListener("click", () => {
    refreshBackupsPanel().catch((err) => console.error("Erro ao atualizar backups:", err));
  });
  backupsCloseBtn?.addEventListener("click", closeBackupsPanel);

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") {
      hideCtxMenu();
      hideFilterDropdown();
      if (editing) cancelEdit();
      closeModal();
      if (
        window.PainelTributarioSheet &&
        typeof window.PainelTributarioSheet.closeModal === "function"
      ) {
        window.PainelTributarioSheet.closeModal();
      }
      if (
        window.PainelTributarioLRSheet &&
        typeof window.PainelTributarioLRSheet.closeModal === "function"
      ) {
        window.PainelTributarioLRSheet.closeModal();
      }
      if (
        window.PainelTributarioLRASheet &&
        typeof window.PainelTributarioLRASheet.closeModal === "function"
      ) {
        window.PainelTributarioLRASheet.closeModal();
      }
      closeQuotaCompletionModal();
      if (findUI) findUI.style.display = "none";
    }
  });

  document.addEventListener("keydown", handleGlobalKeyDown);
  document.addEventListener("copy", handleCopyEvent);
  document.addEventListener("paste", handlePasteEvent);
  bindQuotaCompletionModal();

  window.addEventListener("mouseup", () => (mouseSelecting = false));

  await loadCurrentContFlowSheet();
  rebuildViewMap();
  activeRow = 0;
  activeCol = 0;
  selectionAnchor = null;
  setTimeout(() => {
    setSingleActiveCell(0, 0);
    refreshDirtyVisuals();
  }, 0);

  console.log("✅ ContFlow pronto (manual save)!");
});
