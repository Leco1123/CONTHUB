console.log("⚡ Painel Tributário JS carregando...");

window.PainelTributarioSheet = (() => {
  const STORAGE_KEY = "conthub:contflow:painel-tributario:v2";
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
  ];

  const PT_FROZEN_COL_KEYS = ["cod", "razao_social", "tipo", "cnpj_cpf", "class", "grupo", "trib"];
  const PT_FROZEN_GROUP_COLSPAN = 7;

  const BASE_IR_COLUMNS = [
    { key: "ir1", label: "Presunção %", type: "number" },
    { key: "fat1_m1", label: "Fat Mês 1", type: "number" },
    { key: "fat1_m2", label: "Fat Mês 2", type: "number" },
    { key: "fat1_m3", label: "Fat Mês 3", type: "number" },
    { key: "bc1", label: "BC-1", type: "read", readClass: "read-ir" },

    { key: "ir2", label: "Presunção %", type: "number" },
    { key: "fat2_m1", label: "Fat Mês 1", type: "number" },
    { key: "fat2_m2", label: "Fat Mês 2", type: "number" },
    { key: "fat2_m3", label: "Fat Mês 3", type: "number" },
    { key: "bc2", label: "BC-2", type: "read", readClass: "read-ir" },

    { key: "ir3", label: "Presunção %", type: "number" },
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
    modalMode: "base",
    modalRowId: "",
    modalTaxKind: "irpj",
  };

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

  function getMirrorKey(row) {
    if (!row) return "";
    const sourceId = String(row.__sourceRowId || "").trim();
    if (sourceId) return `src:${sourceId}`;

    const cod = String(row.cod || "").trim();
    const doc = String(row.cnpj_cpf || "").trim();
    const razao = String(row.razao_social || "").trim().toLowerCase();

    if (cod) return `cod:${cod}`;
    if (doc) return `doc:${doc}`;
    if (razao) return `razao:${razao}`;
    return "";
  }

  function syncFromContFlowRows(sourceRows) {
    const normalizedSource = Array.isArray(sourceRows) ? sourceRows : [];
    if (!normalizedSource.length) return;

    state.sheets = state.sheets.map((sheetRows) => {
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

        nextRow.__id = base.__id || genId();
        nextRow.__sourceRowId = String(sourceRow.__sourceRowId || sourceRow.__id || "").trim();
        calcRow(nextRow);
        return nextRow;
      });
    });

    renderTable();
  }

  function toNumberBR(value) {
    if (value == null) return 0;

    const txt = String(value)
      .trim()
      .replace(/R\$/gi, "")
      .replace(/\s/g, "")
      .replace(/\./g, "")
      .replace(",", ".");

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
    return Number(value || 0).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function formatPercent(value) {
    return (
      Number(value || 0) * 100
    ).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + "%";
  }

  function irToCsll(ir) {
    if (Math.abs(ir - 0.08) < 0.000001) return 0.12;
    if (Math.abs(ir - 0.16) < 0.000001) return 0.12;
    if (Math.abs(ir - 0.32) < 0.000001) return 0.32;
    return 0;
  }

  function calcRow(row) {
    const rb1 = toNumberBR(row.fat1_m1) + toNumberBR(row.fat1_m2) + toNumberBR(row.fat1_m3);
    const rb2 = toNumberBR(row.fat2_m1) + toNumberBR(row.fat2_m2) + toNumberBR(row.fat2_m3);
    const rb3 = toNumberBR(row.fat3_m1) + toNumberBR(row.fat3_m2) + toNumberBR(row.fat3_m3);

    const p1 = toPercent(row.ir1);
    const p2 = toPercent(row.ir2);
    const p3 = toPercent(row.ir3);

    const bc1 = rb1 * p1;
    const bc2 = rb2 * p2;
    const bc3 = rb3 * p3;

    const receitaBruta = rb1 + rb2 + rb3;
    const outrasRec = toNumberBR(row.outras_rec);
    const totalBC = bc1 + bc2 + bc3 + outrasRec;
    const adicional = totalBC > 60000 ? (totalBC - 60000) * 0.1 : 0;
    const ir15 = totalBC * 0.15;
    const retIr = toNumberBR(row.retencoes_ir);
    const irAPagar = ir15 + adicional - retIr;

    const csll1 = irToCsll(p1);
    const csll2 = irToCsll(p2);
    const csll3 = irToCsll(p3);

    const bcCsll1 = rb1 * csll1;
    const bcCsll2 = rb2 * csll2;
    const bcCsll3 = rb3 * csll3;

    const bc2Csll = bcCsll1 + bcCsll2 + bcCsll3 + outrasRec;
    const retCsll = toNumberBR(row.retencoes_csll);
    const csllAPagar = bc2Csll * 0.09 - retCsll;

    row.receita_bruta = receitaBruta;
    row.bc1 = bc1;
    row.bc2 = bc2;
    row.bc3 = bc3;
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
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
      }
    } catch (_) {}
  }

  async function readTextFromClipboard() {
    if (navigator.clipboard?.readText) return navigator.clipboard.readText();
    return "";
  }

  async function copySelection() {
    const cols = getDynamicColumns();
    const rows = getFilteredRows();

    if (!rows.length || !state.lastSelectionBounds) return;

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

    await copyTextToClipboard(out.join("\n"));
  }

  async function pasteSelection() {
    const cols = getDynamicColumns();
    const rows = getFilteredRows();

    if (!rows.length || !state.lastSelectionBounds) return;

    const text = await readTextFromClipboard();
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
    return formatMoney(Number(value || 0));
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
    };
  }

  function renderQuotaPanel() {
    const panel = document.getElementById("pt-quota-panel");
    const totalEl = document.getElementById("pt-quota-total");
    const grossEl = document.getElementById("pt-quota-gross");
    const retentionEl = document.getElementById("pt-quota-retention");
    const chipEl = document.getElementById("pt-quota-chip");
    const totalLabelEl = document.getElementById("pt-quota-total-label");
    const grossLabelEl = document.getElementById("pt-quota-gross-label");
    const retentionLabelEl = document.getElementById("pt-quota-retention-label");
    const ruleTitleEl = document.getElementById("pt-quota-rule-title");
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
    if (title) title.textContent = state.modalMode === "quota" ? getQuotaTaxConfig().title : "Base Painel Tributario";
  }

  function isModalTriggerColumn(col) {
    return col?.key === "ir_a_pagar" || col?.key === "csll_a_pagar";
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
      const taxKind = col.key === "csll_a_pagar" ? "csll" : "irpj";
      const taxLabel = taxKind === "csll" ? "CSLL" : "IRPJ";
      button.setAttribute("aria-label", `Abrir modal da ${taxLabel} a pagar`);
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

          input.value = row[col.key] ?? "";
          input.dataset.rowIndex = String(rowIndex);
          input.dataset.colIndex = String(colIndex);
          input.dataset.rowId = row.__id;
          input.dataset.colKey = col.key;

          input.addEventListener("focus", () => {
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

  function focusCell(rowIndex, colIndex) {
    const target = document.querySelector(
      `#pt-table .cf-input[data-row-index="${rowIndex}"][data-col-index="${colIndex}"]`
    );

    if (target) {
      target.focus();
      if (typeof target.select === "function") target.select();
      requestAnimationFrame(() => scrollPainelCellIntoView(target));
    }
  }

  function handleInputKeyDown(e, rowIndex, colIndex, totalRows) {
    const cols = getDynamicColumns();
    const maxRow = totalRows - 1;
    const maxCol = cols.length - 1;

    let nextRow = rowIndex;
    let nextCol = colIndex;
    const input = e.currentTarget;

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

    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "c") {
      e.preventDefault();
      await copySelection();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "v") {
      e.preventDefault();
      await pasteSelection();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "d") {
      e.preventDefault();
      duplicateSelectedRows();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "Enter") {
      e.preventDefault();
      insertRowBelow();
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

  function saveCells() {
    saveState();
    alert("Células do Painel Tributário salvas 🧩");
  }

  function saveBase() {
    saveState();
    alert("Base do Painel Tributário salva 💾");
  }

  function openModal(mode = "base", rowId = "", taxKind = "irpj") {
    state.modalMode = mode;
    state.modalRowId = rowId || "";
    state.modalTaxKind = taxKind === "csll" ? "csll" : "irpj";
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

    document.querySelectorAll(".cf-sheet-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".cf-sheet-tab").forEach((b) => b.classList.remove("is-active"));
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
  }

  function init() {
    if (!loadState()) initRows();
    bindEvents();
    renderTable();
    console.log("✅ Painel Tributário pronto.");
  }

  return {
    init,
    closeModal,
    switchView,
    hasPendingChanges: () => state.dirty,
    syncFromContFlowRows,
  };
})();
