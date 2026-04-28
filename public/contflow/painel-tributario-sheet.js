console.log("⚡ Painel Tributário JS carregando...");

window.PainelTributarioSheet = (() => {
    const STORAGE_KEY = "conthub:contflow:painel-tributario:v3";
  const API_SHEET_KEY = "painel-tributario";
  const API_SHEET_URL = `/api/sheets/${API_SHEET_KEY}`;
  const API_SHEET_CELLS_URL = `${API_SHEET_URL}/cells`;
  const POLL_INTERVAL_MS = 8000;
  const MAX_ROWS_START = 15;

  const BASE_META_COLUMNS = [
    { key: "cod", label: "Cód.", type: "text" },
    { key: "razao_social", label: "Razão Social", type: "text" },
    { key: "tipo", label: "Tipo", type: "text" },
    { key: "cnpj_cpf", label: "CNPJ/CPF", type: "text" },
    { key: "class", label: "Class", type: "text" },
    { key: "grupo", label: "Grupo", type: "text" },
    { key: "trib", label: "Trib.", type: "text" },
    { key: "status", label: "Status", type: "text" },
    { key: "resp1", label: "Resp.1", type: "text" },
    { key: "resp2", label: "Resp.2", type: "text" },
    { key: "receita_bruta", label: "Receita Bruta", type: "read" },
  ];

  const CADASTRAL_KEYS = [
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
  ];

  const PT_FROZEN_COL_KEYS = ["cod", "razao_social", "tipo", "cnpj_cpf", "class", "grupo", "trib"];
  const PT_FROZEN_GROUP_COLSPAN = 7;

  const BASE_IR_COLUMNS = [
    { key: "ir1", label: "Presunção %", type: "number", percent: true },
    { key: "fat1_m1", label: "Fat Mês 1", type: "number" },
    { key: "fat1_m2", label: "Fat Mês 2", type: "number" },
    { key: "fat1_m3", label: "Fat Mês 3", type: "number" },
    { key: "bc1", label: "BC-1", type: "read", readClass: "read-ir" },

    { key: "ir2", label: "Presunção %", type: "number", percent: true },
    { key: "fat2_m1", label: "Fat Mês 1", type: "number" },
    { key: "fat2_m2", label: "Fat Mês 2", type: "number" },
    { key: "fat2_m3", label: "Fat Mês 3", type: "number" },
    { key: "bc2", label: "BC-2", type: "read", readClass: "read-ir" },

    { key: "ir3", label: "Presunção %", type: "number", percent: true },
    { key: "fat3_m1", label: "Fat Mês 1", type: "number" },
    { key: "fat3_m2", label: "Fat Mês 2", type: "number" },
    { key: "fat3_m3", label: "Fat Mês 3", type: "number" },
    { key: "bc3", label: "BC-3", type: "read", readClass: "read-ir" },

    { key: "outras_rec", label: "Outras rec", type: "number" },
    { key: "total_bc", label: "Total BC", type: "read", readClass: "read-ir" },
    { key: "adicional", label: "Adicional", type: "read", readClass: "read-ir" },
    { key: "ir15", label: "IR 15%", type: "read", readClass: "read-ir" },
    { key: "retencoes_ir", label: "Retenções", type: "number" },
    { key: "ir_a_pagar", label: "IR a pagar", type: "read", readClass: "read-ir" },
  ];

  const BASE_CSLL_COLUMNS = [
    { key: "csll_bc1", label: "%CSLL BC1", type: "read", percent: true, readClass: "read-csll" },
    { key: "csll_bc2", label: "%CSLL BC2", type: "read", percent: true, readClass: "read-csll" },
    { key: "csll_bc3", label: "%CSLL BC3", type: "read", percent: true, readClass: "read-csll" },
    { key: "bc2_csll", label: "BC2-CSLL", type: "read", readClass: "read-csll" },
    { key: "retencoes_csll", label: "Retenções", type: "number" },
    { key: "csll_a_pagar", label: "CSLL a Pagar", type: "read", readClass: "read-csll" },
  ];

  const SHEET_TITLES = ["1º Trimestre", "2º Trimestre", "3º Trimestre", "4º Trimestre"];
  const QUARTER_MONTHS = [
    ["Jan", "Fev", "Mar"],
    ["Abr", "Maio", "Junho"],
    ["Jul", "Ago", "Set"],
    ["Out", "Nov", "Dez"],
  ];

  const state = {
    sheetIndex: 0,
    sheets: [[], [], [], []],
    activeRow: 0,
    activeCol: 0,
    selectionAnchor: null,
    lastSelectionBounds: null,
    mouseSelecting: false,
    dirty: false,
    bound: false,
    suppressSelectionFocus: false,
    modalMode: "base",
    modalRowId: "",
    modalTaxKind: "irpj",
    };
    let cellMeta = new Map();
    let lastSavedPayload = null;
    let pollTimer = null;
    let clipboardTextCache = "";

  function activeView() {
    return String(document.querySelector(".cf-view-btn.is-active")?.dataset.view || "contflow");
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(v, max));
  }

  function genId() {
    return "r_" + Math.random().toString(36).slice(2) + "_" + Date.now().toString(36);
  }

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function getAllColumns() {
    return [...BASE_META_COLUMNS, ...BASE_IR_COLUMNS, ...BASE_CSLL_COLUMNS];
  }

  function getDirtyCellKey(rowId, colKey) {
    return `${String(rowId || "").trim()}::${String(colKey || "").trim()}`;
  }

  function getCellMeta(rowId, colKey) {
    return cellMeta.get(getDirtyCellKey(rowId, colKey)) || null;
  }

  function setCellMeta(rowId, colKey, meta = null) {
    const key = getDirtyCellKey(rowId, colKey);
    if (!key || key === "::") return;
    if (!meta) {
      cellMeta.delete(key);
      return;
    }

    cellMeta.set(key, {
      updatedAt: String(meta.updatedAt || "").trim(),
    });
  }

  function isApiRelationalPayload(payload) {
    return payload && Array.isArray(payload.columns) && Array.isArray(payload.rows) && Array.isArray(payload.cells);
  }

  function isApiDocumentPayload(payload) {
    return payload && Array.isArray(payload.columns) && Array.isArray(payload.data);
  }

  function isEmptyApiPayload(payload) {
    if (isApiRelationalPayload(payload)) {
      return !payload.columns.length && !payload.rows.length && !payload.cells.length;
    }

    if (isApiDocumentPayload(payload)) {
      return !payload.columns.length && !payload.data.length;
    }

    return false;
  }

  function buildFlatRowsFromState() {
    const cols = getAllColumns();
    const sheetRows = [];

    state.sheets.forEach((rows, sheetIndex) => {
      (Array.isArray(rows) ? rows : []).forEach((sourceRow) => {
        const row = { __id: String(sourceRow.__id || genId()), sheet_index: sheetIndex };
        cols.forEach((col) => {
          row[col.key] = sourceRow[col.key] != null ? sourceRow[col.key] : "";
        });
        ensureDefaultPresuncao(row);
        sheetRows.push(row);
      });
    });

    return sheetRows;
  }

  function buildServerPayload() {
    return {
      version: 1,
      savedAt: new Date().toISOString(),
      columns: [{ key: "sheet_index", label: "Trimestre" }, ...getAllColumns().map(({ key, label }) => ({ key, label }))],
      data: buildFlatRowsFromState(),
    };
  }

  function applyFlatRowsToState(rows) {
    const buckets = [[], [], [], []];
    const cols = getAllColumns();

    (Array.isArray(rows) ? rows : []).forEach((source) => {
      const sheetIndex = clamp(Number(source?.sheet_index || 0), 0, 3);
      const row = createEmptyRow();
      cols.forEach((col) => {
        if (source[col.key] != null) row[col.key] = source[col.key];
      });
      ensureDefaultPresuncao(row);
      row.__id = String(source?.__id || genId());
      calcRow(row);
      buckets[sheetIndex].push(row);
    });

    state.sheets = buckets.map((rows) =>
      rows.length ? rows : Array.from({ length: MAX_ROWS_START }, () => createEmptyRow())
    );
    state.dirty = false;
  }

  function hydrateFromApiPayload(payload) {
    if (isApiRelationalPayload(payload)) {
      const rowMap = new Map();
      const clientRowIdMap = new Map();
      cellMeta = new Map();

        payload.rows.forEach((rowRef) => {
          const clientRowId = String(rowRef.clientRowId || genId());
          const row = {
            __id: clientRowId,
            sheet_index: getSheetIndexFromClientRowId(clientRowId),
          };
          rowMap.set(Number(rowRef.id), row);
          clientRowIdMap.set(Number(rowRef.id), clientRowId);
        });

      payload.cells.forEach((cell) => {
        const row = rowMap.get(Number(cell.rowId));
        if (!row) return;
        row[cell.colKey] = cell.value ?? "";
        const clientRowId = clientRowIdMap.get(Number(cell.rowId));
        if (clientRowId && cell.colKey) {
          setCellMeta(clientRowId, cell.colKey, { updatedAt: cell.updatedAt || "" });
        }
      });

      applyFlatRowsToState(Array.from(rowMap.values()));
      lastSavedPayload = buildServerPayload();
      return true;
    }

    if (isApiDocumentPayload(payload)) {
      cellMeta = new Map();
      applyFlatRowsToState(payload.data || []);
      lastSavedPayload = buildServerPayload();
      return true;
    }

    return false;
  }

  async function loadStateFromApi() {
    if (typeof apiFetch !== "function") {
      throw new Error("API indisponível no Painel Tributário.");
    }

    const resp = await apiFetch(API_SHEET_URL, { method: "GET" });
    const data = await resp.json().catch(() => null);

    if (!resp.ok) {
      throw new Error(data?.error || "Erro ao carregar Painel Tributário da API.");
    }

    return data;
  }

  async function persistBaseToApi(payload) {
    const resp = await apiFetch(API_SHEET_URL, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await resp.json().catch(() => null);

    if (!resp.ok) {
      const err = new Error(data?.error || "Erro ao salvar base do Painel Tributário.");
      err.status = Number(resp.status || 500);
      err.payload = data;
      throw err;
    }

    return data;
  }

  function explainSaveFailure(err, panelLabel) {
    const status = Number(err?.status || 0);
    const payload = err?.payload || null;
    const details = String(payload?.details || err?.message || "").trim();

    if (status === 401) {
      return `Nao da para salvar o ${panelLabel}: sua sessao expirou. Entre novamente.`;
    }

    if (status === 403) {
      return `Nao da para salvar o ${panelLabel}: voce nao tem permissao para essa acao.`;
    }

    if (status === 404) {
      return `Nao da para salvar o ${panelLabel}: a planilha compartilhada nao foi encontrada no servidor.`;
    }

    if (status === 409) {
      return `Nao da para salvar o ${panelLabel}: outra pessoa alterou a planilha antes. Atualize a tela e tente novamente.`;
    }

    if (/P2028|Transaction already closed|expired transaction|timeout/i.test(details)) {
      return `Nao da para salvar o ${panelLabel}: o servidor excedeu o tempo limite ao gravar a planilha. Tente novamente em alguns segundos.`;
    }

    if (payload?.error && payload?.details) {
      return `Nao da para salvar o ${panelLabel}: ${payload.error} Motivo: ${payload.details}`;
    }

    if (payload?.error) {
      return `Nao da para salvar o ${panelLabel}: ${payload.error}`;
    }

    if (details) {
      return `Nao da para salvar o ${panelLabel}: ${details}`;
    }

    return `Nao da para salvar o ${panelLabel}: erro inesperado no servidor.`;
  }

  function buildDirtyCellPayload() {
    if (!lastSavedPayload || !Array.isArray(lastSavedPayload.data)) {
      return { changes: [], structural: true };
    }

    const cols = getAllColumns().filter((col) => col.type !== "read");
    const previousRows = new Map(
      lastSavedPayload.data.map((row) => [String(row.__id || ""), row])
    );
    const currentRows = buildFlatRowsFromState();
    const changes = [];

    if (previousRows.size !== currentRows.length) {
      return { changes: [], structural: true };
    }

    for (const row of currentRows) {
      const rowId = String(row.__id || "");
      const previous = previousRows.get(rowId);
      if (!previous || Number(previous.sheet_index) !== Number(row.sheet_index)) {
        return { changes: [], structural: true };
      }

      cols.forEach((col) => {
        const nextValue = row[col.key] == null ? "" : String(row[col.key]);
        const prevValue = previous[col.key] == null ? "" : String(previous[col.key]);
        if (nextValue === prevValue) return;

        const meta = getCellMeta(rowId, col.key);
        changes.push({
          rowId,
          colKey: col.key,
          value: nextValue,
          expectedUpdatedAt: meta?.updatedAt || "",
        });
      });
    }

    return { changes, structural: false };
  }

  async function persistDirtyCellsToApi(changes) {
    const resp = await apiFetch(API_SHEET_CELLS_URL, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ changes }),
    });
    const data = await resp.json().catch(() => null);

    if (!resp.ok) {
      const err = new Error(data?.error || "Erro ao salvar células do Painel Tributário.");
      err.status = Number(resp.status || 500);
      err.payload = data;
      throw err;
    }

    return data;
  }

  async function syncFromApiIfIdle() {
    if (state.dirty) return;

    try {
      const payload = await loadStateFromApi();
      if (!payload) return;
      if (isEmptyApiPayload(payload)) return;

      const previousSignature = JSON.stringify(lastSavedPayload || null);
      if (!hydrateFromApiPayload(payload)) return;
      const nextSignature = JSON.stringify(lastSavedPayload || null);
      if (previousSignature === nextSignature) return;

      renderTable();
      emitRevenueMirrorChange();
    } catch (_) {}
  }

  function ensurePolling() {
    if (pollTimer) return;
    pollTimer = window.setInterval(() => {
      syncFromApiIfIdle().catch(() => {});
    }, POLL_INTERVAL_MS);
    window.addEventListener("focus", () => {
      syncFromApiIfIdle().catch(() => {});
    });
  }

  function currentSheet() {
    return state.sheets[state.sheetIndex];
  }

  function setCurrentSheet(rows) {
    state.sheets[state.sheetIndex] = rows;
  }

  function getQuarterMonths() {
    return QUARTER_MONTHS[state.sheetIndex] || ["Mês 1", "Mês 2", "Mês 3"];
  }

  function getDynamicColumns() {
    const [m1, m2, m3] = getQuarterMonths();

    const irCols = BASE_IR_COLUMNS.map((col) => {
      if (col.key === "fat1_m1" || col.key === "fat2_m1" || col.key === "fat3_m1") {
        return { ...col, label: `Fat ${m1}` };
      }
      if (col.key === "fat1_m2" || col.key === "fat2_m2" || col.key === "fat3_m2") {
        return { ...col, label: `Fat ${m2}` };
      }
      if (col.key === "fat1_m3" || col.key === "fat2_m3" || col.key === "fat3_m3") {
        return { ...col, label: `Fat ${m3}` };
      }
      return { ...col };
    });

    return [...BASE_META_COLUMNS, ...irCols, ...BASE_CSLL_COLUMNS];
  }

  function getPainelFrozenIndexes() {
    return getDynamicColumns().reduce((acc, col, idx) => {
      if (PT_FROZEN_COL_KEYS.includes(col.key)) acc.push(idx);
      return acc;
    }, []);
  }

  function createEmptyRow() {
    const row = { __id: genId(), __sourceRowId: "" };
    const cols = [...BASE_META_COLUMNS, ...BASE_IR_COLUMNS, ...BASE_CSLL_COLUMNS];

    cols.forEach((col) => {
      row[col.key] = "";
    });

    row.ir1 = "8";
    row.ir2 = "16";
    row.ir3 = "32";
    row.ir_quota_1 = "";
    row.ir_quota_2 = "";
    row.ir_quota_3 = "";

    return row;
  }

  function ensureDefaultPresuncao(row) {
      if (!row || typeof row !== "object") return row;
      if (String(row.ir1 ?? "").trim() === "") row.ir1 = "8";
      if (String(row.ir2 ?? "").trim() === "") row.ir2 = "16";
      if (String(row.ir3 ?? "").trim() === "") row.ir3 = "32";
      return row;
    }

    function getSheetIndexFromClientRowId(clientRowId = "") {
      const raw = String(clientRowId || "").trim();
      const match = raw.match(/^pt_(\d+)_/i);
      if (!match) return 0;
      return clamp(Number(match[1] || 0), 0, 3);
    }

  function getMirrorKey(row) {
      if (!row) return "";
      const cod = String(row.cod || "").trim();
      const doc = String(row.cnpj_cpf || "").trim();
      const razao = String(row.razao_social || "").trim().toLowerCase();
      const sourceId = String(row.__sourceRowId || "").trim();
 
      if (cod) return `cod:${cod}`;
      if (doc) return `doc:${doc}`;
      if (razao) return `razao:${razao}`;
      if (sourceId) return `src:${sourceId}`;
      return "";
    }

  function stableMirrorRowId(row, sheetIndex) {
    const baseKey = getMirrorKey(row)
      .replace(/[^a-z0-9:_-]+/gi, "_")
      .replace(/:+/g, "_")
      .replace(/^_+|_+$/g, "");

    return `pt_${Number(sheetIndex || 0)}_${baseKey || genId()}`;
  }

  function buildCadastralMirrorSignature() {
    return JSON.stringify(
      buildFlatRowsFromState().map((row) => [
        row.sheet_index,
        row.__id,
        row.__sourceRowId,
        ...CADASTRAL_KEYS.map((key) => String(row[key] ?? "")),
      ])
    );
  }

  async function persistSyncedContFlowMirror() {
    try {
      const { changes, structural } = buildDirtyCellPayload();
      if (structural) {
        await saveBase({ silent: true });
        return;
      }

      if (!changes.length) return;

      const response = await persistDirtyCellsToApi(changes);
      if (response) hydrateFromApiPayload(response);
      saveState();
      renderTable();
      emitRevenueMirrorChange();
    } catch (err) {
      console.error("Erro ao salvar espelho do ContFlow no Painel Tributário:", err);
    }
  }

  function syncFromContFlowRows(sourceRows, options = {}) {
    const normalizedSource = Array.isArray(sourceRows) ? sourceRows : [];
    if (!normalizedSource.length) return;

    const beforeSignature = buildCadastralMirrorSignature();

    state.sheets = state.sheets.map((sheetRows, sheetIndex) => {
      const existing = Array.isArray(sheetRows) ? sheetRows : [];
      const existingMap = new Map();

      existing.forEach((row) => {
        const key = getMirrorKey(row);
        if (key && !existingMap.has(key)) existingMap.set(key, row);
      });

      return normalizedSource.map((sourceRow) => {
        const rowKey = getMirrorKey(sourceRow);
        const base = rowKey && existingMap.has(rowKey) ? existingMap.get(rowKey) : createEmptyRow();
        const nextRow = createEmptyRow();

        Object.keys(nextRow).forEach((key) => {
          if (!CADASTRAL_KEYS.includes(key) && base[key] != null) nextRow[key] = base[key];
        });

        CADASTRAL_KEYS.forEach((key) => {
          nextRow[key] = sourceRow[key] ?? "";
        });

        nextRow.__id = base.__id || stableMirrorRowId(sourceRow, sheetIndex);
        nextRow.__sourceRowId = String(sourceRow.__sourceRowId || sourceRow.__id || "").trim();
        ensureDefaultPresuncao(nextRow);
        calcRow(nextRow);
        return nextRow;
      });
    });

    const changed = beforeSignature !== buildCadastralMirrorSignature();
    if (changed) state.dirty = true;

    renderTable();
    emitRevenueMirrorChange();
    if (changed && options?.persist) {
      persistSyncedContFlowMirror();
    }
    if (!lastSavedPayload || !Array.isArray(lastSavedPayload.data) || !lastSavedPayload.data.length) {
      saveBase({ silent: true }).catch((err) => console.error("Erro ao publicar base inicial do Painel Tributário:", err));
    }
  }

  function buildRevenueMirrorSheets() {
    return state.sheets.map((sheetRows) => {
      const rows = Array.isArray(sheetRows) ? sheetRows : [];
      return rows.map((row) => ({
        __id: row.__id || "",
        __sourceRowId: String(row.__sourceRowId || row.__id || "").trim(),
        cod: String(row.cod || "").trim(),
        cnpj_cpf: String(row.cnpj_cpf || "").trim(),
        razao_social: String(row.razao_social || "").trim(),
        fat_m1: toNumberBR(row.fat1_m1) + toNumberBR(row.fat2_m1) + toNumberBR(row.fat3_m1),
        fat_m2: toNumberBR(row.fat1_m2) + toNumberBR(row.fat2_m2) + toNumberBR(row.fat3_m2),
        fat_m3: toNumberBR(row.fat1_m3) + toNumberBR(row.fat2_m3) + toNumberBR(row.fat3_m3),
      }));
    });
  }

  function emitRevenueMirrorChange() {
    try {
      window.dispatchEvent(
        new CustomEvent("painel-tributario:revenue-sync", {
          detail: { sheets: buildRevenueMirrorSheets() },
        })
      );
    } catch (_) {}
  }

  function toNumberBR(value) {
    if (value == null) return 0;

    if (typeof value === "number") {
      return Number.isFinite(value) ? value : 0;
    }

    const raw = String(value)
      .trim()
      .replace(/R\$/gi, "")
      .replace(/\s/g, "");

    if (!raw) return 0;

    const txt = raw.includes(",")
      ? raw.replace(/\./g, "").replace(",", ".")
      : raw;

    if (!txt) return 0;

    const n = Number(txt);
    return Number.isFinite(n) ? n : 0;
  }

  function roundCalc(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.round((n + Number.EPSILON) * 1000) / 1000;
  }

  function toPercent(value) {
    const txt = String(value == null ? "" : value).trim().replace("%", "");
    const n = toNumberBR(txt);
    return n > 1 ? n / 100 : n;
  }

  function toAllowedPresuncao(value, fallback = 0) {
    const percent = toPercent(value);
    const allowed = [0.08, 0.16, 0.32];
    const found = allowed.find((item) => Math.abs(item - percent) < 0.000001);
    return found == null ? fallback : found;
  }

  function presuncaoFallbackByKey(key) {
    if (key === "ir1") return 0.08;
    if (key === "ir2") return 0.16;
    if (key === "ir3") return 0.32;
    return 0;
  }

  function formatMoney(value) {
    return toNumberBR(value).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function escapeHTML(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatPercent(value) {
    return (toPercent(value) * 100).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + "%";
  }

  function formatPercentInputValue(value) {
    return (toPercent(value) * 100).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + "%";
  }

  function getPercentDisplayFallback(col, value) {
    if (!col?.percent) return value;
    if (value != null && String(value).trim() !== "") return value;
    if (col.key === "ir1") return "8";
    if (col.key === "ir2") return "16";
    if (col.key === "ir3") return "32";
    return value;
  }

  function isMoneyColumn(col) {
    return col?.type === "number" && !col?.percent;
  }

  function formatEditableInputValue(col, value) {
    const normalizedValue = getPercentDisplayFallback(col, value);
    if (normalizedValue == null || String(normalizedValue).trim() === "") return "";
    if (col?.percent) return formatPercentInputValue(normalizedValue);
    if (isMoneyColumn(col)) return formatMoney(value);
    return String(value);
  }

  function normalizeEditableValue(col, value) {
    const raw = String(value ?? "").trim();
    if (!raw) return "";
    if (["ir1", "ir2", "ir3"].includes(col?.key)) {
      const allowed = toAllowedPresuncao(raw, presuncaoFallbackByKey(col.key));
      return formatPercentInputValue(allowed);
    }
    if (col?.percent) return formatPercentInputValue(raw);
    if (isMoneyColumn(col)) return formatMoney(raw);
    return raw;
  }

  function irToCsll(ir) {
    if (Math.abs(ir - 0.08) < 0.000001) return 0.12;
    if (Math.abs(ir - 0.16) < 0.000001) return 0.12;
    if (Math.abs(ir - 0.32) < 0.000001) return 0.32;
    return 0;
  }

  function calcRow(row) {
    const baseContext = getQuarterlyBaseContext(row);
    const outrasRec = roundCalc(toNumberBR(row.outras_rec));
    const totalBC = roundCalc(baseContext.bcTotal);
    const adicional = roundCalc(baseContext.adicionalIrpj10);
    const ir15 = roundCalc(baseContext.irpj15);
    const retIr = roundCalc(toNumberBR(row.retencoes_ir));
    const irAPagar = roundCalc(baseContext.irpjTotal - retIr);

    const csll1 = irToCsll(baseContext.blocks[0]?.percentual || 0);
    const csll2 = irToCsll(baseContext.blocks[1]?.percentual || 0);
    const csll3 = irToCsll(baseContext.blocks[2]?.percentual || 0);

    const bcCsll1 = roundCalc((baseContext.blocks[0]?.receita || 0) * csll1);
    const bcCsll2 = roundCalc((baseContext.blocks[1]?.receita || 0) * csll2);
    const bcCsll3 = roundCalc((baseContext.blocks[2]?.receita || 0) * csll3);

    const bc2Csll = roundCalc(bcCsll1 + bcCsll2 + bcCsll3 + outrasRec);
    const retCsll = roundCalc(toNumberBR(row.retencoes_csll));
    const csllAPagar = roundCalc(bc2Csll * 0.09 - retCsll);

    row.ir1 = formatPercentInputValue(baseContext.blocks[0]?.percentual || 0.08);
    row.ir2 = formatPercentInputValue(baseContext.blocks[1]?.percentual || 0.16);
    row.ir3 = formatPercentInputValue(baseContext.blocks[2]?.percentual || 0.32);
    row.receita_bruta = baseContext.receitaBrutaTotal;
    row.bc1 = baseContext.blocks[0]?.bcTotal || 0;
    row.bc2 = baseContext.blocks[1]?.bcTotal || 0;
    row.bc3 = baseContext.blocks[2]?.bcTotal || 0;
    row.total_bc = totalBC;
    row.adicional = adicional;
    row.ir15 = ir15;
    row.ir_a_pagar = irAPagar;
    row.csll_bc1 = csll1;
    row.csll_bc2 = csll2;
    row.csll_bc3 = csll3;
    row.bc2_csll = bc2Csll;
    row.csll_a_pagar = csllAPagar;
  }

  function getQuarterlyBaseContext(row) {
    const limitPerQuarter = 1250000;
    const additionalLimit = 60000;
    const outrasReceitas = roundCalc(toNumberBR(row.outras_rec));

    const rb1 = roundCalc(toNumberBR(row.fat1_m1) + toNumberBR(row.fat1_m2) + toNumberBR(row.fat1_m3));
    const rb2 = roundCalc(toNumberBR(row.fat2_m1) + toNumberBR(row.fat2_m2) + toNumberBR(row.fat2_m3));
    const rb3 = roundCalc(toNumberBR(row.fat3_m1) + toNumberBR(row.fat3_m2) + toNumberBR(row.fat3_m3));
    const p1 = toAllowedPresuncao(row.ir1, 0.08);
    const p2 = toAllowedPresuncao(row.ir2, 0.16);
    const p3 = toAllowedPresuncao(row.ir3, 0.32);

    const receitaBrutaTotal = rb1 + rb2 + rb3;
    const activeBaseCount = [rb1, rb2, rb3].filter((value) => value > 0).length;

    const blocks = [
      { key: "1", receita: rb1, percentual: p1 },
      { key: "2", receita: rb2, percentual: p2 },
      { key: "3", receita: rb3, percentual: p3 },
    ].map((block) => {
      const participacao = receitaBrutaTotal > 0 ? block.receita / receitaBrutaTotal : 0;
      const limiteProporcional = roundCalc(
        block.receita > 0
          ? activeBaseCount <= 1
            ? limitPerQuarter
            : limitPerQuarter * participacao
          : 0
      );
      const receitaNormal = roundCalc(Math.min(block.receita, limiteProporcional));
      const receitaExcedente = roundCalc(Math.max(0, block.receita - limiteProporcional));
      const percentualMajorado = roundCalc(block.percentual * 1.1);
      const bcNormal = roundCalc(receitaNormal * block.percentual);
      const bcExcedente = roundCalc(receitaExcedente * percentualMajorado);

      return {
        ...block,
        ratio: participacao,
        participacao,
        limiteProporcional,
        receitaComum: receitaNormal,
        receitaNormal,
        receitaExcedente,
        excedenteRateado: receitaExcedente,
        percentualMajorado,
        baseComum: bcNormal,
        bcNormal,
        baseMajorada: bcExcedente,
        bcExcedente,
        baseTotal: roundCalc(bcNormal + bcExcedente),
        bcTotal: roundCalc(bcNormal + bcExcedente),
      };
    });

    const commonRevenue = roundCalc(blocks.reduce((sum, block) => sum + block.receitaNormal, 0));
    const quarterlyExcess = roundCalc(blocks.reduce((sum, block) => sum + block.receitaExcedente, 0));
    const commonBase = roundCalc(blocks.reduce((sum, block) => sum + block.bcNormal, 0));
    const majoradaBase = roundCalc(blocks.reduce((sum, block) => sum + block.bcExcedente, 0));
    const bcPresumidaTotal = roundCalc(blocks.reduce((sum, block) => sum + block.bcTotal, 0));
    const bcTotal = roundCalc(bcPresumidaTotal + outrasReceitas);
    const irpj15 = roundCalc(bcTotal * 0.15);
    const baseAdicional = roundCalc(Math.max(0, bcTotal - additionalLimit));
    const adicionalIrpj10 = roundCalc(baseAdicional * 0.1);
    const irpjTotal = roundCalc(irpj15 + adicionalIrpj10);

    return {
      currentRevenue: receitaBrutaTotal,
      receitaBrutaTotal,
      activeBaseCount,
      commonRevenue,
      accumulatedRevenue: receitaBrutaTotal,
      accumulatedLimit: limitPerQuarter,
      accumulatedExcess: quarterlyExcess,
      quarterlyExcess,
      commonBase,
      majoradaBase,
      bcPresumidaTotal,
      outrasReceitas,
      bcTotal,
      irpj15,
      additionalLimit,
      baseAdicional,
      adicionalIrpj10,
      irpjTotal,
      blocks,
    };
  }

  function recalcAll() {
    currentSheet().forEach(calcRow);
  }

  function getFilteredRows() {
    const search = String(document.getElementById("pt-search")?.value || "")
      .trim()
      .toLowerCase();

    return currentSheet().filter((row) => {
      if (!search) return true;

      const txt = [
        row.cod,
        row.razao_social,
        row.cnpj_cpf,
        row.class,
        row.grupo,
        row.trib,
        row.status,
        row.resp1,
      ]
        .join(" ")
        .toLowerCase();

      return txt.includes(search);
    });
  }

  function updateStatusBar(totalRows) {
    const el = document.getElementById("pt-status-bar");
    if (!el) return;

    const suffix = state.dirty ? " · Pendências: alterações locais" : "";

    if (!state.lastSelectionBounds) {
      el.textContent = `Linhas: ${totalRows} · Selecionadas: 0 x 0${suffix}`;
      return;
    }

    const rowsSel = state.lastSelectionBounds.rowMax - state.lastSelectionBounds.rowMin + 1;
    const colsSel = state.lastSelectionBounds.colMax - state.lastSelectionBounds.colMin + 1;

    el.textContent = `Linhas: ${totalRows} · Selecionadas: ${rowsSel} x ${colsSel}${suffix}`;
  }

  function setSelection(rowMin, rowMax, colMin, colMax, totalRows) {
    const cols = getDynamicColumns();
    const maxRow = Math.max(0, totalRows - 1);
    const maxCol = Math.max(0, cols.length - 1);

    state.lastSelectionBounds = {
      rowMin: clamp(Math.min(rowMin, rowMax), 0, maxRow),
      rowMax: clamp(Math.max(rowMin, rowMax), 0, maxRow),
      colMin: clamp(Math.min(colMin, colMax), 0, maxCol),
      colMax: clamp(Math.max(colMin, colMax), 0, maxCol),
    };

    state.activeRow = state.lastSelectionBounds.rowMax;
    state.activeCol = state.lastSelectionBounds.colMax;
    state.selectionAnchor = { row: rowMin, col: colMin };

    updateStatusBar(totalRows);
  }

  function applySelectionVisual() {
    document.querySelectorAll("#pt-table .cf-cell").forEach((cell) => {
      cell.classList.remove("is-selected", "is-active");

      if (!state.lastSelectionBounds) return;

      const r = Number(cell.dataset.rowIndex);
      const c = Number(cell.dataset.colIndex);

      if (
        r >= state.lastSelectionBounds.rowMin &&
        r <= state.lastSelectionBounds.rowMax &&
        c >= state.lastSelectionBounds.colMin &&
        c <= state.lastSelectionBounds.colMax
      ) {
        cell.classList.add("is-selected");
      }

      if (r === state.activeRow && c === state.activeCol) {
        cell.classList.add("is-active");
      }
    });
  }

  async function copyTextToClipboard(text) {
      clipboardTextCache = String(text ?? "");
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
          return;
        }
      } catch (_) {}
      try {
        const ta = document.createElement("textarea");
        ta.value = String(text ?? "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      } catch (_) {}
    }
  
  async function readTextFromClipboard() {
      try {
        if (navigator.clipboard?.readText) {
          const text = await navigator.clipboard.readText();
          if (text != null && String(text) !== "") {
            clipboardTextCache = String(text);
            return clipboardTextCache;
          }
        }
      } catch (_) {}
      return clipboardTextCache || "";
    }

  async function copySelection() {
    const cols = getDynamicColumns();
    const rows = getFilteredRows();

    if (!rows.length || !state.lastSelectionBounds) return "";

    const out = [];

    for (let r = state.lastSelectionBounds.rowMin; r <= state.lastSelectionBounds.rowMax; r++) {
      const row = rows[r];
      if (!row) continue;

      const line = [];

      for (let c = state.lastSelectionBounds.colMin; c <= state.lastSelectionBounds.colMax; c++) {
        const col = cols[c];
        if (!col) continue;

        if (col.type === "read") line.push(col.percent ? formatPercent(row[col.key]) : formatMoney(row[col.key]));
        else line.push(String(row[col.key] ?? ""));
      }

      out.push(line.join("\t"));
    }

    const text = out.join("\n");
    await copyTextToClipboard(text);
    return text;
  }

  async function pasteSelection(textOverride) {
    const cols = getDynamicColumns();
    const rows = getFilteredRows();

    if (!rows.length || !state.lastSelectionBounds) return;

    const text = textOverride ?? (await readTextFromClipboard());
    if (!text) return;

    const matrix = text
      .split(/\r?\n/)
      .filter((x) => x !== "")
      .map((line) => line.split("\t"));

    const startRow = state.lastSelectionBounds.rowMin;
    const startCol = state.lastSelectionBounds.colMin;

    matrix.forEach((line, rOffset) => {
      const row = rows[startRow + rOffset];
      if (!row) return;

      line.forEach((value, cOffset) => {
        const col = cols[startCol + cOffset];
        if (!col || col.type === "read") return;
        row[col.key] = value;
      });

      calcRow(row);
    });

    state.dirty = true;
    renderTable();

    requestAnimationFrame(() => {
      const target = document.querySelector(
        `.cf-input[data-row-index="${startRow}"][data-col-index="${startCol}"]`
      );
      if (target) target.focus();
    });
  }

  async function handleCopyEvent(e) {
    if (activeView() !== "painel-tributario") return;
    if (!state.lastSelectionBounds) return;

    const text = await copySelection();
    if (!text) return;

    if (e.clipboardData) {
      e.preventDefault();
      e.clipboardData.setData("text/plain", text);
    }
  }

  async function handlePasteEvent(e) {
    if (activeView() !== "painel-tributario") return;
    if (!state.lastSelectionBounds) return;

    const text = e.clipboardData?.getData("text/plain");
    if (!text) return;

    e.preventDefault();
    clipboardTextCache = String(text);
    await pasteSelection(text);
  }

  function clearSelectionValues() {
    const cols = getDynamicColumns();
    const rows = getFilteredRows();

    if (!rows.length || !state.lastSelectionBounds) return;

    for (let r = state.lastSelectionBounds.rowMin; r <= state.lastSelectionBounds.rowMax; r++) {
      const row = rows[r];
      if (!row) continue;

      for (let c = state.lastSelectionBounds.colMin; c <= state.lastSelectionBounds.colMax; c++) {
        const col = cols[c];
        if (!col || col.type === "read") continue;
        row[col.key] = "";
      }

      calcRow(row);
    }

    state.dirty = true;
    renderTable();
  }

  function ctrlJump(rows, cols, viewRow, colIndex, dRow, dCol) {
    const maxRow = Math.max(0, rows.length - 1);
    const maxCol = Math.max(0, cols.length - 1);
    let r = clamp(viewRow, 0, maxRow);
    let c = clamp(colIndex, 0, maxCol);

    const isEmptyAt = (rowIndex, colIdx) => {
      const row = rows[rowIndex];
      const col = cols[colIdx];
      if (!row || !col) return true;
      return String(row[col.key] ?? "").trim() === "";
    };

    if (dRow !== 0) {
      const currentEmpty = isEmptyAt(r, c);
      let cursor = r + dRow;

      while (cursor >= 0 && cursor <= maxRow && isEmptyAt(cursor, c) === currentEmpty) {
        r = cursor;
        cursor += dRow;
      }

      while (cursor >= 0 && cursor <= maxRow && isEmptyAt(cursor, c)) {
        r = cursor;
        cursor += dRow;
      }

      return { row: r, col: c };
    }

    const currentEmpty = isEmptyAt(r, c);
    let cursor = c + dCol;

    while (cursor >= 0 && cursor <= maxCol && isEmptyAt(r, cursor) === currentEmpty) {
      c = cursor;
      cursor += dCol;
    }

    while (cursor >= 0 && cursor <= maxCol && isEmptyAt(r, cursor)) {
      c = cursor;
      cursor += dCol;
    }

    return { row: r, col: c };
  }

  function addRow() {
    const rows = currentSheet();
    rows.push(createEmptyRow());
    setCurrentSheet(rows);
    state.dirty = true;
    renderTable();
  }

  function insertRowBelow() {
    const visibleRows = getFilteredRows();
    const sheetRows = currentSheet();

    if (!visibleRows.length) {
      addRow();
      return;
    }

    const currentVisibleRow = clamp(state.activeRow, 0, visibleRows.length - 1);
    const rowRef = visibleRows[currentVisibleRow];
    const realIndex = sheetRows.findIndex((r) => r.__id === rowRef.__id);

    if (realIndex < 0) return;

    sheetRows.splice(realIndex + 1, 0, createEmptyRow());
    state.dirty = true;
    renderTable();

    requestAnimationFrame(() => {
      const target = document.querySelector(
        `.cf-input[data-row-index="${currentVisibleRow + 1}"][data-col-index="0"]`
      );
      if (target) target.focus();
    });
  }

  function duplicateSelectedRows() {
    const visibleRows = getFilteredRows();
    const sheetRows = currentSheet();

    if (!visibleRows.length || !state.lastSelectionBounds) return;

    const rowsToDuplicate = [];

    for (let r = state.lastSelectionBounds.rowMin; r <= state.lastSelectionBounds.rowMax; r++) {
      if (visibleRows[r]) rowsToDuplicate.push(visibleRows[r]);
    }

    if (!rowsToDuplicate.length) return;

    const lastRow = rowsToDuplicate[rowsToDuplicate.length - 1];
    const insertAfter = sheetRows.findIndex((r) => r.__id === lastRow.__id);
    if (insertAfter < 0) return;

    const clones = rowsToDuplicate.map((row) => {
      const clone = deepClone(row);
      clone.__id = genId();
      return clone;
    });

    sheetRows.splice(insertAfter + 1, 0, ...clones);
    state.dirty = true;
    renderTable();
  }

  function deleteSelectedRows() {
    if (!state.lastSelectionBounds) return;

    const visibleRows = getFilteredRows();
    const ids = [];

    for (let i = state.lastSelectionBounds.rowMin; i <= state.lastSelectionBounds.rowMax; i++) {
      if (visibleRows[i]) ids.push(visibleRows[i].__id);
    }

    if (!ids.length) return;

    const rows = currentSheet().filter((r) => !ids.includes(r.__id));
    setCurrentSheet(rows.length ? rows : [createEmptyRow()]);
    state.lastSelectionBounds = null;
    state.dirty = true;
    renderTable();
  }

  function exportJson() {
    const payload = {
      sheetIndex: state.sheetIndex,
      rows: currentSheet(),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `painel_tributario_planilha_${state.sheetIndex + 1}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function getReportCellValue(col, row) {
    if (!col) return "";
    if (col.type === "read") return readCellContent(col, row);
    if (col.percent) return formatPercent(row[col.key]);
    if (col.type === "number") return formatMoney(row[col.key]);
    return row[col.key] == null ? "" : String(row[col.key]);
  }

  function exportXlsx() {
    if (typeof XLSX === "undefined") {
      alert("Não foi possível exportar XLSX: biblioteca XLSX não carregou.");
      return;
    }

    recalcAll();
    const cols = getDynamicColumns();
    const rows = getFilteredRows();
    if (!rows.length) {
      const ok = confirm("A visão está vazia (filtros?). Exportar mesmo assim?");
      if (!ok) return;
    }

    const header = ["#", ...cols.map((col) => col.label)];
    const body = rows.map((row, index) => [
      index + 1,
      ...cols.map((col) => getReportCellValue(col, row)),
    ]);

    const aoa = [
      [`Painel Tributário - ${SHEET_TITLES[state.sheetIndex]} (${getQuarterMonths().join(", ")})`],
      [],
      header,
      ...body,
    ];

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = header.map((label) => ({
      wch: Math.min(Math.max(String(label || "").length + 4, 12), 36),
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Painel Tributario");

    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `painel_tributario_${state.sheetIndex + 1}_trimestre_${stamp}.xlsx`);
  }

  function importJson(file) {
    const reader = new FileReader();

    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);

        if (!data || !Array.isArray(data.rows)) {
          alert("Arquivo inválido.");
          return;
        }

        const rows = data.rows.map((r) => {
          const row = createEmptyRow();

          Object.keys(row).forEach((k) => {
            if (r[k] != null) row[k] = r[k];
          });

          row.__id = genId();
          calcRow(row);
          return row;
        });

        setCurrentSheet(rows.length ? rows : [createEmptyRow()]);
        state.lastSelectionBounds = null;
        state.dirty = true;
        renderTable();
      } catch (err) {
        console.error(err);
        alert("Erro ao importar JSON.");
      }
    };

    reader.readAsText(file);
  }

  function renderHeaders() {
    const cols = getDynamicColumns();
    const thead = document.getElementById("pt-thead");
    if (!thead) return;

    thead.innerHTML = `
      <tr class="group-row">
        <th id="pt-corner-select" class="group-meta" rowspan="2">#</th>
        <th class="group-meta" colspan="7">Dados cadastrais</th>
        <th class="group-meta group-meta-rest" colspan="3"></th>
        <th class="group-ir" colspan="5">BC-1</th>
        <th class="group-ir" colspan="5">BC-2</th>
        <th class="group-ir" colspan="5">BC-3</th>
        <th class="group-ir" colspan="6">Fechamento IRPJ</th>
        <th class="group-csll" colspan="6">Fechamento CSLL</th>
      </tr>
      <tr class="cols-row">
        ${cols.map((col) => `<th>${col.label}</th>`).join("")}
      </tr>
    `;
  }

  function readCellContent(col, row) {
    if (col.percent) return formatPercent(row[col.key]);
    return formatMoney(row[col.key]);
  }

  function formatMoneyInput(value) {
    return formatMoney(value);
  }

  function getAllowedQuotaCount(total) {
    const safeTotal = Math.max(0, Number(total) || 0);
    if (safeTotal > 3000) return 3;
    if (safeTotal >= 2000) return 2;
    return 1;
  }

  function splitIntoQuotas(total, parts = 3) {
    const safeTotal = Math.max(0, Number(total) || 0);
    const cents = Math.round(safeTotal * 100);
    const base = Math.floor(cents / parts);
    const rest = cents - base * parts;
    return Array.from({ length: parts }, (_, index) => (base + (index < rest ? 1 : 0)) / 100);
  }

  function getRowById(rowId) {
    return currentSheet().find((row) => row.__id === rowId) || null;
  }

  function getActiveModalRow() {
    return state.modalRowId ? getRowById(state.modalRowId) : null;
  }

  function getQuotaTaxConfig() {
    if (state.modalTaxKind === "base_total") {
      return {
        title: "Base Total do IRPJ",
        chip: "Base Total",
        totalLabel: "Base total apurada",
        grossLabel: "Total BC",
        retentionLabel: "Outras receitas",
        getGrossValue: (row) => toNumberBR(row.total_bc),
        retentionKey: "outras_rec",
        totalKey: "total_bc",
        showQuotas: false,
      };
    }

    if (state.modalTaxKind === "csll") {
      return {
        title: "Parcelas da CSLL",
        chip: "CSLL",
        totalLabel: "Valor liquido para recolhimento",
        grossLabel: "CSLL Devida",
        retentionLabel: "Retencoes",
        getGrossValue: (row) => toNumberBR(row.bc2_csll) * 0.09,
        retentionKey: "retencoes_csll",
        totalKey: "csll_a_pagar",
        showQuotas: true,
      };
    }

    return {
      title: "Parcelas do IRPJ",
      chip: "IRPJ",
      totalLabel: "Valor liquido para recolhimento",
      grossLabel: "IRPJ Devido",
      retentionLabel: "Retencoes",
      getGrossValue: (row) => toNumberBR(row.ir15) + toNumberBR(row.adicional),
      retentionKey: "retencoes_ir",
      totalKey: "ir_a_pagar",
      showQuotas: true,
    };
  }

  function ensureBaseTotalDetailsContainer(baseCalcEl) {
    if (!baseCalcEl) return null;
    let container = baseCalcEl.querySelector("#pt-base-total-details");
    if (container) return container;

    container = document.createElement("section");
    container.id = "pt-base-total-details";
    container.className = "pt-base-total-panel pt-base-total-panel--details";
    baseCalcEl.appendChild(container);
    return container;
  }

  function renderBaseTotalDetails(baseCalcEl, baseContext) {
    const container = ensureBaseTotalDetailsContainer(baseCalcEl);
    if (!container || !baseContext) return;

    const baseRows = baseContext.blocks
      .map((block) => `
        <tr>
          <td>BC-${escapeHTML(block.key)}</td>
          <td>${formatMoney(block.receita)}</td>
          <td>${formatPercent(block.participacao)}</td>
          <td>${formatMoney(block.limiteProporcional)}</td>
          <td>${formatMoney(block.receitaNormal)}</td>
          <td>${formatMoney(block.receitaExcedente)}</td>
          <td>${formatPercent(block.percentual)}</td>
          <td>${formatPercent(block.percentualMajorado)}</td>
          <td>${formatMoney(block.bcNormal)}</td>
          <td>${formatMoney(block.bcExcedente)}</td>
          <td>${formatMoney(block.bcTotal)}</td>
        </tr>
      `)
      .join("");

    container.innerHTML = `
      <div class="pt-base-total-panel-head">
        <div>
          <span>4. Conferência</span>
          <strong>Resumo final do IRPJ</strong>
        </div>
      </div>

      <div class="pt-base-total-breakdown">
        <div class="pt-base-total-row">
          <span>Receita bruta total</span>
          <strong>${formatMoney(baseContext.receitaBrutaTotal)}</strong>
        </div>
        <div class="pt-base-total-row">
          <span>Limite trimestral usado</span>
          <strong>${formatMoney(baseContext.accumulatedLimit)}</strong>
        </div>
        <div class="pt-base-total-row">
          <span>Bases com receita</span>
          <strong>${String(baseContext.activeBaseCount)}</strong>
        </div>
        <div class="pt-base-total-row is-total">
          <span>Base presumida</span>
          <strong>${formatMoney(baseContext.bcPresumidaTotal)}</strong>
        </div>
        <div class="pt-base-total-row">
          <span>Outras receitas</span>
          <strong>${formatMoney(baseContext.outrasReceitas)}</strong>
        </div>
        <div class="pt-base-total-row is-total">
          <span>Base total</span>
          <strong>${formatMoney(baseContext.bcTotal)}</strong>
        </div>
        <div class="pt-base-total-row">
          <span>IRPJ 15%</span>
          <strong>${formatMoney(baseContext.irpj15)}</strong>
        </div>
        <div class="pt-base-total-row">
          <span>Base para adicional</span>
          <strong>${formatMoney(baseContext.baseAdicional)}</strong>
        </div>
        <div class="pt-base-total-row">
          <span>Adicional de IRPJ 10%</span>
          <strong>${formatMoney(baseContext.adicionalIrpj10)}</strong>
        </div>
        <div class="pt-base-total-row is-total">
          <span>IRPJ total</span>
          <strong>${formatMoney(baseContext.irpjTotal)}</strong>
        </div>
      </div>

      <div class="pt-base-total-detail-table-wrap">
        <table class="pt-base-total-detail-table">
          <caption>Detalhe por base: receita, limite proporcional, excedente e BC calculada.</caption>
          <thead>
            <tr>
              <th>Base</th>
              <th>Receita</th>
              <th>Part.</th>
              <th>Limite</th>
              <th>Normal</th>
              <th>Excedente</th>
              <th>Presunção</th>
              <th>Majorada</th>
              <th>BC Normal</th>
              <th>BC Excedente</th>
              <th>BC Total</th>
            </tr>
          </thead>
          <tbody>${baseRows}</tbody>
        </table>
      </div>
    `;
  }

  function renderQuotaPanel() {
    const panel = document.getElementById("pt-quota-panel");
    const baseCalcEl = document.getElementById("pt-base-total-calc");
    const quotaSummaryEl = document.querySelector(".pt-quota-summary");
    const totalEl = document.getElementById("pt-quota-total");
    const grossEl = document.getElementById("pt-quota-gross");
    const retentionEl = document.getElementById("pt-quota-retention");
    const chipEl = document.getElementById("pt-quota-chip");
    const totalLabelEl = document.getElementById("pt-quota-total-label");
    const grossLabelEl = document.getElementById("pt-quota-gross-label");
    const retentionLabelEl = document.getElementById("pt-quota-retention-label");
    const ruleTitleEl = document.getElementById("pt-quota-rule-title");
    const quotaBlockEl = document.querySelector(".pt-quota-block");
    const quotaCards = [
      document.getElementById("pt-quota-card-1"),
      document.getElementById("pt-quota-card-2"),
      document.getElementById("pt-quota-card-3"),
    ];
    const twoXLabelEl = document.getElementById("pt-quota-preview-label");
    const previewEl = document.getElementById("pt-quota-preview");
    const twoXEls = [document.getElementById("pt-quota-2x-1"), document.getElementById("pt-quota-2x-2")];
    const quotaEls = [
      document.getElementById("pt-quota-1"),
      document.getElementById("pt-quota-2"),
      document.getElementById("pt-quota-3"),
    ];

    if (
      !panel ||
      !baseCalcEl ||
      !quotaSummaryEl ||
      !totalEl ||
      !grossEl ||
      !retentionEl ||
      !ruleTitleEl ||
      !previewEl ||
      quotaCards.some((card) => !card) ||
      !twoXLabelEl ||
      twoXEls.some((el) => !el) ||
      quotaEls.some((el) => !el)
    ) {
      return;
    }

    const row = getActiveModalRow();
    const shouldShow = state.modalMode === "quota" && !!row;
    panel.hidden = !shouldShow;

    if (!shouldShow) return;

    const config = getQuotaTaxConfig();
    const gross = typeof config.getGrossValue === "function" ? config.getGrossValue(row) : 0;
    const retention = toNumberBR(row[config.retentionKey]);
    const total = toNumberBR(row[config.totalKey]);
    const rb1 = toNumberBR(row.fat1_m1) + toNumberBR(row.fat1_m2) + toNumberBR(row.fat1_m3);
    const rb2 = toNumberBR(row.fat2_m1) + toNumberBR(row.fat2_m2) + toNumberBR(row.fat2_m3);
    const rb3 = toNumberBR(row.fat3_m1) + toNumberBR(row.fat3_m2) + toNumberBR(row.fat3_m3);
    const p1 = toPercent(row.ir1);
    const p2 = toPercent(row.ir2);
    const p3 = toPercent(row.ir3);
    const allowedQuotaCount = getAllowedQuotaCount(total);
    const quotaValues = splitIntoQuotas(total, allowedQuotaCount);
    const twoXValues = splitIntoQuotas(total, 2);

    if (chipEl) chipEl.textContent = config.chip;
    if (totalLabelEl) totalLabelEl.textContent = config.totalLabel;
    if (grossLabelEl) grossLabelEl.textContent = config.grossLabel;
    if (retentionLabelEl) retentionLabelEl.textContent = config.retentionLabel;
    grossEl.textContent = formatMoney(gross);
    retentionEl.textContent = `- ${formatMoney(retention)}`;
    totalEl.textContent = formatMoney(total);
    baseCalcEl.hidden = state.modalTaxKind !== "base_total";
    quotaSummaryEl.hidden = state.modalTaxKind === "base_total";

    if (state.modalTaxKind === "base_total") {
      const baseContext = getQuarterlyBaseContext(row);
      const bc1El = document.getElementById("pt-base-total-bc1");
      const bc2El = document.getElementById("pt-base-total-bc2");
      const bc3El = document.getElementById("pt-base-total-bc3");
      const bc1MetaEl = document.getElementById("pt-base-total-bc1-meta");
      const bc2MetaEl = document.getElementById("pt-base-total-bc2-meta");
      const bc3MetaEl = document.getElementById("pt-base-total-bc3-meta");
      const receitaEl = document.getElementById("pt-base-total-receita");
      const receitaComumEl = document.getElementById("pt-base-total-receita-comum");
      const baseComumEl = document.getElementById("pt-base-total-base-comum");
      const baseMajoradaEl = document.getElementById("pt-base-total-base-majorada");
      const outrasEl = document.getElementById("pt-base-total-outras");
      const totalBcEl = document.getElementById("pt-base-total-total");
      const bannerReceitaEl = document.getElementById("pt-base-total-banner-receita");
      const bannerBaseEl = document.getElementById("pt-base-total-banner-base");
      const bannerExcedenteEl = document.getElementById("pt-base-total-banner-excedente");
      const acumEl = document.getElementById("pt-base-total-acum");
      const limiteEl = document.getElementById("pt-base-total-limite");
      const excedenteAcumEl = document.getElementById("pt-base-total-excedente-acum");
      const excedenteTriEl = document.getElementById("pt-base-total-excedente-tri");
      const rateio1El = document.getElementById("pt-base-total-rateio-1");
      const rateio2El = document.getElementById("pt-base-total-rateio-2");
      const rateio3El = document.getElementById("pt-base-total-rateio-3");
      const rateio1MetaEl = document.getElementById("pt-base-total-rateio-1-meta");
      const rateio2MetaEl = document.getElementById("pt-base-total-rateio-2-meta");
      const rateio3MetaEl = document.getElementById("pt-base-total-rateio-3-meta");
      const rateio1ReceitaEl = document.getElementById("pt-base-total-rateio-1-receita");
      const rateio2ReceitaEl = document.getElementById("pt-base-total-rateio-2-receita");
      const rateio3ReceitaEl = document.getElementById("pt-base-total-rateio-3-receita");
      const rateio1ShareEl = document.getElementById("pt-base-total-rateio-1-share");
      const rateio2ShareEl = document.getElementById("pt-base-total-rateio-2-share");
      const rateio3ShareEl = document.getElementById("pt-base-total-rateio-3-share");
      const rateio1ExcedenteEl = document.getElementById("pt-base-total-rateio-1-excedente");
      const rateio2ExcedenteEl = document.getElementById("pt-base-total-rateio-2-excedente");
      const rateio3ExcedenteEl = document.getElementById("pt-base-total-rateio-3-excedente");

      renderBaseTotalDetails(baseCalcEl, baseContext);

      if (bc1El) bc1El.textContent = formatMoney(baseContext.blocks[0]?.bcTotal || 0);
      if (bc2El) bc2El.textContent = formatMoney(baseContext.blocks[1]?.bcTotal || 0);
      if (bc3El) bc3El.textContent = formatMoney(baseContext.blocks[2]?.bcTotal || 0);
      if (bc1MetaEl) bc1MetaEl.textContent = `${formatMoney(baseContext.blocks[0]?.receitaNormal || 0)} x ${formatPercent(baseContext.blocks[0]?.percentual || 0)} + ${formatMoney(baseContext.blocks[0]?.receitaExcedente || 0)} x ${formatPercent(baseContext.blocks[0]?.percentualMajorado || 0)}`;
      if (bc2MetaEl) bc2MetaEl.textContent = `${formatMoney(baseContext.blocks[1]?.receitaNormal || 0)} x ${formatPercent(baseContext.blocks[1]?.percentual || 0)} + ${formatMoney(baseContext.blocks[1]?.receitaExcedente || 0)} x ${formatPercent(baseContext.blocks[1]?.percentualMajorado || 0)}`;
      if (bc3MetaEl) bc3MetaEl.textContent = `${formatMoney(baseContext.blocks[2]?.receitaNormal || 0)} x ${formatPercent(baseContext.blocks[2]?.percentual || 0)} + ${formatMoney(baseContext.blocks[2]?.receitaExcedente || 0)} x ${formatPercent(baseContext.blocks[2]?.percentualMajorado || 0)}`;
      if (bannerReceitaEl) bannerReceitaEl.textContent = formatMoney(baseContext.receitaBrutaTotal);
      if (bannerBaseEl) bannerBaseEl.textContent = formatMoney(baseContext.bcTotal);
      if (bannerExcedenteEl) bannerExcedenteEl.textContent = formatMoney(baseContext.quarterlyExcess);
      if (receitaEl) receitaEl.textContent = formatMoney(baseContext.receitaBrutaTotal);
      if (receitaComumEl) receitaComumEl.textContent = formatMoney(baseContext.commonRevenue);
      if (baseComumEl) baseComumEl.textContent = formatMoney(baseContext.commonBase);
      if (baseMajoradaEl) baseMajoradaEl.textContent = formatMoney(baseContext.majoradaBase);
      if (outrasEl) outrasEl.textContent = formatMoney(baseContext.outrasReceitas);
      if (totalBcEl) totalBcEl.textContent = formatMoney(baseContext.bcTotal);
      if (acumEl) acumEl.textContent = formatMoney(baseContext.accumulatedRevenue);
      if (limiteEl) limiteEl.textContent = formatMoney(baseContext.accumulatedLimit);
      if (excedenteAcumEl) excedenteAcumEl.textContent = formatMoney(baseContext.accumulatedExcess);
      if (excedenteTriEl) excedenteTriEl.textContent = formatMoney(baseContext.quarterlyExcess);
      if (rateio1El) rateio1El.textContent = formatMoney(baseContext.blocks[0]?.bcExcedente || 0);
      if (rateio2El) rateio2El.textContent = formatMoney(baseContext.blocks[1]?.bcExcedente || 0);
      if (rateio3El) rateio3El.textContent = formatMoney(baseContext.blocks[2]?.bcExcedente || 0);
      if (rateio1MetaEl) {
        rateio1MetaEl.textContent = `${formatMoney(baseContext.blocks[0]?.excedenteRateado || 0)} x ${formatPercent(baseContext.blocks[0]?.percentualMajorado || 0)}`;
      }
      if (rateio2MetaEl) {
        rateio2MetaEl.textContent = `${formatMoney(baseContext.blocks[1]?.excedenteRateado || 0)} x ${formatPercent(baseContext.blocks[1]?.percentualMajorado || 0)}`;
      }
      if (rateio3MetaEl) {
        rateio3MetaEl.textContent = `${formatMoney(baseContext.blocks[2]?.excedenteRateado || 0)} x ${formatPercent(baseContext.blocks[2]?.percentualMajorado || 0)}`;
      }
      if (rateio1ReceitaEl) rateio1ReceitaEl.textContent = formatMoney(baseContext.blocks[0]?.receita || 0);
      if (rateio2ReceitaEl) rateio2ReceitaEl.textContent = formatMoney(baseContext.blocks[1]?.receita || 0);
      if (rateio3ReceitaEl) rateio3ReceitaEl.textContent = formatMoney(baseContext.blocks[2]?.receita || 0);
      if (rateio1ShareEl) rateio1ShareEl.textContent = formatPercent(baseContext.blocks[0]?.ratio || 0);
      if (rateio2ShareEl) rateio2ShareEl.textContent = formatPercent(baseContext.blocks[1]?.ratio || 0);
      if (rateio3ShareEl) rateio3ShareEl.textContent = formatPercent(baseContext.blocks[2]?.ratio || 0);
      if (rateio1ExcedenteEl) {
        rateio1ExcedenteEl.textContent = formatMoney(baseContext.blocks[0]?.excedenteRateado || 0);
      }
      if (rateio2ExcedenteEl) {
        rateio2ExcedenteEl.textContent = formatMoney(baseContext.blocks[1]?.excedenteRateado || 0);
      }
      if (rateio3ExcedenteEl) {
        rateio3ExcedenteEl.textContent = formatMoney(baseContext.blocks[2]?.excedenteRateado || 0);
      }
    }

    if (!config.showQuotas) {
      if (quotaBlockEl) quotaBlockEl.hidden = true;
      previewEl.hidden = true;
      return;
    }

    if (quotaBlockEl) quotaBlockEl.hidden = false;
    baseCalcEl.hidden = true;
    quotaSummaryEl.hidden = false;
    quotaEls[0].textContent = formatMoneyInput(quotaValues[0] || 0);
    quotaEls[1].textContent = formatMoneyInput(quotaValues[1] || 0);
    quotaEls[2].textContent = formatMoneyInput(quotaValues[2] || 0);
    quotaCards[0].classList.toggle("is-hidden", false);
    quotaCards[1].classList.toggle("is-hidden", allowedQuotaCount < 2);
    quotaCards[2].classList.toggle("is-hidden", allowedQuotaCount < 3);
    ruleTitleEl.textContent =
      allowedQuotaCount === 1 ? "Quota unica obrigatoria" : `${allowedQuotaCount} quotas permitidas`;
    previewEl.hidden = allowedQuotaCount < 3;
    twoXLabelEl.textContent = "Opcao em 2 quotas";
    twoXEls[0].textContent = formatMoney(twoXValues[0]);
    twoXEls[1].textContent = formatMoney(twoXValues[1]);
  }

  function renderModalMode() {
    const modal = document.getElementById("pt-modal");
    const title = document.getElementById("pt-modal-title");
    if (!modal) return;
    modal.classList.toggle("is-quota-mode", state.modalMode === "quota");
    modal.classList.toggle("is-base-total-mode", state.modalMode === "quota" && state.modalTaxKind === "base_total");
    if (title) title.textContent = state.modalMode === "quota" ? getQuotaTaxConfig().title : "Base Painel Tributario";
  }

  function isModalTriggerColumn(col) {
    return col?.key === "ir_a_pagar" || col?.key === "csll_a_pagar" || col?.key === "total_bc";
  }

  function renderReadCell(td, col, row, rowIndex, colIndex, totalRows) {
    if (isModalTriggerColumn(col)) {
      const wrap = document.createElement("div");
      wrap.className = "cf-read-action";

      const span = document.createElement("span");
      span.className = "cf-read";
      span.dataset.readKey = col.key;
      if (col.readClass) span.classList.add(col.readClass);
      span.textContent = readCellContent(col, row);

      const button = document.createElement("button");
      button.type = "button";
      button.className = "cf-cell-action-btn";
      button.textContent = "...";
      const taxKind =
        col.key === "csll_a_pagar"
          ? "csll"
          : col.key === "total_bc"
            ? "base_total"
            : "irpj";
      const taxLabel =
        taxKind === "csll" ? "CSLL" : taxKind === "base_total" ? "Base Total" : "IRPJ";
      const actionLabel = taxKind === "base_total" ? `Abrir modal da ${taxLabel}` : `Abrir modal da ${taxLabel} a pagar`;
      button.setAttribute("aria-label", actionLabel);
      button.title = "Abrir modal";
      button.addEventListener("click", (e) => {
        e.stopPropagation();
        setSelection(rowIndex, rowIndex, colIndex, colIndex, totalRows);
        applySelectionVisual();
        openModal("quota", row.__id, taxKind);
      });

      wrap.appendChild(span);
      wrap.appendChild(button);
      td.appendChild(wrap);
      return;
    }

    const span = document.createElement("span");
    span.className = "cf-read";
    span.dataset.readKey = col.key;
    if (col.readClass) span.classList.add(col.readClass);
    span.textContent = readCellContent(col, row);
    td.appendChild(span);
  }

  function updateRowDisplay(rowId) {
    const cols = getDynamicColumns();
    const row = currentSheet().find((r) => r.__id === rowId);

    if (!row) return;

    calcRow(row);

    const rowEl = document.querySelector(`tr[data-row-id="${rowId}"]`);
    if (rowEl) {
      cols.forEach((col) => {
        if (col.type !== "read") return;

        const readEl = rowEl.querySelector(`[data-read-key="${col.key}"]`);
        if (readEl) readEl.textContent = readCellContent(col, row);
      });
    }

    renderFooter();
    updateStatusBar(getFilteredRows().length);
    emitRevenueMirrorChange();
  }

  function renderBody(rows) {
    const cols = getDynamicColumns();
    const tbody = document.getElementById("pt-tbody");
    if (!tbody) return;

    tbody.innerHTML = "";

    if (!rows.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = cols.length + 1;
      td.textContent = "Nenhuma linha encontrada.";
      td.style.textAlign = "center";
      td.style.padding = "12px";
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }

    rows.forEach((row, rowIndex) => {
      ensureDefaultPresuncao(row);
      const tr = document.createElement("tr");
      tr.dataset.rowId = row.__id;

      const idxTd = document.createElement("td");
      idxTd.className = "cf-row-index";
      idxTd.textContent = String(rowIndex + 1);

      idxTd.addEventListener("click", () => {
        setSelection(rowIndex, rowIndex, 0, cols.length - 1, rows.length);
        applySelectionVisual();
      });

      tr.appendChild(idxTd);

      cols.forEach((col, colIndex) => {
        const td = document.createElement("td");
        td.className = "cf-cell";
        td.dataset.rowIndex = String(rowIndex);
        td.dataset.colIndex = String(colIndex);

        td.addEventListener("mousedown", (e) => {
          if (e.button !== 0) return;

          state.mouseSelecting = true;
          state.selectionAnchor = { row: rowIndex, col: colIndex };
          setSelection(rowIndex, rowIndex, colIndex, colIndex, rows.length);
          applySelectionVisual();
        });

        td.addEventListener("mouseenter", () => {
          if (!state.mouseSelecting || !state.selectionAnchor) return;

          setSelection(state.selectionAnchor.row, rowIndex, state.selectionAnchor.col, colIndex, rows.length);
          applySelectionVisual();
        });

        if (col.type === "read") {
          renderReadCell(td, col, row, rowIndex, colIndex, rows.length);
        } else {
          const input = document.createElement("input");
          input.className = "cf-input";
          if (col.type === "number") input.classList.add("right");

          input.value = formatEditableInputValue(col, row[col.key]);
          input.dataset.rowIndex = String(rowIndex);
          input.dataset.colIndex = String(colIndex);
          input.dataset.rowId = row.__id;
          input.dataset.colKey = col.key;

          input.addEventListener("focus", () => {
            if (state.suppressSelectionFocus) {
              state.suppressSelectionFocus = false;
              return;
            }
            setSelection(rowIndex, rowIndex, colIndex, colIndex, rows.length);
            applySelectionVisual();
          });

          input.addEventListener("click", (e) => {
            e.stopPropagation();
            setSelection(rowIndex, rowIndex, colIndex, colIndex, rows.length);
            applySelectionVisual();
          });

          input.addEventListener("input", (e) => {
            row[col.key] = e.target.value;
            state.dirty = true;
            updateRowDisplay(row.__id);
          });

          input.addEventListener("blur", (e) => {
            const normalizedValue = normalizeEditableValue(col, e.target.value);
            row[col.key] = normalizedValue;
            e.target.value = normalizedValue;
            state.dirty = true;
            updateRowDisplay(row.__id);
          });

          input.addEventListener("keydown", (e) => handleInputKeyDown(e, rowIndex, colIndex, rows.length));
          td.appendChild(input);
        }

        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });
  }

  function renderFooter() {
    const tfoot = document.getElementById("pt-tfoot");
    if (tfoot) tfoot.innerHTML = "";
  }

  function updatePainelHeaderMetrics() {
    const table = document.getElementById("pt-table");
    const wrapper = document.querySelector("#view-painel-tributario .table-wrapper");
    if (!table || !wrapper) return;

    const groupRowHeight = table.querySelector(".group-row")?.offsetHeight || 30;
    const colsRowHeight = table.querySelector(".cols-row")?.offsetHeight || 30;
    wrapper.style.setProperty("--pt-group-row-height", `${groupRowHeight}px`);
    wrapper.style.setProperty("--pt-cols-row-top", `${groupRowHeight}px`);
    wrapper.style.setProperty("--pt-header-height", `${groupRowHeight + colsRowHeight}px`);
  }

  function applyPainelFrozenColumns() {
    const table = document.getElementById("pt-table");
    if (!table) return;

    updatePainelHeaderMetrics();

    const wrapper = document.querySelector("#view-painel-tributario .table-wrapper");
    const groupRowTop = wrapper
      ? getComputedStyle(wrapper).getPropertyValue("--pt-cols-row-top").trim() || "30px"
      : "30px";

    const corner = document.getElementById("pt-corner-select");
    if (corner) {
      corner.style.setProperty("position", "sticky", "important");
      corner.style.setProperty("left", "0px", "important");
      corner.style.setProperty("top", "0px", "important");
      corner.style.setProperty("z-index", "48", "important");
    }

    table.querySelectorAll(".group-row th, .cols-row th, .cf-cell, .cf-row-index").forEach((el) => {
      el.classList.remove("pt-frozen-col", "pt-frozen-col-last");
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

    const frozenIndexes = getPainelFrozenIndexes();
    if (!frozenIndexes.length) return;

    const colEls = Array.from(table.querySelectorAll("colgroup col"));
    const frozenWidths = [];
    let left = 40;

    frozenIndexes.forEach((colIndex, frozenPos) => {
      const colEl = colEls[colIndex + 1];
      const parsed = Number.parseFloat(String(colEl?.style.width || "").trim());
      const width = Number.isFinite(parsed)
        ? parsed
        : table.querySelector(`.cols-row th:nth-child(${colIndex + 1})`)?.offsetWidth || 140;
      const leftPx = `${left}px`;
      const widthPx = `${width}px`;
      const isLastFrozen = frozenPos === frozenIndexes.length - 1;
      frozenWidths.push(width);

      const header = table.querySelector(`.cols-row th:nth-child(${colIndex + 1})`);
      if (header) {
        header.classList.add("pt-frozen-col");
        if (isLastFrozen) header.classList.add("pt-frozen-col-last");
        header.style.setProperty("position", "sticky", "important");
        header.style.setProperty("top", groupRowTop, "important");
        header.style.setProperty("left", leftPx, "important");
        header.style.setProperty("width", widthPx, "important");
        header.style.setProperty("min-width", widthPx, "important");
        header.style.setProperty("max-width", widthPx, "important");
        header.style.setProperty("z-index", isLastFrozen ? "46" : "45", "important");
      }

      table.querySelectorAll(`.cf-cell[data-col-index="${colIndex}"]`).forEach((cell) => {
        cell.classList.add("pt-frozen-col");
        if (isLastFrozen) cell.classList.add("pt-frozen-col-last");
        cell.style.setProperty("position", "sticky", "important");
        cell.style.setProperty("left", leftPx, "important");
        cell.style.setProperty("width", widthPx, "important");
        cell.style.setProperty("min-width", widthPx, "important");
        cell.style.setProperty("max-width", widthPx, "important");
        cell.style.setProperty("z-index", isLastFrozen ? "18" : "17", "important");
      });

      left += width;
    });

    const groupMeta = table.querySelector('.group-row th.group-meta[colspan="7"]');
    if (groupMeta) {
      const frozenGroupWidth = frozenWidths.slice(0, PT_FROZEN_GROUP_COLSPAN).reduce((sum, width) => sum + width, 0);
      groupMeta.classList.add("pt-frozen-col", "pt-frozen-col-last");
      groupMeta.style.setProperty("position", "sticky", "important");
      groupMeta.style.setProperty("top", "0px", "important");
      groupMeta.style.setProperty("left", "40px", "important");
      groupMeta.style.setProperty("width", `${frozenGroupWidth}px`, "important");
      groupMeta.style.setProperty("min-width", `${frozenGroupWidth}px`, "important");
      groupMeta.style.setProperty("max-width", `${frozenGroupWidth}px`, "important");
      groupMeta.style.setProperty("z-index", "47", "important");
    }
  }

  function renderTable() {
    recalcAll();
    renderHeaders();

    const rows = getFilteredRows();
    renderBody(rows);
    renderFooter();
    updateStatusBar(rows.length);
    updatePainelHeaderMetrics();

    const titleEl = document.getElementById("pt-sheet-title");
    if (titleEl) titleEl.textContent = `${SHEET_TITLES[state.sheetIndex]} · ${getQuarterMonths().join(", ")}`;

    applySelectionVisual();
    requestAnimationFrame(() => applyPainelFrozenColumns());
  }

  function getPainelStickyOffsets() {
    const wrapper = document.querySelector("#view-painel-tributario .table-wrapper");
    if (!wrapper) return { headerH: 60, leftW: 40 };

    const styles = getComputedStyle(wrapper);
    const headerH = Number.parseFloat(styles.getPropertyValue("--pt-header-height")) || 60;

    const frozenIndexes = getPainelFrozenIndexes();
    const colEls = Array.from(document.querySelectorAll("#pt-table colgroup col"));
    let leftW = 40;

    frozenIndexes.forEach((colIndex) => {
      const colEl = colEls[colIndex + 1];
      const width = Number.parseFloat(String(colEl?.style.width || "").trim());
      leftW += Number.isFinite(width) ? width : 140;
    });

    return { headerH, leftW };
  }

  function scrollPainelCellIntoView(targetEl) {
    const wrapper = document.querySelector("#view-painel-tributario .table-wrapper");
    if (!wrapper || !targetEl) return;

    const cell = targetEl.closest("td") || targetEl;
    if (!cell) return;

    const { headerH, leftW } = getPainelStickyOffsets();
    const padding = 12;

    const cellTop = cell.offsetTop;
    const cellBottom = cellTop + cell.offsetHeight;
    const cellLeft = cell.offsetLeft;
    const cellRight = cellLeft + cell.offsetWidth;

    const visibleTop = wrapper.scrollTop;
    const visibleBottom = visibleTop + wrapper.clientHeight;
    const minVisibleTop = visibleTop + headerH + padding;
    const maxVisibleBottom = visibleBottom - padding;

    if (cellTop < minVisibleTop) {
      wrapper.scrollTop = Math.max(0, cellTop - headerH - padding);
    } else if (cellBottom > maxVisibleBottom) {
      wrapper.scrollTop = cellBottom - wrapper.clientHeight + padding;
    }

    const visibleLeft = wrapper.scrollLeft;
    const visibleRight = visibleLeft + wrapper.clientWidth;
    const minVisibleLeft = visibleLeft + leftW + padding;
    const maxVisibleRight = visibleRight - padding;

    if (cellLeft < minVisibleLeft) {
      wrapper.scrollLeft = Math.max(0, cellLeft - leftW - padding);
    } else if (cellRight > maxVisibleRight) {
      wrapper.scrollLeft = cellRight - wrapper.clientWidth + padding;
    }
  }

  function focusCell(rowIndex, colIndex, preserveSelection = false) {
    const target = document.querySelector(
      `#pt-table .cf-input[data-row-index="${rowIndex}"][data-col-index="${colIndex}"]`
    );

    if (target) {
      state.suppressSelectionFocus = Boolean(preserveSelection);
      target.focus();
      if (typeof target.select === "function") target.select();
      requestAnimationFrame(() => scrollPainelCellIntoView(target));
    }
  }

  function handleInputKeyDown(e, rowIndex, colIndex, totalRows) {
    const cols = getDynamicColumns();
    const rows = getFilteredRows();
    const maxRow = totalRows - 1;
    const maxCol = cols.length - 1;

    let nextRow = rowIndex;
    let nextCol = colIndex;
    const input = e.currentTarget;

    if ((e.ctrlKey || e.metaKey) && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
      e.preventDefault();

      let dRow = 0;
      let dCol = 0;
      if (e.key === "ArrowUp") dRow = -1;
      if (e.key === "ArrowDown") dRow = 1;
      if (e.key === "ArrowLeft") dCol = -1;
      if (e.key === "ArrowRight") dCol = 1;

      const jumped = ctrlJump(rows, cols, rowIndex, colIndex, dRow, dCol);

      requestAnimationFrame(() => {
        if (e.shiftKey) {
          const anchorRow = state.selectionAnchor?.row ?? rowIndex;
          const anchorCol = state.selectionAnchor?.col ?? colIndex;
          setSelection(anchorRow, jumped.row, anchorCol, jumped.col, rows.length);
          applySelectionVisual();
          focusCell(jumped.row, jumped.col, true);
          return;
        }

        focusCell(jumped.row, jumped.col);
      });
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      nextRow = clamp(rowIndex + (e.shiftKey ? -1 : 1), 0, maxRow);
    } else if (e.key === "Tab") {
      e.preventDefault();
      nextCol = clamp(colIndex + (e.shiftKey ? -1 : 1), 0, maxCol);
    } else if (e.key === "ArrowRight" && input.selectionStart === input.value.length) {
      nextCol = clamp(colIndex + 1, 0, maxCol);
    } else if (e.key === "ArrowLeft" && input.selectionStart === 0) {
      nextCol = clamp(colIndex - 1, 0, maxCol);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      nextRow = clamp(rowIndex + 1, 0, maxRow);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      nextRow = clamp(rowIndex - 1, 0, maxRow);
    } else {
      return;
    }

    requestAnimationFrame(() => {
      focusCell(nextRow, nextCol);
    });
  }

  async function handleGlobalKeyDown(e) {
    if (activeView() !== "painel-tributario") return;

    const tag = document.activeElement?.tagName?.toLowerCase();
    const isInInput = tag === "input" || tag === "textarea";
    const rows = getFilteredRows();
    const cols = getDynamicColumns();
    const isCtrl = e.ctrlKey || e.metaKey;
    const isShift = e.shiftKey;

    if (isCtrl && !isShift && e.key.toLowerCase() === "c") {
      e.preventDefault();
      await copySelection();
      return;
    }

    if (isCtrl && !isShift && e.key.toLowerCase() === "v") {
      e.preventDefault();
      await pasteSelection();
      return;
    }

    if (isCtrl && !isShift && e.key.toLowerCase() === "d") {
      e.preventDefault();
      duplicateSelectedRows();
      return;
    }

    if (isCtrl && isShift && e.key === "Enter") {
      e.preventDefault();
      insertRowBelow();
      return;
    }

    if (isCtrl && !isShift && (e.key === "a" || e.key === "A")) {
      if (!rows.length || !cols.length) return;
      e.preventDefault();
      setSelection(0, rows.length - 1, 0, cols.length - 1, rows.length);
      applySelectionVisual();
      focusCell(0, 0, true);
      return;
    }

    if (!isCtrl && isShift && (e.code === "Space" || e.key === " " || e.key === "Spacebar")) {
      if (!rows.length || !cols.length) return;
      e.preventDefault();
      setSelection(state.activeRow, state.activeRow, 0, cols.length - 1, rows.length);
      applySelectionVisual();
      focusCell(state.activeRow, state.activeCol, true);
      return;
    }

    if (isCtrl && !isShift && (e.code === "Space" || e.key === " " || e.key === "Spacebar")) {
      if (!rows.length || !cols.length) return;
      e.preventDefault();
      setSelection(0, rows.length - 1, state.activeCol, state.activeCol, rows.length);
      applySelectionVisual();
      focusCell(state.activeRow, state.activeCol, true);
      return;
    }

    if (rows.length && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key) && isCtrl) {
      e.preventDefault();

      let dRow = 0;
      let dCol = 0;
      if (e.key === "ArrowUp") dRow = -1;
      if (e.key === "ArrowDown") dRow = 1;
      if (e.key === "ArrowLeft") dCol = -1;
      if (e.key === "ArrowRight") dCol = 1;

      const jumped = ctrlJump(rows, cols, state.activeRow, state.activeCol, dRow, dCol);

      if (isShift) {
        const anchorRow = state.selectionAnchor?.row ?? state.activeRow;
        const anchorCol = state.selectionAnchor?.col ?? state.activeCol;
        setSelection(anchorRow, jumped.row, anchorCol, jumped.col, rows.length);
        applySelectionVisual();
        focusCell(jumped.row, jumped.col, true);
      } else {
        focusCell(jumped.row, jumped.col);
      }
      return;
    }

    if ((e.key === "Delete" || e.key === "Backspace") && !isInInput) {
      e.preventDefault();
      clearSelectionValues();
    }
  }

  function saveState() {
    const payload = {
      sheetIndex: state.sheetIndex,
      sheets: state.sheets,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    state.dirty = false;
    updateStatusBar(getFilteredRows().length);
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;

      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.sheets)) return false;

      state.sheetIndex = clamp(Number(data.sheetIndex || 0), 0, 3);
      state.sheets = [0, 1, 2, 3].map((idx) => {
        const rows = Array.isArray(data.sheets[idx]) ? data.sheets[idx] : [];
        if (!rows.length) return Array.from({ length: MAX_ROWS_START }, () => createEmptyRow());

        return rows.map((source) => {
          const row = createEmptyRow();
          Object.keys(row).forEach((key) => {
            if (source[key] != null) row[key] = source[key];
          });
          ensureDefaultPresuncao(row);
          row.__id = source.__id || genId();
          calcRow(row);
          return row;
        });
      });

      state.dirty = false;
      return true;
    } catch (err) {
      console.warn("Falha ao carregar Painel Tributário:", err);
      return false;
    }
  }

  async function saveCells() {
    try {
      if (!state.dirty) {
        alert("Nao da para salvar o Painel Tributario: nao ha alteracoes pendentes.");
        return;
      }

      const { changes, structural } = buildDirtyCellPayload();
      if (structural) {
        alert("Nao da para salvar so as celulas do Painel Tributario: ha alteracoes estruturais. Use Salvar base.");
        return;
      }

      if (!changes.length) {
        alert("Nao da para salvar o Painel Tributario: nao ha celulas validas pendentes.");
        return;
      }

      const response = await persistDirtyCellsToApi(changes);
      if (Array.isArray(response?.invalid) && response.invalid.length) {
        alert("Nao da para salvar o Painel Tributario: algumas linhas ou colunas nao foram reconhecidas pelo servidor. Use Salvar base para realinhar a planilha.");
        return;
      }

      if (response) hydrateFromApiPayload(response);
      saveState();
      renderTable();
      emitRevenueMirrorChange();
      alert("Pode salvar: as alteracoes do Painel Tributario foram sincronizadas com sucesso.");
    } catch (err) {
      console.error("Erro ao salvar células do Painel Tributário:", err);
      alert(explainSaveFailure(err, "Painel Tributario"));
    }
  }

  async function saveBase(options = {}) {
    try {
      const payload = buildServerPayload();
      const response = await persistBaseToApi(payload);
      if (response) hydrateFromApiPayload(response);
      saveState();
      renderTable();
      emitRevenueMirrorChange();
      if (!options?.silent) alert("Pode salvar: a base do Painel Tributario foi sincronizada com sucesso.");
    } catch (err) {
      console.error("Erro ao salvar base do Painel Tributário:", err);
      saveState();
      if (!options?.silent) {
        alert(explainSaveFailure(err, "Painel Tributario"));
      }
    }
  }

  function openModal(mode = "base", rowId = "", taxKind = "irpj") {
    state.modalMode = mode;
    state.modalRowId = rowId || "";
    state.modalTaxKind =
      taxKind === "csll" ? "csll" : taxKind === "base_total" ? "base_total" : "irpj";
    renderModalMode();
    renderQuotaPanel();
    document.getElementById("pt-modal")?.classList.add("is-open");
    document.getElementById("pt-modal-backdrop")?.classList.add("is-open");
  }

  function closeModal() {
    state.modalMode = "base";
    state.modalRowId = "";
    state.modalTaxKind = "irpj";
    renderModalMode();
    renderQuotaPanel();
    document.getElementById("pt-modal")?.classList.remove("is-open");
    document.getElementById("pt-modal-backdrop")?.classList.remove("is-open");
  }

  function switchView(view) {
    const nextView = String(view || "contflow");

    if (nextView !== "painel-tributario") {
      closeModal();
    }

    document.querySelectorAll(".cf-view-btn").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.view === nextView);
    });

    document.querySelectorAll(".cf-view").forEach((section) => {
      section.classList.toggle("is-active", section.id === `view-${nextView}`);
    });

  }

  function initRows() {
    state.sheets[0] = Array.from({ length: MAX_ROWS_START }, () => createEmptyRow());
    state.sheets[1] = Array.from({ length: MAX_ROWS_START }, () => createEmptyRow());
    state.sheets[2] = Array.from({ length: MAX_ROWS_START }, () => createEmptyRow());
    state.sheets[3] = Array.from({ length: MAX_ROWS_START }, () => createEmptyRow());
    state.dirty = false;
  }

  function bindEvents() {
    if (state.bound) return;
    state.bound = true;

    document.querySelectorAll(".cf-view-btn").forEach((btn) => {
      btn.addEventListener("click", () => switchView(btn.dataset.view));
    });

    document.querySelectorAll("#view-painel-tributario .cf-sheet-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        document
          .querySelectorAll("#view-painel-tributario .cf-sheet-tab")
          .forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        state.sheetIndex = Number(btn.dataset.sheet);
        state.lastSelectionBounds = null;
        const search = document.getElementById("pt-search");
        if (search) search.value = "";
        renderTable();
      });
    });

    document.getElementById("pt-search")?.addEventListener("input", () => {
      state.lastSelectionBounds = null;
      renderTable();
    });

    window.addEventListener("resize", () =>
      requestAnimationFrame(() => {
        updatePainelHeaderMetrics();
        applyPainelFrozenColumns();
      })
    );

    document.getElementById("pt-base-btn")?.addEventListener("click", () => openModal("base"));
    document.getElementById("pt-modal-close")?.addEventListener("click", closeModal);
    document.getElementById("pt-modal-backdrop")?.addEventListener("click", closeModal);

    document.getElementById("pt-add-row")?.addEventListener("click", () => {
      addRow();
      closeModal();
    });

    document.getElementById("pt-export-json")?.addEventListener("click", () => {
      exportJson();
      closeModal();
    });

    document.getElementById("pt-export-xlsx")?.addEventListener("click", () => {
      exportXlsx();
      closeModal();
    });

    document.getElementById("pt-export-xlsx-top")?.addEventListener("click", exportXlsx);

    document.getElementById("pt-import")?.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (file) importJson(file);
      e.target.value = "";
      closeModal();
    });

    document.getElementById("pt-save-cells")?.addEventListener("click", saveCells);
    document.getElementById("pt-save-cells-top")?.addEventListener("click", saveCells);
    document.getElementById("pt-save-base")?.addEventListener("click", () => {
      saveBase();
      closeModal();
    });

    document.getElementById("pt-delete-selected")?.addEventListener("click", () => {
      deleteSelectedRows();
      closeModal();
    });

    document.addEventListener("mouseup", () => {
      state.mouseSelecting = false;
    });

    document.addEventListener("keydown", handleGlobalKeyDown);
    document.addEventListener("copy", handleCopyEvent);
    document.addEventListener("paste", handlePasteEvent);
  }

  async function init() {
    let loaded = false;
    try {
      const payload = await loadStateFromApi();
      loaded = !isEmptyApiPayload(payload) && hydrateFromApiPayload(payload);
    } catch (_) {
      loaded = false;
    }

    if (!loaded && !loadState()) initRows();
    bindEvents();
    renderTable();
    emitRevenueMirrorChange();
    ensurePolling();
    console.log("✅ Painel Tributário pronto.");
  }

  return {
    init,
    closeModal,
    switchView,
    hasPendingChanges: () => state.dirty,
    syncFromContFlowRows,
    exportRevenueMirrorSheets: buildRevenueMirrorSheets,
    notifyRevenueMirrorChange: emitRevenueMirrorChange,
  };
})();
