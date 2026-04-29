console.log("⚡ Painel Tributário JS carregando...");

window.PainelTributarioLRASheet = (() => {
    const STORAGE_KEY = "conthub:contflow:painel-tributario-lra:v3";
  const API_SHEET_KEY = "painel-tributario-lra";
  const API_SHEET_URL = `/api/sheets/${API_SHEET_KEY}`;
  const API_SHEET_CELLS_URL = `${API_SHEET_URL}/cells`;
  const POLL_INTERVAL_MS = 8000;
  const MAX_ROWS_START = 15;
  const TRIB_MODE_FILTER = "LRA";
  const MONTH_TITLES = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ];
  const MONTH_SHORT_TITLES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const MONTH_COUNT = MONTH_TITLES.length;

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

  const LR_COLUMNS = [
    { key: "fat_total", label: "Receita Bruta", type: "read", readClass: "read-ir" },
    { key: "resultado_antes_irpj_csll", label: "Resultado antes do IRPJ e CSLL", type: "number" },
    { key: "adicoes", label: "Adições", type: "number" },
    { key: "exclusoes", label: "Exclusoes", type: "number" },
    { key: "compensacao_prej", label: "Compensação Prej.", type: "number" },
    { key: "bc", label: "BC", type: "read", readClass: "read-ir" },
    { key: "irpj_devido_15", label: "IRPJ devido 15%", type: "read", readClass: "read-ir" },
    { key: "irpj_adicional_lra", label: "IRPJ adicional- LRA", type: "read", readClass: "read-ir" },
    { key: "retencoes_incentivos_pagos", label: "Retenções e incentivos e pagos", type: "number" },
    { key: "irpj_a_pagar", label: "IRPJ a pagar", type: "read", readClass: "read-ir" },
    { key: "csll_devida", label: "CSLL devida", type: "read", readClass: "read-csll" },
    { key: "retencoes_pagos_csll", label: "Retenções pagos", type: "number" },
    { key: "csll_a_pagar", label: "CSLL a pagar", type: "read", readClass: "read-csll" },
  ];

  const state = {
    sheetIndex: 0,
    sheets: Array.from({ length: MONTH_COUNT }, () => []),
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
    lastRevenueMirrorSignature: "",
    };
    let cellMeta = new Map();
    let lastSavedPayload = null;
    let pollTimer = null;
    let clipboardTextCache = "";

  const IRPJ_ADICIONAL_LIMIT = 20000;

  function detectTribMode(value) {
    const normalized = String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toUpperCase();

    if (!normalized) return "";
    if (normalized === "LRA" || normalized.includes("REAL ANUAL") || normalized.includes("LUCRO REAL ANUAL")) return "LRA";
    if (
      normalized === "LRT" ||
      normalized.includes("REAL TRIMESTRAL") ||
      normalized.includes("LUCRO REAL TRIMESTRAL") ||
      normalized.includes("REAL TRIMESTRA")
    ) {
      return "LRT";
    }
    return normalized;
  }

  function remapNodeIdentifiers(root) {
    if (!root) return;

    if (root.id && root.id.startsWith("pt-")) {
      root.id = root.id.replace(/^pt-/, "ptlra-");
    }

    if (root.classList?.contains("cf-sheet-tab")) {
      root.classList.remove("cf-sheet-tab");
      root.classList.add("cf-sheet-tab-lr");
    }

    Array.from(root.children || []).forEach(remapNodeIdentifiers);
  }

  function ensureLRDom() {
    if (document.getElementById("view-painel-tributario-lra")) return;

    const sourceView = document.getElementById("view-painel-tributario");
    const sourceBackdrop = document.getElementById("pt-modal-backdrop");
    const sourceModal = document.getElementById("pt-modal");
    if (!sourceView || !sourceBackdrop || !sourceModal) return;

    const lrView = sourceView.cloneNode(true);
    lrView.id = "view-painel-tributario-lra";
    lrView.classList.remove("is-active");
    remapNodeIdentifiers(lrView);
    lrView.querySelector('[id="ptlra-sheet-title"]')?.replaceChildren(document.createTextNode("Painel Tributário - LRA"));
    const tabs = lrView.querySelector(".cf-sheet-tabs");
    if (tabs) {
      tabs.innerHTML = MONTH_SHORT_TITLES.map(
        (month, index) =>
          `<button class="cf-btn cf-sheet-tab-lr${index === 0 ? " is-active" : ""}" type="button" data-sheet="${index}">${month}</button>`
      ).join("");
    }
    const lrTopSave = lrView.querySelector("#ptlra-save-cells-top");
    if (lrTopSave) lrTopSave.id = "ptlra-save-cells-top";
    const lrBaseBtn = lrView.querySelector("#ptlra-base-btn");
    if (lrBaseBtn) {
      lrBaseBtn.id = "ptlra-base-btn";
      lrBaseBtn.hidden = true;
    }
    sourceView.insertAdjacentElement("afterend", lrView);

    const lrBackdrop = sourceBackdrop.cloneNode(true);
    lrBackdrop.id = "ptlra-modal-backdrop";
    sourceBackdrop.insertAdjacentElement("afterend", lrBackdrop);

    const lrModal = sourceModal.cloneNode(true);
    lrModal.id = "ptlra-modal";
    remapNodeIdentifiers(lrModal);
    lrModal.setAttribute("aria-label", "Base Painel Tributário - LRA");
    const modalTitle = lrModal.querySelector("#ptlra-modal-title");
    if (modalTitle) modalTitle.textContent = "Base Painel Tributário - LRA";
    const modalActions = lrModal.querySelector(".cf-modal-actions");
    if (modalActions) {
      const additionalCalc = document.createElement("section");
      additionalCalc.id = "ptlra-additional-calc";
      additionalCalc.className = "pt-base-total-calc";
      additionalCalc.hidden = true;
      additionalCalc.innerHTML = `
        <div class="pt-base-total-head">
          <div class="pt-base-total-head-copy">
            <span>Memória de cálculo</span>
            <strong>IRPJ adicional</strong>
            <p id="ptlra-additional-summary">Leitura automática com base na coluna Trib.</p>
          </div>
          <div id="ptlra-additional-chip" class="pt-base-total-tag">LRA</div>
        </div>
        <div class="pt-base-total-grid">
          <div class="pt-base-total-card">
            <span class="pt-base-total-card-label">Tributação lida</span>
            <strong id="ptlra-additional-trib">-</strong>
            <small id="ptlra-additional-rule">Sem regra aplicada.</small>
          </div>
          <div class="pt-base-total-card">
            <span class="pt-base-total-card-label">Parcela a deduzir</span>
            <strong id="ptlra-additional-limit">R$ 0,00</strong>
            <small>Faixa fixa para o adicional.</small>
          </div>
          <div class="pt-base-total-card">
            <span class="pt-base-total-card-label">Alíquota adicional</span>
            <strong id="ptlra-additional-rate">0,00%</strong>
            <small>Aplicada apenas quando a tributação combinar.</small>
          </div>
          <div class="pt-base-total-card">
            <span class="pt-base-total-card-label">Excedente tributável</span>
            <strong id="ptlra-additional-excess">R$ 0,00</strong>
            <small id="ptlra-additional-excess-note">BC acima da faixa de dedução.</small>
          </div>
        </div>
        <div class="pt-base-total-row-list">
          <div class="pt-base-total-row">
            <span>Base de cálculo (BC)</span>
            <strong id="ptlra-additional-bc">R$ 0,00</strong>
          </div>
          <div class="pt-base-total-row">
            <span>Fórmula aplicada</span>
            <strong id="ptlra-additional-formula">0</strong>
          </div>
          <div class="pt-base-total-row is-total">
            <span>IRPJ adicional apurado</span>
            <strong id="ptlra-additional-total">R$ 0,00</strong>
          </div>
        </div>
      `;
      modalActions.insertAdjacentElement("beforebegin", additionalCalc);
    }
    lrBackdrop.insertAdjacentElement("afterend", lrModal);
  }

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
    return [...BASE_META_COLUMNS, ...LR_COLUMNS];
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
        sheetRows.push(row);
      });
    });

    return sheetRows;
  }

  function buildServerPayload() {
    return {
      version: 1,
      savedAt: new Date().toISOString(),
      columns: [{ key: "sheet_index", label: "Mês" }, ...getAllColumns().map(({ key, label }) => ({ key, label }))],
      data: buildFlatRowsFromState(),
    };
  }

  function applyFlatRowsToState(rows) {
    const buckets = Array.from({ length: MONTH_COUNT }, () => []);
    const cols = getAllColumns();

    (Array.isArray(rows) ? rows : []).forEach((source) => {
      const sheetIndex = clamp(Number(source?.sheet_index || 0), 0, MONTH_COUNT - 1);
      const row = createEmptyRow();
      cols.forEach((col) => {
        if (source[col.key] != null) row[col.key] = source[col.key];
      });
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
        const row = { __id: String(rowRef.clientRowId || genId()), sheet_index: 0 };
        rowMap.set(Number(rowRef.id), row);
        clientRowIdMap.set(Number(rowRef.id), row.__id);
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
      throw new Error("API indisponível no Painel Tributário - LRA.");
    }

    const resp = await apiFetch(API_SHEET_URL, { method: "GET" });
    const data = await resp.json().catch(() => null);

    if (!resp.ok) {
      throw new Error(data?.error || "Erro ao carregar Painel Tributário - LRA da API.");
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
      const err = new Error(data?.error || "Erro ao salvar base do Painel Tributário - LRA.");
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
      const err = new Error(data?.error || "Erro ao salvar células do Painel Tributário - LRA.");
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
      if (previousSignature === nextSignature) {
        requestPainelTributarioRevenueSync(true);
        return;
      }

      renderTable();
      requestPainelTributarioRevenueSync(true);
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

  function getMonthTitle(index = state.sheetIndex) {
    return MONTH_TITLES[index] || `Mês ${Number(index || 0) + 1}`;
  }

  function getMonthShortTitle(index = state.sheetIndex) {
    return MONTH_SHORT_TITLES[index] || getMonthTitle(index);
  }

  function getSourceQuarterIndex(monthIndex = state.sheetIndex) {
    return Math.floor(Number(monthIndex || 0) / 3);
  }

  function getSourceRevenueKey(monthIndex = state.sheetIndex) {
    return `fat_m${(Number(monthIndex || 0) % 3) + 1}`;
  }

  function getDynamicColumns() {
    const lrCols = LR_COLUMNS.map((col) => {
      if (col.key === "fat_total") {
        return { ...col, label: `Receita Bruta ${getMonthShortTitle()}` };
      }
      return { ...col };
    });

    return [...BASE_META_COLUMNS, ...lrCols];
  }

  function getPainelFrozenIndexes() {
    return getDynamicColumns().reduce((acc, col, idx) => {
      if (PT_FROZEN_COL_KEYS.includes(col.key)) acc.push(idx);
      return acc;
    }, []);
  }

  function createEmptyRow() {
    const row = { __id: genId(), __sourceRowId: "" };
    const cols = [...BASE_META_COLUMNS, ...LR_COLUMNS];

    cols.forEach((col) => {
      row[col.key] = "";
    });

    return row;
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

    return `ptlra_${Number(sheetIndex || 0)}_${baseKey || genId()}`;
  }

  function buildRevenueMirrorSignature(sourceSheets) {
    return JSON.stringify(
      (Array.isArray(sourceSheets) ? sourceSheets : []).map((sheetRows, sheetIndex) =>
        (Array.isArray(sheetRows) ? sheetRows : [])
          .map((row) => {
            const key = getMirrorKey(row);
            if (!key) return null;

            return [
              sheetIndex,
              key,
              String(row.cod || "").trim(),
              String(row.cnpj_cpf || "").trim(),
              String(row.razao_social || "").trim().toLowerCase(),
              toNumberBR(row.fat_m1),
              toNumberBR(row.fat_m2),
              toNumberBR(row.fat_m3),
            ];
          })
          .filter(Boolean)
      )
    );
  }

  function getPainelTributarioRevenueSheets() {
    if (
      window.PainelTributarioSheet &&
      typeof window.PainelTributarioSheet.exportRevenueMirrorSheets === "function"
    ) {
      return window.PainelTributarioSheet.exportRevenueMirrorSheets();
    }

    return [];
  }

  function requestPainelTributarioRevenueSync(force = false, sourceSheets = null) {
    const normalizedSourceSheets = Array.isArray(sourceSheets) ? sourceSheets : getPainelTributarioRevenueSheets();
    if (!Array.isArray(normalizedSourceSheets) || !normalizedSourceSheets.length) return false;

    const signature = buildRevenueMirrorSignature(normalizedSourceSheets);
    if (!force && signature === state.lastRevenueMirrorSignature) {
      return false;
    }

    const changed = syncRevenueFromPainelTributarioSheets(normalizedSourceSheets);
    state.lastRevenueMirrorSignature = signature;
    return changed;
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
      requestPainelTributarioRevenueSync(true);
      saveState();
      renderTable();
    } catch (err) {
      console.error("Erro ao salvar espelho do ContFlow no Painel Tributário - LRA:", err);
    }
  }

  function syncFromContFlowRows(sourceRows, options = {}) {
    const normalizedSource = Array.isArray(sourceRows) ? sourceRows : [];
    if (!normalizedSource.length) return;
    const filteredSource = normalizedSource.filter((row) => detectTribMode(row?.trib) === TRIB_MODE_FILTER);

    const beforeSignature = buildCadastralMirrorSignature();

    state.sheets = state.sheets.map((sheetRows, sheetIndex) => {
      const existing = Array.isArray(sheetRows) ? sheetRows : [];
      const existingMap = new Map();

      existing.forEach((row) => {
        const key = getMirrorKey(row);
        if (key && !existingMap.has(key)) existingMap.set(key, row);
      });

      return filteredSource.map((sourceRow) => {
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
        calcRow(nextRow);
        return nextRow;
      });
    });

    const changed = beforeSignature !== buildCadastralMirrorSignature();
    if (changed) state.dirty = true;

    renderTable();
    requestPainelTributarioRevenueSync(true);
    if (changed && options?.persist) {
      persistSyncedContFlowMirror();
    }
    if (!lastSavedPayload || !Array.isArray(lastSavedPayload.data) || !lastSavedPayload.data.length) {
      saveBase({ silent: true }).catch((err) => console.error("Erro ao publicar base inicial do Painel Tributário - LRA:", err));
    }
  }

  function syncRevenueFromPainelTributarioSheets(sourceSheets) {
    const normalizedSheets = Array.isArray(sourceSheets) ? sourceSheets : [];
    let changed = false;

    state.sheets = state.sheets.map((sheetRows, sheetIndex) => {
      const rows = Array.isArray(sheetRows) ? sheetRows : [];
      const sourceSheetIndex = getSourceQuarterIndex(sheetIndex);
      const sourceRows = Array.isArray(normalizedSheets[sourceSheetIndex]) ? normalizedSheets[sourceSheetIndex] : [];
      const sourceRevenueKey = getSourceRevenueKey(sheetIndex);
      if (!rows.length || !sourceRows.length) return rows;

      const sourceMap = new Map();
      sourceRows.forEach((row) => {
        const key = getMirrorKey(row);
        if (key && !sourceMap.has(key)) sourceMap.set(key, row);
      });

      return rows.map((row) => {
        const key = getMirrorKey(row);
        const sourceRow = key ? sourceMap.get(key) : null;
        if (!sourceRow) return row;

        const nextFatTotal = toNumberBR(sourceRow[sourceRevenueKey]);
        const currentFatTotal = toNumberBR(row.fat_total);

        if (currentFatTotal === nextFatTotal) {
          return row;
        }

        changed = true;
        const nextRow = { ...row, fat_total: nextFatTotal };
        calcRow(nextRow);
        return nextRow;
      });
    });

      if (changed) {
        renderTable();
      }

      return changed;
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

  function toPercent(value) {
    const txt = String(value == null ? "" : value).trim().replace("%", "");
    const n = toNumberBR(txt);
    return n > 1 ? n / 100 : n;
  }

  function formatMoney(value) {
    return toNumberBR(value).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
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

  function isMoneyColumn(col) {
    return col?.type === "number" && !col?.percent;
  }

  function formatEditableInputValue(col, value) {
    if (value == null || String(value).trim() === "") return "";
    if (col?.percent) return formatPercentInputValue(value);
    if (isMoneyColumn(col)) return formatMoney(value);
    return String(value);
  }

  function normalizeEditableValue(col, value) {
    const raw = String(value ?? "").trim();
    if (!raw) return "";
    if (col?.percent) return formatPercentInputValue(raw);
    if (isMoneyColumn(col)) return formatMoney(raw);
    return raw;
  }

  function calcRow(row) {
    const fatTotal = toNumberBR(row.fat_total);
    const resultadoAntes = toNumberBR(row.resultado_antes_irpj_csll);
    const adicoes = toNumberBR(row.adicoes);
    const exclusoes = toNumberBR(row.exclusoes);
    const compensacaoPrej = toNumberBR(row.compensacao_prej);

    const baseCalculo = resultadoAntes + adicoes - exclusoes - compensacaoPrej;
    const irpjDevido15 = baseCalculo * 0.15;
    const tribMode = detectTribMode(row.trib);
    const additionalBase = Math.max(baseCalculo - IRPJ_ADICIONAL_LIMIT, 0);
    const irpjAdicionalBase = additionalBase * 0.1;
    const irpjAdicionalLra = tribMode === "LRA" ? irpjAdicionalBase : 0;
    const retencoesIrpj = toNumberBR(row.retencoes_incentivos_pagos);
    const irpjAPagar = irpjDevido15 + irpjAdicionalLra - retencoesIrpj;
    const csllDevida = baseCalculo > 0 ? baseCalculo * 0.09 : 0;
    const retencoesCsll = toNumberBR(row.retencoes_pagos_csll);
    const csllAPagar = csllDevida - retencoesCsll;

    row.fat_total = fatTotal;
    row.bc = baseCalculo;
    row.irpj_devido_15 = irpjDevido15;
    row.irpj_adicional_lra = irpjAdicionalLra;
    row.irpj_a_pagar = irpjAPagar;
    row.csll_devida = csllDevida;
    row.csll_a_pagar = csllAPagar;
  }

  function recalcAll() {
    currentSheet().forEach(calcRow);
  }

  function getFilteredRows() {
    const search = String(document.getElementById("ptlra-search")?.value || "")
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
    const el = document.getElementById("ptlra-status-bar");
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
    document.querySelectorAll("#ptlra-table .cf-cell").forEach((cell) => {
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
    if (activeView() !== "painel-tributario-lra") return;
    if (!state.lastSelectionBounds) return;

    const text = await copySelection();
    if (!text) return;

    if (e.clipboardData) {
      e.preventDefault();
      e.clipboardData.setData("text/plain", text);
    }
  }

  async function handlePasteEvent(e) {
    if (activeView() !== "painel-tributario-lra") return;
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
    a.download = `painel_tributario_lra_${getMonthShortTitle().toLowerCase()}.json`;
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
      [`Painel Tributário - LRA - ${getMonthTitle()}`],
      [],
      header,
      ...body,
    ];

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = header.map((label) => ({
      wch: Math.min(Math.max(String(label || "").length + 4, 12), 36),
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Painel Tributario LRA");

    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `painel_tributario_lra_${getMonthShortTitle().toLowerCase()}_${stamp}.xlsx`);
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
    const thead = document.getElementById("ptlra-thead");
    const table = document.getElementById("ptlra-table");
    if (!thead) return;

    const widthMap = {
      cod: 70,
      razao_social: 240,
      tipo: 110,
      cnpj_cpf: 150,
      class: 90,
      grupo: 120,
      trib: 120,
      status: 90,
      resp1: 120,
      resp2: 120,
      fat_total: 110,
      resultado_antes_irpj_csll: 210,
      adicoes: 120,
      exclusoes: 120,
      compensacao_prej: 150,
      bc: 90,
      irpj_devido_15: 130,
      irpj_adicional_lra: 150,
      retencoes_incentivos_pagos: 190,
      irpj_a_pagar: 120,
      csll_devida: 120,
      retencoes_pagos_csll: 150,
      csll_a_pagar: 120,
    };

    const colgroup = table?.querySelector("colgroup");
    if (colgroup) {
      colgroup.innerHTML = [
        '<col style="width: 40px" />',
        ...cols.map((col) => `<col style="width: ${widthMap[col.key] || 120}px" />`),
      ].join("");
    }

    thead.innerHTML = `
      <tr class="group-row">
        <th id="ptlra-corner-select" class="group-meta" rowspan="2">#</th>
        <th class="group-meta" colspan="7">Dados cadastrais</th>
        <th class="group-meta group-meta-rest" colspan="3"></th>
        <th class="group-ir" colspan="13">Painel Tributário - LRA</th>
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

  function getRowById(rowId) {
    return currentSheet().find((row) => row.__id === rowId) || null;
  }

  function getActiveModalRow() {
    return state.modalRowId ? getRowById(state.modalRowId) : null;
  }

  function renderQuotaPanel() {
    const panel = document.getElementById("ptlra-quota-panel");
    const baseCalcEl = document.getElementById("ptlra-base-total-calc");
    const additionalCalcEl = document.getElementById("ptlra-additional-calc");
    const quotaSummaryEl = document.querySelector("#ptlra-modal .pt-quota-summary");
    const quotaBlockEl = document.querySelector("#ptlra-modal .pt-quota-block");
    const previewEl = document.getElementById("ptlra-quota-preview");

    if (panel) panel.hidden = true;
    if (baseCalcEl) baseCalcEl.hidden = true;
    if (additionalCalcEl) additionalCalcEl.hidden = true;
    if (quotaSummaryEl) quotaSummaryEl.hidden = true;
    if (quotaBlockEl) quotaBlockEl.hidden = true;
    if (previewEl) previewEl.hidden = true;
  }

  function renderAdditionalCalc() {
    const section = document.getElementById("ptlra-additional-calc");
    const row = getActiveModalRow();
    if (!section) return;

    const shouldShow = state.modalMode === "additional" && !!row;
    section.hidden = !shouldShow;
    if (!shouldShow) return;

    const tribMode = detectTribMode(row.trib);
    const bc = toNumberBR(row.bc);
    const excess = Math.max(bc - IRPJ_ADICIONAL_LIMIT, 0);
    const rate = 0.1;
    const targetMode = "LRA";
    const applies = tribMode === targetMode;
    const total = applies ? excess * rate : 0;

    const summaryEl = document.getElementById("ptlra-additional-summary");
    const chipEl = document.getElementById("ptlra-additional-chip");
    const tribEl = document.getElementById("ptlra-additional-trib");
    const ruleEl = document.getElementById("ptlra-additional-rule");
    const limitEl = document.getElementById("ptlra-additional-limit");
    const rateEl = document.getElementById("ptlra-additional-rate");
    const excessEl = document.getElementById("ptlra-additional-excess");
    const excessNoteEl = document.getElementById("ptlra-additional-excess-note");
    const bcEl = document.getElementById("ptlra-additional-bc");
    const formulaEl = document.getElementById("ptlra-additional-formula");
    const totalEl = document.getElementById("ptlra-additional-total");

    if (summaryEl) {
      summaryEl.textContent = `O adicional é calculado sobre o excedente do BC acima de ${formatMoney(IRPJ_ADICIONAL_LIMIT)}.`;
    }
    if (chipEl) chipEl.textContent = targetMode;
    if (tribEl) tribEl.textContent = tribMode || "Sem tributação";
    if (ruleEl) {
      ruleEl.textContent = applies
        ? `A coluna Trib. está como ${tribMode}, então o adicional desta coluna é aplicado.`
        : `A coluna Trib. está como ${tribMode || "vazia"}, então esta coluna fica zerada.`;
    }
    if (limitEl) limitEl.textContent = formatMoney(IRPJ_ADICIONAL_LIMIT);
    if (rateEl) rateEl.textContent = formatPercent(rate);
    if (excessEl) excessEl.textContent = formatMoney(excess);
    if (excessNoteEl) {
      excessNoteEl.textContent = applies
        ? "Excedente considerado para o adicional desta tributação."
        : "Há excedente, mas ele não entra nesta coluna porque a tributação não corresponde.";
    }
    if (bcEl) bcEl.textContent = formatMoney(bc);
    if (formulaEl) {
      formulaEl.textContent = applies
        ? `${formatMoney(Math.max(bc, 0))} - ${formatMoney(IRPJ_ADICIONAL_LIMIT)} = ${formatMoney(excess)}; ${formatMoney(excess)} x ${formatPercent(rate)}`
        : `Trib. diferente de ${targetMode}; resultado mantido em R$ 0,00`;
    }
    if (totalEl) totalEl.textContent = formatMoney(total);
  }

  function renderModalMode() {
    const modal = document.getElementById("ptlra-modal");
    const title = document.getElementById("ptlra-modal-title");
    const actions = modal?.querySelector(".cf-modal-actions");
    if (!modal) return;
    const isAdditionalMode = state.modalMode === "additional";
    modal.classList.toggle("is-quota-mode", isAdditionalMode);
    modal.classList.remove("is-base-total-mode");
    if (actions) actions.style.display = isAdditionalMode ? "none" : "";
    if (title) title.textContent = isAdditionalMode ? "Cálculo do IRPJ adicional" : "Base Painel Tributário - LRA";
  }

  function isModalTriggerColumn(col) {
    return col?.key === "irpj_adicional_lra";
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
      const taxKind = "lra";
      const actionLabel = `Abrir cálculo do IRPJ adicional ${taxKind.toUpperCase()}`;
      button.setAttribute("aria-label", actionLabel);
      button.title = "Abrir modal";
      button.addEventListener("click", (e) => {
        e.stopPropagation();
        setSelection(rowIndex, rowIndex, colIndex, colIndex, totalRows);
        applySelectionVisual();
        openModal("additional", row.__id, taxKind);
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
    if (!rowEl) return;

    cols.forEach((col) => {
      if (col.type !== "read") return;

      const readEl = rowEl.querySelector(`[data-read-key="${col.key}"]`);
      if (readEl) readEl.textContent = readCellContent(col, row);
    });

    renderFooter();
    updateStatusBar(getFilteredRows().length);
  }

  function renderBody(rows) {
    const cols = getDynamicColumns();
    const tbody = document.getElementById("ptlra-tbody");
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
    const tfoot = document.getElementById("ptlra-tfoot");
    if (tfoot) tfoot.innerHTML = "";
  }

  function updatePainelHeaderMetrics() {
    const table = document.getElementById("ptlra-table");
    const wrapper = document.querySelector("#view-painel-tributario-lra .table-wrapper");
    if (!table || !wrapper) return;

    const groupRowHeight = table.querySelector(".group-row")?.offsetHeight || 30;
    const colsRowHeight = table.querySelector(".cols-row")?.offsetHeight || 30;
    wrapper.style.setProperty("--pt-group-row-height", `${groupRowHeight}px`);
    wrapper.style.setProperty("--pt-cols-row-top", `${groupRowHeight}px`);
    wrapper.style.setProperty("--pt-header-height", `${groupRowHeight + colsRowHeight}px`);
  }

  function applyPainelFrozenColumns() {
    const table = document.getElementById("ptlra-table");
    if (!table) return;

    updatePainelHeaderMetrics();

    const wrapper = document.querySelector("#view-painel-tributario-lra .table-wrapper");
    const groupRowTop = wrapper
      ? getComputedStyle(wrapper).getPropertyValue("--pt-cols-row-top").trim() || "30px"
      : "30px";

    const corner = document.getElementById("ptlra-corner-select");
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

    const titleEl = document.getElementById("ptlra-sheet-title");
    if (titleEl) titleEl.textContent = getMonthTitle();
    document.querySelectorAll("#view-painel-tributario-lra .cf-sheet-tab-lr").forEach((btn) => {
      btn.classList.toggle("is-active", Number(btn.dataset.sheet) === state.sheetIndex);
    });

    applySelectionVisual();
    requestAnimationFrame(() => applyPainelFrozenColumns());
  }

  function getPainelStickyOffsets() {
    const wrapper = document.querySelector("#view-painel-tributario-lra .table-wrapper");
    if (!wrapper) return { headerH: 60, leftW: 40 };

    const styles = getComputedStyle(wrapper);
    const headerH = Number.parseFloat(styles.getPropertyValue("--pt-header-height")) || 60;

    const frozenIndexes = getPainelFrozenIndexes();
    const colEls = Array.from(document.querySelectorAll("#ptlra-table colgroup col"));
    let leftW = 40;

    frozenIndexes.forEach((colIndex) => {
      const colEl = colEls[colIndex + 1];
      const width = Number.parseFloat(String(colEl?.style.width || "").trim());
      leftW += Number.isFinite(width) ? width : 140;
    });

    return { headerH, leftW };
  }

  function scrollPainelCellIntoView(targetEl) {
    const wrapper = document.querySelector("#view-painel-tributario-lra .table-wrapper");
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
      `#ptlra-table .cf-input[data-row-index="${rowIndex}"][data-col-index="${colIndex}"]`
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
    if (activeView() !== "painel-tributario-lra") return;

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

      state.sheetIndex = clamp(Number(data.sheetIndex || 0), 0, MONTH_COUNT - 1);
      state.sheets = Array.from({ length: MONTH_COUNT }, (_, idx) => {
        const rows = Array.isArray(data.sheets[idx]) ? data.sheets[idx] : [];
        if (!rows.length) return Array.from({ length: MAX_ROWS_START }, () => createEmptyRow());

        return rows.map((source) => {
          const row = createEmptyRow();
          Object.keys(row).forEach((key) => {
            if (source[key] != null) row[key] = source[key];
          });
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
        alert("Nao da para salvar o Painel Tributario LRA: nao ha alteracoes pendentes.");
        return;
      }

      const { changes, structural } = buildDirtyCellPayload();
      if (structural) {
        alert("Nao da para salvar so as celulas do Painel Tributario LRA: ha alteracoes estruturais. Use Salvar base.");
        return;
      }

      if (!changes.length) {
        alert("Nao da para salvar o Painel Tributario LRA: nao ha celulas validas pendentes.");
        return;
      }

      const response = await persistDirtyCellsToApi(changes);
      if (Array.isArray(response?.invalid) && response.invalid.length) {
        alert("Nao da para salvar o Painel Tributario LRA: algumas linhas ou colunas nao foram reconhecidas pelo servidor. Use Salvar base para realinhar a planilha.");
        return;
      }

      if (response) hydrateFromApiPayload(response);
      requestPainelTributarioRevenueSync(true);
      saveState();
      renderTable();
      alert("Pode salvar: as alteracoes do Painel Tributario LRA foram sincronizadas com sucesso.");
    } catch (err) {
      console.error("Erro ao salvar células do Painel Tributário - LRA:", err);
      alert(explainSaveFailure(err, "Painel Tributario LRA"));
    }
  }

  async function saveBase(options = {}) {
    try {
      const payload = buildServerPayload();
      const response = await persistBaseToApi(payload);
      if (response) hydrateFromApiPayload(response);
      requestPainelTributarioRevenueSync(true);
      saveState();
      renderTable();
      if (!options?.silent) alert("Pode salvar: a base do Painel Tributario LRA foi sincronizada com sucesso.");
    } catch (err) {
      console.error("Erro ao salvar base do Painel Tributário - LRA:", err);
      saveState();
      if (!options?.silent) {
        alert(explainSaveFailure(err, "Painel Tributario LRA"));
      }
    }
  }

  function openModal(mode = "base", rowId = "", taxKind = "irpj") {
    state.modalMode = mode;
    state.modalRowId = rowId || "";
    state.modalTaxKind = "lra";
    renderModalMode();
    renderQuotaPanel();
    renderAdditionalCalc();
    document.getElementById("ptlra-modal")?.classList.add("is-open");
    document.getElementById("ptlra-modal-backdrop")?.classList.add("is-open");
  }

  function closeModal() {
    state.modalMode = "base";
    state.modalRowId = "";
    state.modalTaxKind = "lra";
    renderModalMode();
    renderQuotaPanel();
    renderAdditionalCalc();
    document.getElementById("ptlra-modal")?.classList.remove("is-open");
    document.getElementById("ptlra-modal-backdrop")?.classList.remove("is-open");
  }

  function switchView(view) {
    const nextView = String(view || "contflow");

    if (nextView !== "painel-tributario-lra") {
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
    state.sheets = Array.from({ length: MONTH_COUNT }, () =>
      Array.from({ length: MAX_ROWS_START }, () => createEmptyRow())
    );
    state.dirty = false;
  }

  function bindEvents() {
    if (state.bound) return;
    state.bound = true;

    document.querySelectorAll(".cf-view-btn").forEach((btn) => {
      btn.addEventListener("click", () => switchView(btn.dataset.view));
    });

    document.querySelectorAll("#view-painel-tributario-lra .cf-sheet-tab-lr").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#view-painel-tributario-lra .cf-sheet-tab-lr").forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        state.sheetIndex = Number(btn.dataset.sheet);
        state.lastSelectionBounds = null;
        const search = document.getElementById("ptlra-search");
        if (search) search.value = "";
        renderTable();
        requestPainelTributarioRevenueSync(true);
      });
    });

    document.getElementById("ptlra-search")?.addEventListener("input", () => {
      state.lastSelectionBounds = null;
      renderTable();
    });

    window.addEventListener("resize", () =>
      requestAnimationFrame(() => {
        updatePainelHeaderMetrics();
        applyPainelFrozenColumns();
      })
    );

    document.getElementById("ptlra-base-btn")?.addEventListener("click", () => openModal("base"));
    document.getElementById("ptlra-modal-close")?.addEventListener("click", closeModal);
    document.getElementById("ptlra-modal-backdrop")?.addEventListener("click", closeModal);

    document.getElementById("ptlra-add-row")?.addEventListener("click", () => {
      addRow();
      closeModal();
    });

    document.getElementById("ptlra-export-json")?.addEventListener("click", () => {
      exportJson();
      closeModal();
    });

    document.getElementById("ptlra-export-xlsx")?.addEventListener("click", () => {
      exportXlsx();
      closeModal();
    });

    document.getElementById("ptlra-export-xlsx-top")?.addEventListener("click", exportXlsx);

    document.getElementById("ptlra-import")?.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (file) importJson(file);
      e.target.value = "";
      closeModal();
    });

    document.getElementById("ptlra-save-cells")?.addEventListener("click", saveCells);
    document.getElementById("ptlra-save-cells-top")?.addEventListener("click", saveCells);
    document.getElementById("ptlra-save-base")?.addEventListener("click", () => {
      saveBase();
      closeModal();
    });

    document.getElementById("ptlra-delete-selected")?.addEventListener("click", () => {
      deleteSelectedRows();
      closeModal();
    });

    document.addEventListener("mouseup", () => {
      state.mouseSelecting = false;
    });

    document.addEventListener("keydown", handleGlobalKeyDown);
    document.addEventListener("copy", handleCopyEvent);
    document.addEventListener("paste", handlePasteEvent);
    window.addEventListener("painel-tributario:revenue-sync", (event) => {
      requestPainelTributarioRevenueSync(true, event?.detail?.sheets);
    });
  }

  async function init() {
    ensureLRDom();
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
    requestPainelTributarioRevenueSync(true);
    ensurePolling();
    console.log("✅ Painel Tributário - LRA pronto.");
  }

  return {
    init,
    closeModal,
    switchView,
    hasPendingChanges: () => state.dirty,
    syncFromContFlowRows,
    syncRevenueFromPainelTributarioSheets,
    requestPainelTributarioRevenueSync,
    exportBISnapshot: () => ({
      title: "Painel Tributário - LRA",
      periodType: "month",
      activeIndex: state.sheetIndex,
      periodLabels: MONTH_TITLES.slice(),
      sheets: deepClone(state.sheets),
      columns: getAllColumns().map(({ key, label, type, percent }) => ({ key, label, type, percent: Boolean(percent) })),
    }),
  };
})();




