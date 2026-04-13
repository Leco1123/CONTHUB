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
const CF_API_SHEET_KEY = "contflow";
const CF_API_SHEET_URL = `/api/sheets/${CF_API_SHEET_KEY}`;
const CF_API_SHEET_CELLS_URL = `${CF_API_SHEET_URL}/cells`;
const CF_API_IMPORT_URL = `/api/sheets/${CF_API_SHEET_KEY}/import-local`;
const CF_API_BACKUPS_URL = `${CF_API_SHEET_URL}/backups`;
const API_MODULES = "/api/admin/modules";
const API_PREFERRED_PORT = "3000";
const CF_LOCAL_DRAFT_KEY = "conthub:contflow:local-draft";
const CF_LOCAL_BACKUPS_KEY = "conthub:contflow:local-backups";

function resolveApiUrl(url) {
  const target = String(url || "").trim();
  if (!target) return target;
  if (/^https?:\/\//i.test(target)) return target;

  try {
    const { protocol, hostname, port } = window.location;
    if (target.startsWith("/api/") && port && port !== API_PREFERRED_PORT) {
      return `${protocol}//${hostname}:${API_PREFERRED_PORT}${target}`;
    }
  } catch (_) {}

  return target;
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
      goto(LOGIN_PAGE_URL);
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
    goto(LOGIN_PAGE_URL);
    return null;
  }
}

const MAX_UNDO = 150;
const MAX_VERSIONS = 12;

/* ===========================
   ESTADO
=========================== */
let CF_COLUMNS = [
  { key: "cod", label: "Cód." },
  { key: "razao_social", label: "Razão Social" },
  { key: "cnpj_cpf", label: "CNPJ/CPF" },
  { key: "trib", label: "Trib." },
  { key: "grupo", label: "Grupo" },
  { key: "resp1", label: "Resp.1" },
  { key: "resp2", label: "Resp.2" },
  { key: "tipo", label: "Tipo" },
  { key: "num_quotas", label: "Num Quotas" },
  { key: "quota1", label: "1º quota" },
  { key: "quota2", label: "2º quota" },
  { key: "quota3", label: "3º quota" },
  { key: "obs", label: "Obs" },
  { key: "mit", label: "MIT" },
  { key: "controle_mit", label: "Controle de MIT" },
];

let cfData = [];
let viewMap = [];
let cfCellMeta = new Map();

let sortState = null;
let filters = {};
let colWidths = {};

let activeRow = 0;
let activeCol = 0;
let selectionAnchor = null;
let mouseSelecting = false;
let lastSelectionBounds = null;
let autoSaveTimeout = null;

let editing = null;
let suppressClickSelect = false;

let undoStack = [];
let redoStack = [];

let findUI = null;
let findResults = [];
let findIndex = -1;

let ctxMenuEl = null;
let cfBC = null;

/* versões agora ficam só em memória da página */
let cfVersions = [];

/* controle do último payload salvo/carregado para delta */
let lastSavedPayload = null;
let saveInFlight = false;
let queuedSaveAfterFlight = false;
let currentUser = null;

/* controle de pendências */
let dirtyCells = new Set();
let hasStructuralChanges = false;
let cfServerBackups = [];

/* módulos */
let MODULES_MAP = {};

const STATUS_LABEL = {
  online: "ONLINE",
  dev: "DEV",
  offline: "OFF",
  admin: "ADMIN",
};

const CF_FROZEN_COL_KEYS = ["cod", "razao_social", "cnpj_cpf", "trib"];

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
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
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
  const resp = await apiFetch(CF_API_SHEET_URL, { method: "GET" });
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

function markStructureDirty() {
  hasStructuralChanges = true;
  refreshDirtyVisuals();
}

function clearDirtyState() {
  dirtyCells.clear();
  hasStructuralChanges = false;
  refreshDirtyVisuals();
}

function hasPendingDirtyChanges() {
  return dirtyCells.size > 0 || hasStructuralChanges;
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
  return hasPendingDirtyChanges() || ptDirty;
}

let lastPainelTributarioSyncSignature = "";

function getContFlowRowsForPainelTributario() {
  return (cfData || []).map((row) => ({
    __id: String(row?.__id || "").trim(),
    __sourceRowId: String(row?.__id || "").trim(),
    cod: String(row?.cod ?? ""),
    razao_social: String(row?.razao_social ?? ""),
    tipo: String(row?.tipo ?? ""),
    cnpj_cpf: String(row?.cnpj_cpf ?? ""),
    class: "",
    grupo: String(row?.grupo ?? ""),
    trib: String(row?.trib ?? ""),
    status: "",
    resp1: String(row?.resp1 ?? ""),
  }));
}

function syncPainelTributarioFromContFlow(force = false) {
  if (
    !window.PainelTributarioSheet ||
    typeof window.PainelTributarioSheet.syncFromContFlowRows !== "function"
  ) {
    return;
  }

  const rows = getContFlowRowsForPainelTributario();
  const signature = JSON.stringify(
    rows.map((row) => [
      row.__sourceRowId,
      row.cod,
      row.razao_social,
      row.tipo,
      row.cnpj_cpf,
      row.grupo,
      row.trib,
      row.resp1,
    ])
  );

  if (!force && signature === lastPainelTributarioSyncSignature) return;

  lastPainelTributarioSyncSignature = signature;
  window.PainelTributarioSheet.syncFromContFlowRows(rows);
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
    rows.forEach((m) => {
      const slug = String(m.slug || "").trim().toLowerCase();
      if (!slug) return;
      map[slug] = normalizeModuleStatus(m.status, m.active);
    });

    MODULES_MAP = map;
    return map;
  } catch (err) {
    console.warn("Falha ao carregar módulos da API no ContFlow:", err);
    MODULES_MAP = {};
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
  const role = String(u?.role || "user").toLowerCase();

  getSidebarCards().forEach((card) => {
    const moduleId = String(card.dataset.moduleId || "").trim().toLowerCase();
    if (!moduleId) return;

    const blocked = role === "user" && moduleId === "contadmin";
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
    if (hasStructuralChanges) parts.push("estrutura");
    statusEl.textContent = `${cleanText} · Pendências: ${parts.join(" + ")}`;
  } else {
    statusEl.textContent = cleanText;
  }
}

function forceDefaultColumns(requiredCols) {
  const currentByLabel = new Map(
    (CF_COLUMNS || []).map((c) => [normalizeLabel(c.label), c])
  );

  const merged = [];
  requiredCols.forEach((req) => {
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

    forceDefaultColumns([
      { key: "cod", label: "Cód." },
      { key: "razao_social", label: "Razão Social" },
      { key: "cnpj_cpf", label: "CNPJ/CPF" },
      { key: "trib", label: "Trib." },
      { key: "grupo", label: "Grupo" },
      { key: "resp1", label: "Resp.1" },
      { key: "resp2", label: "Resp.2" },
      { key: "tipo", label: "Tipo" },
      { key: "num_quotas", label: "Num Quotas" },
      { key: "quota1", label: "1º quota" },
      { key: "quota2", label: "2º quota" },
      { key: "quota3", label: "3º quota" },
      { key: "obs", label: "Obs" },
      { key: "mit", label: "MIT" },
      { key: "controle_mit", label: "Controle de MIT" },
    ]);

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
      payload.columns.map((c) => ({
        key: String(c.key || slugKeyFromLabel(c.label || "col")).trim(),
        label: String(c.label || c.key || "").trim() || "Coluna",
      }))
    );

    forceDefaultColumns([
      { key: "cod", label: "Cód." },
      { key: "razao_social", label: "Razão Social" },
      { key: "cnpj_cpf", label: "CNPJ/CPF" },
      { key: "trib", label: "Trib." },
      { key: "grupo", label: "Grupo" },
      { key: "resp1", label: "Resp.1" },
      { key: "resp2", label: "Resp.2" },
      { key: "tipo", label: "Tipo" },
      { key: "num_quotas", label: "Num Quotas" },
      { key: "quota1", label: "1º quota" },
      { key: "quota2", label: "2º quota" },
      { key: "quota3", label: "3º quota" },
      { key: "obs", label: "Obs" },
      { key: "mit", label: "MIT" },
      { key: "controle_mit", label: "Controle de MIT" },
    ]);

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
  const resp = await apiFetch(CF_API_SHEET_URL, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await resp.json().catch(() => null);

  if (!resp.ok) {
    throw new Error(data?.error || "Erro ao salvar ContFlow na API.");
  }

  return data;
}

async function loadServerBackups() {
  const resp = await apiFetch(CF_API_BACKUPS_URL, { method: "GET" });
  const data = await resp.json().catch(() => null);

  if (!resp.ok) {
    throw new Error(data?.error || "Erro ao carregar backups do ContFlow.");
  }

  return Array.isArray(data?.backups) ? data.backups : [];
}

async function restoreServerBackupById(backupId) {
  const resp = await apiFetch(`${CF_API_BACKUPS_URL}/${encodeURIComponent(String(backupId || "").trim())}/restore`, {
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
  const resp = await apiFetch(CF_API_SHEET_CELLS_URL, {
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
    const raw = window.localStorage.getItem(CF_LOCAL_DRAFT_KEY);
    if (!raw) return null;
    const payload = JSON.parse(raw);
    return payload && typeof payload === "object" ? payload : null;
  } catch (err) {
    console.warn("Erro ao ler rascunho local do ContFlow:", err);
    return null;
  }
}

function saveLocalDraft(payload) {
  try {
    window.localStorage.setItem(CF_LOCAL_DRAFT_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn("Erro ao salvar rascunho local do ContFlow:", err);
  }
}

function loadLocalBackups() {
  try {
    const raw = window.localStorage.getItem(CF_LOCAL_BACKUPS_KEY);
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
      CF_LOCAL_BACKUPS_KEY,
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

function normalizeNumQuotas(row) {
  if (!row) return;

  const nqKey = getNumQuotasKey();
  const raw = String(row?.[nqKey] ?? "3").trim();
  const n = Number(raw);
  const num = Number.isFinite(n) ? clamp(n, 1, 3) : 3;

  row[nqKey] = String(num);

  if (num < 3 && row.quota3 != null) row.quota3 = "";
  if (num < 2 && row.quota2 != null) row.quota2 = "";
}

function syncQuotasByNum(row) {
  normalizeNumQuotas(row);
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
      row[c.key] = v;
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
      if (!silent) {
        alert("Há alterações estruturais pendentes. Use o botão de salvar base para evitar sobrescrever a planilha.");
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
      syncPainelTributarioFromContFlow(true);
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
  for (const colKey of Object.keys(filters)) {
    const f = filters[colKey];
    if (!isFilterActive(f)) continue;

    const cellRaw = row[colKey] ?? "";
    const cell = String(cellRaw);
    const a = cell.toLowerCase().trim();

    if (f.mode === "equals") {
      const b = String(f.value ?? "").toLowerCase().trim();
      if (a !== b) return false;
    } else if (f.mode === "starts") {
      const b = String(f.value ?? "").toLowerCase();
      if (!a.startsWith(b)) return false;
    } else if (f.mode === "empty") {
      if (a !== "") return false;
    } else if (f.mode === "not_empty") {
      if (a === "") return false;
    } else if (f.mode === "in") {
      const set = new Set((f.values || []).map((x) => String(x ?? "").trim()));
      if (!set.has(String(cellRaw ?? "").trim())) return false;
    } else {
      const b = String(f.value ?? "").toLowerCase();
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
  markStructureDirty();
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
  else if (colKey === "resp2") colWidths[colKey] = 80;
  else if (colKey === "tipo") colWidths[colKey] = 110;
  else if (colKey === "num_quotas") colWidths[colKey] = 110;
  else if (colKey === "quota1") colWidths[colKey] = 110;
  else if (colKey === "quota2") colWidths[colKey] = 110;
  else if (colKey === "quota3") colWidths[colKey] = 110;
  else if (colKey === "obs") colWidths[colKey] = 220;
  else if (colKey === "mit") colWidths[colKey] = 120;
  else if (colKey === "controle_mit") colWidths[colKey] = 220;
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
  markStructureDirty();
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
  markStructureDirty();
}

function clearAllFilters() {
  filters = {};
  rebuildViewMap();
  renderTable();
  markStructureDirty();
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

  document.addEventListener("scroll", () => hideFilterDropdown(), true);

  return cfFilterDD;
}

function hideFilterDropdown() {
  if (!cfFilterDD) return;
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
  menu.innerHTML = "";

  menu.addEventListener("keydown", (ev) => ev.stopPropagation(), true);
  menu.addEventListener("keypress", (ev) => ev.stopPropagation(), true);
  menu.addEventListener("keyup", (ev) => ev.stopPropagation(), true);

  const colKey = col.key;
  const colLabel = col.label;

  const rect = thEl.getBoundingClientRect();
  const left = clamp(rect.left, 8, window.innerWidth - 380);
  const top = clamp(rect.bottom + 6, 8, window.innerHeight - 520);

  menu.style.left = left + "px";
  menu.style.top = top + "px";

  menu.style.display = "flex";
  menu.style.flexDirection = "column";
  menu.style.maxHeight = "520px";
  menu.style.overflow = "hidden";

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
    markStructureDirty();
    hideFilterDropdown();
  };

  footer.appendChild(btnConfirm);
  menu.appendChild(footer);

  menu.style.display = "flex";
  setTimeout(() => input.focus(), 0);
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

/* ===========================
   EDIÇÃO
=========================== */
function enterEditMode(viewRow, colIndex, initialText = null, selectAll = false) {
  if (viewMap.length === 0) return;
  const dataIndex = viewMap[viewRow];
  if (dataIndex == null) return;

  const col = CF_COLUMNS[colIndex];
  if (!col) return;

  const cell = document.querySelector(`.cf-cell[data-row-index="${viewRow}"][data-col-index="${colIndex}"]`);
  if (!cell) return;

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
  const after = String(el.textContent ?? "");

  let finalAfter = after;

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
  if (!viewMap.length) return;
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
  await copyToClipboard(lines.join("\n"));
}

async function pasteFromClipboard() {
  if (!viewMap.length) return;
  if (!navigator.clipboard || !navigator.clipboard.readText) return;

  const text = await navigator.clipboard.readText();
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
        const after = String(value);
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
      const after = String(cellVal ?? "");
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

function renderTable() {
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

      if (isCellMarkedDirty(row, col.key)) {
        td.classList.add("is-dirty");
      }

      td.contentEditable = "false";
      td.tabIndex = 0;
      td.textContent = row[col.key] ?? "";

      td.dataset.rowIndex = String(viewRowIndex);
      td.dataset.colIndex = String(colIndex);
      td.dataset.colKey = col.key;

      td.addEventListener("click", handleCellClick);
      td.addEventListener("dblclick", () => enterEditMode(viewRowIndex, colIndex, null, true));
      td.addEventListener("mousedown", handleCellMouseDown);
      td.addEventListener("mouseenter", handleCellMouseEnter);
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
      setSingleActiveCell(r, c);
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
  if (editing) commitEdit();

  e.preventDefault();
  suppressClickSelect = true;
  setTimeout(() => (suppressClickSelect = false), 0);

  const cell = e.currentTarget;
  const rowIndex = parseInt(cell.dataset.rowIndex, 10);
  const colIndex = parseInt(cell.dataset.colIndex, 10);
  if (Number.isNaN(rowIndex) || Number.isNaN(colIndex)) return;

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
    if (!navigator.clipboard || !navigator.clipboard.readText) return;
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

    if (isCtrl && !isShift) {
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
  const labels = (headerRow || []).map((h) => String(h ?? "").trim());
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
  });

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
    (importCols || []).map((c) => [normalizeLabel(c.label), c.key])
  );

  const incoming = (importRows || []).map((r) => {
    const out = {};
    CF_COLUMNS.forEach((c) => (out[c.key] = ""));

    CF_COLUMNS.forEach((c) => {
      const ik = importMap.get(normalizeLabel(c.label));
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

      CF_COLUMNS = ensureUniqueKeys(cols);
      forceDefaultColumns([
        { key: "cod", label: "Cód." },
        { key: "razao_social", label: "Razão Social" },
        { key: "cnpj_cpf", label: "CNPJ/CPF" },
        { key: "trib", label: "Trib." },
        { key: "grupo", label: "Grupo" },
        { key: "resp1", label: "Resp.1" },
        { key: "resp2", label: "Resp.2" },
        { key: "tipo", label: "Tipo" },
        { key: "num_quotas", label: "Num Quotas" },
        { key: "quota1", label: "1º quota" },
        { key: "quota2", label: "2º quota" },
        { key: "quota3", label: "3º quota" },
        { key: "obs", label: "Obs" },
        { key: "mit", label: "MIT" },
        { key: "controle_mit", label: "Controle de MIT" },
      ]);

      CF_COLUMNS.forEach((c) => setDefaultWidthForCol(c.key));
      cfData = coerceRowsToCurrentColumns(rows);

      sortState = null;
      filters = {};

      const after = snapshotState();
      pushUndo({ type: "snapshot", before, after });
      markStructureDirty();
    } else if (mode === "2") {
      const before = snapshotState();

      CF_COLUMNS = unionColumnsByLabel(CF_COLUMNS, cols);
      forceDefaultColumns([
        { key: "cod", label: "Cód." },
        { key: "razao_social", label: "Razão Social" },
        { key: "cnpj_cpf", label: "CNPJ/CPF" },
        { key: "trib", label: "Trib." },
        { key: "grupo", label: "Grupo" },
        { key: "resp1", label: "Resp.1" },
        { key: "resp2", label: "Resp.2" },
        { key: "tipo", label: "Tipo" },
        { key: "num_quotas", label: "Num Quotas" },
        { key: "quota1", label: "1º quota" },
        { key: "quota2", label: "2º quota" },
        { key: "quota3", label: "3º quota" },
        { key: "obs", label: "Obs" },
        { key: "mit", label: "MIT" },
        { key: "controle_mit", label: "Controle de MIT" },
      ]);

      CF_COLUMNS.forEach((c) => setDefaultWidthForCol(c.key));

      const importMap = new Map(cols.map((c) => [normalizeLabel(c.label), c.key]));
      const incoming = rows.map((r) => {
        const out = createEmptyRow();
        CF_COLUMNS.forEach((c) => {
          const ik = importMap.get(normalizeLabel(c.label));
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
      forceDefaultColumns([
        { key: "cod", label: "Cód." },
        { key: "razao_social", label: "Razão Social" },
        { key: "cnpj_cpf", label: "CNPJ/CPF" },
        { key: "trib", label: "Trib." },
        { key: "grupo", label: "Grupo" },
        { key: "resp1", label: "Resp.1" },
        { key: "resp2", label: "Resp.2" },
        { key: "tipo", label: "Tipo" },
        { key: "num_quotas", label: "Num Quotas" },
        { key: "quota1", label: "1º quota" },
        { key: "quota2", label: "2º quota" },
        { key: "quota3", label: "3º quota" },
        { key: "obs", label: "Obs" },
        { key: "mit", label: "MIT" },
        { key: "controle_mit", label: "Controle de MIT" },
      ]);
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
    return;
  }

  const nome = u.nome || u.name || "Usuário";
  const role = u.role || "user";

  elUserName && (elUserName.textContent = nome);
  elUserRole && (elUserRole.textContent = roleLabel(role));
  elUserAvatar && (elUserAvatar.textContent = avatarFromName(nome));
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
          markStructureDirty();
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
      markStructureDirty();
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
    window.PainelTributarioSheet.init();
    syncPainelTributarioFromContFlow(true);
  }

  const btnAdd = document.getElementById("cf-add-row");
  const inputFile = document.getElementById("cf-import");
  const btnExportCSV = document.getElementById("cf-export");
  const btnExportXLSX = document.getElementById("cf-export-xlsx");
  const btnSaveCells = document.getElementById("cf-save-cells");
  const btnSaveBase = document.getElementById("cf-save-base");
  const btnDeleteSelected = document.getElementById("cf-delete-selected");
  const btnSaveCellsTop = document.getElementById("cf-save-cells-top");

  const baseBtn = document.getElementById("cf-base-btn");
  const modalClose = document.getElementById("cf-modal-close");
  const modalBackdrop = document.getElementById("cf-modal-backdrop");
  const backupsRefreshBtn = document.getElementById("cf-backups-refresh");
  const backupsCloseBtn = document.getElementById("cf-backups-close");

  const modalActions = document.querySelector(".cf-modal-actions");
  if (modalActions && !modalActions.dataset.enhanced) {
    modalActions.dataset.enhanced = "1";

    const extra = document.createElement("div");
    extra.className = "cf-modal-extra-actions";
    extra.style.marginTop = "10px";

    const b1 = document.createElement("button");
    b1.className = "cf-btn";
    b1.type = "button";
    b1.textContent = "Salvar base agora";
    b1.onclick = () => saveVersion();

    const b2 = document.createElement("button");
    b2.className = "cf-btn";
    b2.type = "button";
    b2.textContent = "Histórico de backups";
    b2.onclick = () => restoreVersion();

    const b3 = document.createElement("button");
    b3.className = "cf-btn";
    b3.type = "button";
    b3.textContent = "Limpar filtros";
    b3.onclick = () => clearAllFilters();

    const b4 = document.createElement("button");
    b4.className = "cf-btn";
    b4.type = "button";
    b4.textContent = "Buscar (Ctrl+F)";
    b4.onclick = () => openFindUI();

    extra.appendChild(b1);
    extra.appendChild(b2);
    extra.appendChild(b3);
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
      if (findUI) findUI.style.display = "none";
    }
  });

  document.addEventListener("keydown", handleGlobalKeyDown);

  window.addEventListener("mouseup", () => (mouseSelecting = false));

  try {
    const payload = await loadBaseFromApi();
    hydrateContFlowFromApiPayload(payload);

    if (!cfData.length) {
      cfData = Array.from({ length: 15 }, () => createEmptyRow());
      CF_COLUMNS.forEach((c) => setDefaultWidthForCol(c.key));
      markStructureDirty();
    }

    console.log("✅ ContFlow carregado da API.");
  } catch (err) {
    console.error("❌ Falha ao carregar ContFlow da API:", err);

    const localDraft = loadLocalDraft();
    if (localDraft) {
      try {
        hydrateContFlowFromApiPayload(localDraft);
        console.log("🟡 ContFlow carregado do rascunho local.");
      } catch (localErr) {
        console.error("❌ Falha ao carregar rascunho local do ContFlow:", localErr);
      }
    }

    if (!localDraft) {
      forceDefaultColumns([
        { key: "cod", label: "Cód." },
        { key: "razao_social", label: "Razão Social" },
        { key: "cnpj_cpf", label: "CNPJ/CPF" },
        { key: "trib", label: "Trib." },
        { key: "grupo", label: "Grupo" },
        { key: "resp1", label: "Resp.1" },
        { key: "resp2", label: "Resp.2" },
        { key: "tipo", label: "Tipo" },
        { key: "num_quotas", label: "Num Quotas" },
        { key: "quota1", label: "1º quota" },
        { key: "quota2", label: "2º quota" },
        { key: "quota3", label: "3º quota" },
        { key: "obs", label: "Obs" },
        { key: "mit", label: "MIT" },
        { key: "controle_mit", label: "Controle de MIT" },
      ]);

      cfData = Array.from({ length: 15 }, () => createEmptyRow());
      CF_COLUMNS.forEach((c) => setDefaultWidthForCol(c.key));
      markStructureDirty();
      console.log("⚠️ ContFlow iniciado com estrutura vazia, sem fallback local.");
    }
  }

  rebuildViewMap();
  activeRow = 0;
  activeCol = 0;
  selectionAnchor = null;

  renderTable();
  setTimeout(() => {
    setSingleActiveCell(0, 0);
    refreshDirtyVisuals();
  }, 0);

  console.log("✅ ContFlow pronto (manual save)!");
});
