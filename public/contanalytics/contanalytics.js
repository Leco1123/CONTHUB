console.log("🚀 ContAnalytics JS carregando...");

document.addEventListener("DOMContentLoaded", () => {
  const LOGIN_PAGE_URL = "../login/login.html";
  const USER_PAGE_URL = "../perfil/perfil.html";
  const API_MODULES = "/api/admin/modules";
  const API_CONTFLOW = "/api/sheets/contflow";
  const API_CONTFLOW_Q2 = "/api/sheets/contflow-q2";
  const API_CONTFLOW_Q3 = "/api/sheets/contflow-q3";
  const API_CONTFLOW_Q4 = "/api/sheets/contflow-q4";
  const API_PAINEL_TRIBUTARIO = "/api/sheets/painel-tributario";
  const API_PAINEL_TRIBUTARIO_LR = "/api/sheets/painel-tributario-lr";
  const DONUT_COLORS = ["#31c8ff", "#4ecca3", "#ffd166", "#ff8fab", "#9b8cff", "#ff9f43", "#7bd389"];
  const ACTIVITY_DAYS = 14;
  const QUARTER_LABELS = ["1º Trimestre", "2º Trimestre", "3º Trimestre", "4º Trimestre"];
  const QUARTER_MONTHS = [
    ["Jan", "Fev", "Mar"],
    ["Abr", "Mai", "Jun"],
    ["Jul", "Ago", "Set"],
    ["Out", "Nov", "Dez"],
  ];
  const EMPTY_DATASET = { columns: [], rows: [], cells: [], savedAt: "" };

  const statusLabel = {
    online: "ONLINE",
    dev: "DEV",
    offline: "OFF",
    admin: "ADMIN",
  };

  let currentUser = null;
  let moduleStatusMap = {};

  const state = {
    contFlow: {
      columns: [],
      rows: [],
      cells: [],
      savedAt: "",
    },
    contFlowSheets: [],
    painelTributario: EMPTY_DATASET,
    painelTributarioLR: EMPTY_DATASET,
    sourceChecks: [],
    filteredRows: [],
    searchTerm: "",
  };

  const app = document.getElementById("app");
  const currentModuleId = app?.dataset.currentModule || "contanalytics";
  const currentModuleTitle = app?.dataset.moduleTitle || "ContAnalytics";
  const currentModuleSubtitle =
    app?.dataset.moduleSubtitle || "KPIs, indicadores e painéis de análise.";

  function goto(url) {
    const target = String(url || "").trim();
    if (!target) return;

    try {
      if (window.top && window.top !== window) {
        window.top.location.href = target;
        return;
      }
    } catch (_) {}

    window.location.href = target;
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

  function normalizeText(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function canonicalContFlowLabel(label) {
    const nl = normalizeText(label);
    if (!nl) return "";
    if (/^(cod|codigo)$/.test(nl)) return "Cód.";
    if (/^razao social$/.test(nl)) return "Razão Social";
    if (/^(cnpj cpf|cnpj ou cpf|cpf cnpj)$/.test(nl)) return "CNPJ/CPF";
    if (/^(trib|tributacao|tributario)$/.test(nl)) return "Trib.";
    if (nl === "grupo") return "Grupo";
    if (/^(class|classe)$/.test(nl)) return "Class";
    if (/^(desligamento|data desligamento|dt desligamento|data de desligamento)$/.test(nl)) return "Desligamento";
    if (/^(status|situacao|situacao fiscal)$/.test(nl)) return "Status";
    if (/^(resp 1|resp1|responsavel 1|responsavel1)$/.test(nl)) return "Resp.1";
    if (/^(resp 2|resp2|responsavel 2|responsavel2)$/.test(nl)) return "Resp.2";
    if (nl === "tipo") return "Tipo";
    if (/^(num quotas|numero quotas|numero de quotas|qtd quotas|quantidade quotas)$/.test(nl)) return "Num Quotas";
    if (/^(1 quota|1a quota|primeira quota)$/.test(nl)) return "1º quota";
    if (/^(2 quota|2a quota|segunda quota)$/.test(nl)) return "2º quota";
    if (/^(3 quota|3a quota|terceira quota)$/.test(nl)) return "3º quota";
    if (/^(obs|observacao|observacoes)$/.test(nl)) return "Obs";
    if (nl === "mit") return "MIT";
    if (/^(controle de mit|controle mit)$/.test(nl)) return "Controle de MIT";
    if (/^(inconsistencia athenas|inconsistência athenas)$/.test(nl)) return "Inconsistência Athenas";
    return String(label || "").trim();
  }

  function canonicalKeyFromLabel(label) {
    const canonical = canonicalContFlowLabel(label);
    switch (canonical) {
      case "Cód.":
        return "cod";
      case "Razão Social":
        return "razao_social";
      case "CNPJ/CPF":
        return "cnpj_cpf";
      case "Trib.":
        return "trib";
      case "Grupo":
        return "grupo";
      case "Class":
        return "class";
      case "Desligamento":
        return "desligamento";
      case "Status":
        return "status";
      case "Resp.1":
        return "resp1";
      case "Resp.2":
        return "resp2";
      case "Tipo":
        return "tipo";
      case "Num Quotas":
        return "num_quotas";
      case "1º quota":
        return "quota1";
      case "2º quota":
        return "quota2";
      case "3º quota":
        return "quota3";
      case "Obs":
        return "obs";
      case "MIT":
        return "mit";
      case "Controle de MIT":
        return "controle_mit";
      case "Inconsistência Athenas":
        return "inconsistencia_athenas";
      default:
        return "";
    }
  }

  function isFilled(value) {
    const normalized = normalizeText(value);
    return normalized !== "" && normalized !== "-" && normalized !== "null" && normalized !== "undefined";
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("pt-BR").format(Number(value || 0));
  }

  function formatCurrency(value) {
    return Number(value || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function formatPercent(value, decimals = 1) {
    return `${Number(value || 0).toLocaleString("pt-BR", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })}%`;
  }

  function formatDateTime(value) {
    if (!value) return "Sem registro";
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return "Sem registro";

    return dt.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function toNumberBR(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const raw = String(value ?? "").trim();
    if (!raw) return 0;
    const cleaned = raw
      .replace(/\s+/g, "")
      .replace(/^R\$/i, "")
      .replace(/\.(?=\d{3}(?:\D|$))/g, "")
      .replace(",", ".")
      .replace(/[^\d.-]/g, "");
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  async function fetchJson(url, opts = {}) {
    const actor = getSessionUser();
    const actorId = actor?.id != null ? String(actor.id) : "";
    const actorEmail = actor?.email ? String(actor.email) : "";

    const res = await fetch(url, {
      method: opts.method || "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-User-Id": actorId,
        "X-User-Email": actorEmail,
        ...(opts.headers || {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });

    const text = await res.text();
    let data = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }

    if (!res.ok) {
      if (res.status === 401) {
        currentUser = null;
        const err = new Error("Sessão não disponível.");
        err.status = 401;
        throw err;
      }

      const msg =
        (data && (data.error || data.message)) ||
        `HTTP ${res.status} (${res.statusText}) em ${url}`;

      const err = new Error(msg);
      err.status = res.status;
      err.payload = data;
      throw err;
    }

    return data;
  }

  async function loadSessionUser() {
    const data = await fetchJson("/api/auth/me", { method: "GET" });
    currentUser = data?.user || null;
    return currentUser;
  }

  async function logout() {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch (err) {
      console.warn("Falha ao encerrar sessão no servidor:", err);
    }

    currentUser = null;
    goto(LOGIN_PAGE_URL);
  }

  function normalizeModuleStatus(status, active) {
    const s = String(status || "").trim().toLowerCase();
    if (active === false) return "offline";
    if (s === "offline" || s === "off") return "offline";
    if (s === "dev") return "dev";
    if (s === "admin") return "admin";
    return "online";
  }

  async function loadModulesFromApi() {
    const payload = await fetchJson(API_MODULES, { method: "GET" });
    const rows = Array.isArray(payload?.modules) ? payload.modules : [];

    const map = {};
    rows.forEach((m) => {
      const slug = String(m.slug || "").trim().toLowerCase();
      if (!slug) return;
      map[slug] = normalizeModuleStatus(m.status, m.active);
    });

    moduleStatusMap = map;
    return map;
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
      const t = (pill.textContent || "").trim().toLowerCase();
      pill.setAttribute("data-status", t === "admin" ? "admin" : "online");
    }

    return pill;
  }

  function applyStatusToSidebar(moduleId, status) {
    const btn = document.querySelector(
      `.modulos-sidebar .cards-modulos[data-module-id="${moduleId}"]`
    );
    if (!btn) return;

    const isAdmin = moduleId === "contadmin";
    const finalStatus = isAdmin ? "admin" : status;

    const pill = ensureStatusSpan(btn);
    if (!pill) return;

    pill.setAttribute("data-status", finalStatus);
    pill.textContent = statusLabel[finalStatus] || "ONLINE";
    btn.setAttribute("data-disabled", finalStatus === "offline" ? "true" : "false");
  }

  function syncSidebarFromStore() {
    getSidebarCards().forEach((btn) => {
      const moduleId = btn.dataset.moduleId;
      if (!moduleId) return;

      const def = moduleId === "contadmin" ? "admin" : "online";
      applyStatusToSidebar(moduleId, moduleStatusMap[moduleId] || def);
    });
  }

  function applyRoleToSidebar() {
    const current = getSessionUser();
    const role = (current?.role || "user").toLowerCase();

    getSidebarCards().forEach((card) => {
      const moduleId = card.dataset.moduleId;
      if (!moduleId) return;

      const blocked = role === "user" && moduleId === "contadmin";
      card.setAttribute("data-noaccess", blocked ? "true" : "false");
    });
  }

  function markCurrentModuleActive() {
    getSidebarCards().forEach((card) => {
      const moduleId = card.dataset.moduleId;
      card.classList.toggle("is-active", moduleId === currentModuleId);
    });
  }

  function bindSidebarNavigation() {
    document
      .querySelectorAll(".modulos-sidebar .cards-modulos[data-src], [data-goto]")
      .forEach((button) => {
        button.addEventListener("click", (e) => {
          const disabled = button.getAttribute("data-disabled") === "true";
          const noAccess = button.getAttribute("data-noaccess") === "true";

          if (disabled || noAccess) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }

          const src = button.dataset.src || button.dataset.goto;
          if (src) goto(src);
        });
      });
  }

  function renderUserCard() {
    const userCard =
      document.querySelector("[data-usercard]") || document.querySelector(".usercard");

    const elUserName =
      (userCard && userCard.querySelector("[data-user-name]")) ||
      document.querySelector("[data-user-name]");

    const elUserRole =
      (userCard && userCard.querySelector("[data-user-role]")) ||
      document.querySelector("[data-user-role]");

    const elUserAvatar =
      (userCard && userCard.querySelector("[data-user-avatar]")) ||
      document.querySelector("[data-user-avatar]") ||
      (userCard && userCard.querySelector(".usercard__avatar"));

    const u = getSessionUser();

    if (!u) {
      if (elUserName) elUserName.textContent = "Usuário";
      if (elUserRole) elUserRole.textContent = "Deslogado";
      if (elUserAvatar) elUserAvatar.textContent = "U";
      return;
    }

    const nome = u.nome || u.name || "Usuário";
    const role = (u.role || "user").toLowerCase();

    if (elUserName) elUserName.textContent = nome;
    if (elUserRole) elUserRole.textContent = roleLabel(role);
    if (elUserAvatar) elUserAvatar.textContent = avatarFromName(nome);
  }

  function hardForceClickable() {
    const userCard =
      document.querySelector("[data-usercard]") || document.querySelector(".usercard");
    const btnLogout =
      document.querySelector("[data-logout]") || document.querySelector(".btn--sair");

    if (userCard) {
      userCard.style.pointerEvents = "auto";
      userCard.style.cursor = "pointer";
      userCard.style.position = "relative";
      userCard.style.zIndex = "999999";
    }

    if (btnLogout) {
      btnLogout.style.pointerEvents = "auto";
      btnLogout.style.cursor = "pointer";
      btnLogout.style.position = "relative";
      btnLogout.style.zIndex = "1000000";
    }
  }

  function bindUserActions() {
    const userCard =
      document.querySelector("[data-usercard]") || document.querySelector(".usercard");
    const btnLogout =
      document.querySelector("[data-logout]") || document.querySelector(".btn--sair");

    ["pointerdown", "click"].forEach((evt) => {
      btnLogout?.addEventListener(
        evt,
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          logout();
        },
        true
      );
    });

    ["pointerdown", "click"].forEach((evt) => {
      userCard?.addEventListener(
        evt,
        (e) => {
          if (e.target.closest("[data-logout]") || e.target.closest(".btn--sair")) return;
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          goto(USER_PAGE_URL);
        },
        true
      );
    });

    hardForceClickable();
    setTimeout(hardForceClickable, 50);
    setTimeout(hardForceClickable, 250);
    setTimeout(hardForceClickable, 800);
  }

  function setOverlayState() {
    const overlay = document.getElementById("overlay");
    if (!overlay) return;

    const open = document.body.classList.contains("sidebar-open");

    overlay.style.pointerEvents = open ? "auto" : "none";
    overlay.style.opacity = open ? "1" : "0";
    overlay.setAttribute("aria-hidden", open ? "false" : "true");
  }

  function bindMenu() {
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
  }

  function fillPageTexts() {
    const pageTitle = document.getElementById("pageTitle");
    const pageSubtitle = document.getElementById("pageSubtitle");
    if (pageTitle) pageTitle.textContent = currentModuleTitle;
    if (pageSubtitle) pageSubtitle.textContent = currentModuleSubtitle;
  }

  function isRelationalPayload(payload) {
    return payload && Array.isArray(payload.columns) && Array.isArray(payload.rows) && Array.isArray(payload.cells);
  }

  function isDocumentPayload(payload) {
    return payload && Array.isArray(payload.columns) && Array.isArray(payload.data);
  }

  function applyCanonicalRowAliases(row, columns) {
    (columns || []).forEach((col) => {
      const aliasKey = canonicalKeyFromLabel(col.label || col.key);
      if (!aliasKey) return;
      if (isFilled(row[aliasKey])) return;
      row[aliasKey] = String(row[col.key] ?? "");
    });
    return row;
  }

  function extractSheetDataset(payload, options = {}) {
    const empty = { columns: [], rows: [], cells: [], savedAt: "" };
    if (!payload || typeof payload !== "object") return empty;
    const applyAliases = Boolean(options.applyCanonicalAliases);

    if (isRelationalPayload(payload)) {
      const columns = payload.columns.map((col) => ({
        key: String(col?.key || "").trim(),
        label: String(col?.label || col?.key || "Coluna").trim(),
        canonicalKey: canonicalKeyFromLabel(col?.label || col?.key || ""),
      }));

      const rowMap = new Map();
      payload.rows.forEach((rowDef, index) => {
        const row = {
          __id: String(rowDef?.clientRowId || index + 1),
          __rowId: Number(rowDef?.id || index + 1),
        };
        columns.forEach((col) => {
          row[col.key] = "";
        });
        rowMap.set(Number(rowDef?.id), row);
      });

      const cells = payload.cells.map((cell) => ({
        rowId: Number(cell?.rowId),
        colKey: String(cell?.colKey || "").trim(),
        value: String(cell?.value ?? ""),
        updatedAt: cell?.updatedAt ? String(cell.updatedAt) : "",
        updatedBy: cell?.updatedBy
          ? {
              id: cell.updatedBy.id ?? null,
              name: cell.updatedBy.name ?? null,
              email: cell.updatedBy.email ?? null,
              role: cell.updatedBy.role ?? null,
            }
          : null,
      }));

      cells.forEach((cell) => {
        const row = rowMap.get(cell.rowId);
        if (!row || !cell.colKey || !(cell.colKey in row)) return;
        row[cell.colKey] = cell.value;
      });

      if (applyAliases) {
        rowMap.forEach((row) => applyCanonicalRowAliases(row, columns));
      }

      return {
        columns,
        rows: Array.from(rowMap.values()),
        cells,
        savedAt: String(payload?.savedAt || ""),
      };
    }

    if (isDocumentPayload(payload)) {
      const columns = payload.columns.map((col) => ({
        key: String(col?.key || col?.label || "").trim(),
        label: String(col?.label || col?.key || "Coluna").trim(),
        canonicalKey: canonicalKeyFromLabel(col?.label || col?.key || ""),
      }));

      const rows = (payload.data || []).map((row, index) => {
        const out = {
          __id: String(row?.__id || index + 1),
          __rowId: index + 1,
        };
        columns.forEach((col) => {
          out[col.key] = String(row?.[col.key] ?? "");
        });
        return applyAliases ? applyCanonicalRowAliases(out, columns) : out;
      });

      const cells = [];
      rows.forEach((row) => {
        columns.forEach((col) => {
          const value = String(row[col.key] ?? "");
          if (!isFilled(value)) return;
          cells.push({
            rowId: row.__rowId,
            colKey: col.key,
            value,
            updatedAt: "",
            updatedBy: null,
          });
        });
      });

      return {
        columns,
        rows,
        cells,
        savedAt: String(payload?.savedAt || ""),
      };
    }

    return empty;
  }

  function extractContFlowDataset(payload) {
    return extractSheetDataset(payload, { applyCanonicalAliases: true });
  }

  function isRealClientRow(row, columns) {
    if (!row || typeof row !== "object") return false;
    return columns.some((col) => isFilled(row[col.key]));
  }

  function inferActiveStatus(row) {
    const status = normalizeText(row.status);
    const desligamento = normalizeText(row.desligamento);
    if (desligamento) return false;
    if (!status) return true;
    return !(
      status.includes("deslig") ||
      status.includes("inativ") ||
      status.includes("encerr") ||
      status.includes("baixad")
    );
  }

  function isMitPending(row) {
    const merged = `${normalizeText(row.mit)} ${normalizeText(row.controle_mit)}`.trim();
    if (!merged) return false;
    return (
      merged.includes("pend") ||
      merged.includes("nao") ||
      merged.includes("não") ||
      merged.includes("atras") ||
      merged.includes("aberto") ||
      merged.includes("falta")
    );
  }

  function buildDistribution(rows, key, limit = 6) {
    const counts = new Map();
    rows.forEach((row) => {
      const label = String(row?.[key] ?? "").trim() || "Não informado";
      counts.set(label, (counts.get(label) || 0) + 1);
    });

    return Array.from(counts.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "pt-BR"))
      .slice(0, limit);
  }

  function buildCoverage(columns, rows, cells) {
    const lastByColumn = new Map();
    cells.forEach((cell) => {
      if (!cell.colKey || !cell.updatedAt) return;
      const prev = lastByColumn.get(cell.colKey);
      if (!prev || new Date(cell.updatedAt) > new Date(prev)) {
        lastByColumn.set(cell.colKey, cell.updatedAt);
      }
    });

    return columns.map((col) => {
      let filled = 0;
      rows.forEach((row) => {
        if (isFilled(row[col.key])) filled += 1;
      });

      const total = rows.length;
      const empty = Math.max(total - filled, 0);
      const rate = total ? (filled / total) * 100 : 0;
      let tone = "ok";
      if (rate < 45) tone = "danger";
      else if (rate < 80) tone = "warn";

      return {
        key: col.key,
        label: col.label,
        filled,
        empty,
        rate,
        lastUpdatedAt: lastByColumn.get(col.key) || "",
        tone,
      };
    });
  }

  function buildActivitySeries(cells) {
    const today = new Date();
    const buckets = [];
    const counts = new Map();

    for (let i = ACTIVITY_DAYS - 1; i >= 0; i -= 1) {
      const dt = new Date(today);
      dt.setHours(0, 0, 0, 0);
      dt.setDate(dt.getDate() - i);
      const key = dt.toISOString().slice(0, 10);
      buckets.push(key);
      counts.set(key, 0);
    }

    cells.forEach((cell) => {
      if (!cell.updatedAt) return;
      const dt = new Date(cell.updatedAt);
      if (Number.isNaN(dt.getTime())) return;
      const key = dt.toISOString().slice(0, 10);
      if (!counts.has(key)) return;
      counts.set(key, (counts.get(key) || 0) + 1);
    });

    return buckets.map((key) => ({
      key,
      label: new Date(`${key}T00:00:00`).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
      }),
      value: counts.get(key) || 0,
    }));
  }

  function parseQuotaDate(value) {
    const raw = String(value || "").trim();
    if (!raw) return null;

    const pt = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (pt) {
      const [, dd, mm, yyyy] = pt;
      const dt = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
      return Number.isNaN(dt.getTime()) ? null : dt;
    }

    const iso = new Date(raw);
    if (Number.isNaN(iso.getTime())) return null;
    return iso;
  }

  function extractActorNameFromQuotaText(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";

    const patterns = [
      /\bpor[:\s-]+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s'.-]{2,})$/i,
      /\bfeito\s+por[:\s-]+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s'.-]{2,})$/i,
      /\bresp[:\s-]+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s'.-]{2,})$/i,
      /[-|/]\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s'.-]{2,})$/i,
    ];

    for (const pattern of patterns) {
      const match = raw.match(pattern);
      if (match?.[1]) return String(match[1]).trim();
    }

    return "";
  }

  function parseQuotaEntry(value, cellMeta = null) {
    const raw = String(value || "").trim();
    const normalized = normalizeText(raw);
    const date = parseQuotaDate(raw);
    const actor =
      String(cellMeta?.updatedBy?.name || "").trim() ||
      String(cellMeta?.updatedBy?.email || "").trim() ||
      extractActorNameFromQuotaText(raw);

    const isDispensada =
      normalized.includes("dispens") ||
      normalized === "disp" ||
      normalized === "disp.";
    const isSemMovimento =
      normalized === "s/m" ||
      normalized.includes("sem movimento") ||
      normalized.includes("sem mov") ||
      normalized.includes("sm ");
    const isFilledQuota = raw !== "";
    const isRegularDelivered = isFilledQuota && !isDispensada && !isSemMovimento && Boolean(date);
    const isInvalidDate = isFilledQuota && !isDispensada && !isSemMovimento && !date;

    return {
      raw,
      actor,
      date,
      isFilled: isFilledQuota,
      isDispensada,
      isSemMovimento,
      isRegularDelivered,
      isInvalidDate,
      statusLabel: isDispensada
        ? "Dispensada"
        : isSemMovimento
          ? "S/M"
          : isRegularDelivered
            ? "Entregue"
            : isInvalidDate
              ? "Data inválida"
              : "Sem preenchimento",
    };
  }

  function getExpectedQuotaInfo(row) {
    const raw = String(row?.num_quotas ?? "").trim();
    const parsed = Number(raw);
    const hasDeclared = raw !== "" && Number.isFinite(parsed);
    const normalized = hasDeclared ? Math.max(1, Math.min(3, Math.round(parsed))) : 3;
    return {
      raw,
      declared: hasDeclared ? Math.round(parsed) : null,
      expected: normalized,
      isMissing: raw === "",
      isInvalid: raw !== "" && !Number.isFinite(parsed),
    };
  }

  function buildQuotaAnalytics(rows, cells = []) {
    const quotaCellMeta = new Map();
    (cells || []).forEach((cell) => {
      const colKey = String(cell?.colKey || "").trim();
      if (!["quota1", "quota2", "quota3"].includes(colKey)) return;
      quotaCellMeta.set(`${cell.rowId}::${colKey}`, cell);
    });

    const stageStats = [
      { id: "quota1", label: "1ª quota", expectedRows: 0, filled: 0, missing: 0, invalidDates: 0, dispensadas: 0, semMovimento: 0, withActor: 0 },
      { id: "quota2", label: "2ª quota", expectedRows: 0, filled: 0, missing: 0, invalidDates: 0, dispensadas: 0, semMovimento: 0, withActor: 0 },
      { id: "quota3", label: "3ª quota", expectedRows: 0, filled: 0, missing: 0, invalidDates: 0, dispensadas: 0, semMovimento: 0, withActor: 0 },
    ];
    const totalPossible = rows.reduce((sum, row) => sum + getExpectedQuotaInfo(row).expected, 0);
    const quotaCountMap = new Map([
      ["1 quota", 0],
      ["2 quotas", 0],
      ["3 quotas", 0],
      ["Sem Num Quotas", 0],
      ["Num Quotas inválido", 0],
    ]);
    const pendingByRespMap = new Map();
    const timelineMap = new Map();
    const stageTimelineMaps = {
      quota1: new Map(),
      quota2: new Map(),
      quota3: new Map(),
    };

    let totalDelivered = 0;
    let allDelivered = 0;
    let anyQuota = 0;
    let pending = 0;
    let clientsCompleteExpected = 0;
    let clientsPendingExpected = 0;
    let noQuotaStarted = 0;
    let sequenceIssues = 0;
    let invalidDateRows = 0;
    let missingNumQuotas = 0;
    let invalidNumQuotas = 0;
    let dispensadas = 0;
    let semMovimento = 0;
    let withActor = 0;
    const actorMap = new Map();

    const registerTimeline = (map, value) => {
      const dt = parseQuotaDate(value);
      if (!dt) return;
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
      const label = dt.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
      const current = map.get(key) || { key, label, value: 0 };
      current.value += 1;
      map.set(key, current);
    };

    const focusRows = rows
      .map((row) => {
        const expectedInfo = getExpectedQuotaInfo(row);
        const q1 = parseQuotaEntry(row.quota1, quotaCellMeta.get(`${row.__rowId}::quota1`));
        const q2 = parseQuotaEntry(row.quota2, quotaCellMeta.get(`${row.__rowId}::quota2`));
        const q3 = parseQuotaEntry(row.quota3, quotaCellMeta.get(`${row.__rowId}::quota3`));
        const entries = [q1, q2, q3];
        const delivered = entries.filter((entry) => entry.isFilled).length;
        const deliveredExpected = Math.min(delivered, expectedInfo.expected);
        const pendingExpected = Math.max(expectedInfo.expected - deliveredExpected, 0);
        const hasSequenceIssue = (q2.isFilled && !q1.isFilled) || (q3.isFilled && !q2.isFilled);
        const invalidDates = entries.filter((entry) => entry.isInvalidDate).length;
        const completeExpected = pendingExpected === 0 && !hasSequenceIssue;
        const rowDispensadas = entries.filter((entry) => entry.isDispensada).length;
        const rowSemMovimento = entries.filter((entry) => entry.isSemMovimento).length;
        const rowActors = entries.map((entry) => entry.actor).filter(Boolean);

        if (expectedInfo.isMissing) missingNumQuotas += 1;
        if (expectedInfo.isInvalid) invalidNumQuotas += 1;

        const declaredBucket = expectedInfo.isMissing
          ? "Sem Num Quotas"
          : expectedInfo.isInvalid
            ? "Num Quotas inválido"
            : `${expectedInfo.expected} ${expectedInfo.expected === 1 ? "quota" : "quotas"}`;
        quotaCountMap.set(declaredBucket, (quotaCountMap.get(declaredBucket) || 0) + 1);

        if (delivered > 0) anyQuota += 1;
        if (delivered === 3) allDelivered += 1;
        if (delivered === 0) noQuotaStarted += 1;
        totalDelivered += delivered;
        dispensadas += rowDispensadas;
        semMovimento += rowSemMovimento;
        if (rowActors.length) withActor += 1;
        rowActors.forEach((actorName) => {
          actorMap.set(actorName, (actorMap.get(actorName) || 0) + 1);
        });

        if (hasSequenceIssue) sequenceIssues += 1;
        if (invalidDates > 0) invalidDateRows += 1;
        if (completeExpected) clientsCompleteExpected += 1;
        else clientsPendingExpected += 1;
        if (pendingExpected > 0) pending += 1;

        stageStats.forEach((stage, index) => {
          const stagePosition = index + 1;
          if (expectedInfo.expected >= stagePosition) {
            stage.expectedRows += 1;
            const entry = entries[index];
            if (entry.isFilled) {
              stage.filled += 1;
              registerTimeline(stageTimelineMaps[stage.id], row[stage.id]);
              registerTimeline(timelineMap, row[stage.id]);
            } else {
              stage.missing += 1;
            }
            if (entry.isDispensada) stage.dispensadas += 1;
            if (entry.isSemMovimento) stage.semMovimento += 1;
            if (entry.actor) stage.withActor += 1;
            if (entry.isInvalidDate) stage.invalidDates += 1;
          }
        });

        if (!completeExpected || hasSequenceIssue || invalidDates > 0 || expectedInfo.isMissing || expectedInfo.isInvalid) {
          const respLabel = String(row.resp1 || "Não informado").trim() || "Não informado";
          pendingByRespMap.set(respLabel, (pendingByRespMap.get(respLabel) || 0) + 1);
        }

        let issueScore = 0;
        const reasons = [];
        if (expectedInfo.isMissing) {
          issueScore += 2;
          reasons.push("Sem Num Quotas");
        }
        if (expectedInfo.isInvalid) {
          issueScore += 3;
          reasons.push("Num Quotas inválido");
        }
        if (pendingExpected > 0) {
          issueScore += pendingExpected;
          reasons.push(`${pendingExpected} pendente(s)`);
        }
        if (hasSequenceIssue) {
          issueScore += 4;
          reasons.push("Sequência inconsistente");
        }
        if (invalidDates > 0) {
          issueScore += invalidDates;
          reasons.push(`${invalidDates} data(s) inválida(s)`);
        }

        const issueTone = issueScore >= 5 ? "danger" : issueScore >= 2 ? "warn" : "ok";

        return {
          cod: String(row.cod || ""),
          razao_social: String(row.razao_social || ""),
          resp1: String(row.resp1 || ""),
          num_quotas: expectedInfo.raw || String(expectedInfo.expected),
          expected: expectedInfo.expected,
          delivered,
          pendingExpected,
          quota1: String(row.quota1 || ""),
          quota2: String(row.quota2 || ""),
          quota3: String(row.quota3 || ""),
          quota1Status: q1.statusLabel,
          quota2Status: q2.statusLabel,
          quota3Status: q3.statusLabel,
          actor: rowActors.join(" · "),
          dispensadas: rowDispensadas,
          semMovimento: rowSemMovimento,
          completeExpected,
          hasSequenceIssue,
          invalidDates,
          issueScore,
          issueTone,
          issueLabel: reasons.join(" · ") || "Ciclo ok",
        };
      })
      .sort((a, b) => {
        if (b.issueScore !== a.issueScore) return b.issueScore - a.issueScore;
        return a.razao_social.localeCompare(b.razao_social, "pt-BR");
      });

    const coverage = totalPossible ? (totalDelivered / totalPossible) * 100 : 0;
    const averagePerClient = rows.length ? totalDelivered / rows.length : 0;
    const stageCoverage = stageStats.map((stage) => ({
      ...stage,
      rate: stage.expectedRows ? (stage.filled / stage.expectedRows) * 100 : 0,
    }));
    const timeline = Array.from(timelineMap.values()).sort((a, b) => a.key.localeCompare(b.key)).slice(-8);
    const stageTimelines = stageStats.map((stage) => ({
      id: stage.id,
      label: stage.label,
      items: Array.from(stageTimelineMaps[stage.id].values())
        .sort((a, b) => a.key.localeCompare(b.key))
        .slice(-8),
    }));
    const expectedDistribution = Array.from(quotaCountMap.entries())
      .map(([label, value]) => ({ label, value }))
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "pt-BR"));
    const pendingByResp = Array.from(pendingByRespMap.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "pt-BR"))
      .slice(0, 8);

    return {
      quota1: stageStats[0].filled,
      quota2: stageStats[1].filled,
      quota3: stageStats[2].filled,
      allDelivered,
      anyQuota,
      pending,
      totalDelivered,
      totalPossible,
      coverage,
      averagePerClient,
      timeline,
      stageCoverage,
      stageTimelines,
      expectedDistribution,
      pendingByResp,
      actorDistribution: Array.from(actorMap.entries())
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "pt-BR"))
        .slice(0, 10),
      focusRows: focusRows.slice(0, 18),
      clientsCompleteExpected,
      clientsPendingExpected,
      noQuotaStarted,
      sequenceIssues,
      invalidDateRows,
      missingNumQuotas,
      invalidNumQuotas,
      dispensadas,
      semMovimento,
      withActor,
    };
  }

  function getQuarterIndexFromRow(row) {
    const raw = Number(row?.sheet_index ?? row?.sheetIndex ?? 0);
    if (Number.isInteger(raw) && raw >= 0 && raw <= 3) return raw;
    return 0;
  }

  function getValidContFlowRows(dataset) {
    return (dataset?.rows || []).filter((row) => isRealClientRow(row, dataset?.columns || []));
  }

  function sumPainelTributarioMonth(row, monthOffset) {
    return (
      toNumberBR(row?.[`fat1_m${monthOffset}`]) +
      toNumberBR(row?.[`fat2_m${monthOffset}`]) +
      toNumberBR(row?.[`fat3_m${monthOffset}`])
    );
  }

  function buildTimeAnalytics(contFlowSheets, painelTributario, painelTributarioLR) {
    const monthlyRevenue = [];
    const quarterSummary = [];

    for (let quarterIndex = 0; quarterIndex < 4; quarterIndex += 1) {
      const contFlowDataset = contFlowSheets[quarterIndex] || EMPTY_DATASET;
      const contFlowRows = getValidContFlowRows(contFlowDataset);
      const quarterRowIds = new Set(contFlowRows.map((row) => row.__rowId));
      const quotaAnalytics = buildQuotaAnalytics(
        contFlowRows,
        (contFlowDataset?.cells || []).filter((cell) => quarterRowIds.has(cell.rowId))
      );

      const ptRows = (painelTributario?.rows || []).filter(
        (row) => getQuarterIndexFromRow(row) === quarterIndex
      );
      const lrRows = (painelTributarioLR?.rows || []).filter(
        (row) => getQuarterIndexFromRow(row) === quarterIndex
      );

      const ptMonthValues = [1, 2, 3].map((monthOffset) =>
        ptRows.reduce((sum, row) => sum + sumPainelTributarioMonth(row, monthOffset), 0)
      );
      const lrMonthValues = [1, 2, 3].map((monthOffset) =>
        lrRows.reduce((sum, row) => sum + toNumberBR(row?.[`fat_m${monthOffset}`]), 0)
      );

      ptMonthValues.forEach((value, monthOffset) => {
        monthlyRevenue.push({
          key: `${quarterIndex + 1}-${monthOffset + 1}`,
          label: QUARTER_MONTHS[quarterIndex][monthOffset],
          value,
          lrValue: lrMonthValues[monthOffset],
          quarterIndex,
        });
      });

      const ptRevenue = ptMonthValues.reduce((sum, value) => sum + value, 0);
      const lrRevenue = lrMonthValues.reduce((sum, value) => sum + value, 0);
      const ptBc = ptRows.reduce((sum, row) => sum + toNumberBR(row.total_bc), 0);
      const ptIr = ptRows.reduce((sum, row) => sum + toNumberBR(row.ir_a_pagar), 0);
      const ptCsll = ptRows.reduce((sum, row) => sum + toNumberBR(row.csll_a_pagar), 0);
      const lrBc = lrRows.reduce((sum, row) => sum + toNumberBR(row.bc), 0);
      const lrIr = lrRows.reduce((sum, row) => sum + toNumberBR(row.irpj_a_pagar), 0);
      const lrCsll = lrRows.reduce((sum, row) => sum + toNumberBR(row.csll_a_pagar), 0);

      quarterSummary.push({
        quarterIndex,
        label: QUARTER_LABELS[quarterIndex],
        monthsLabel: QUARTER_MONTHS[quarterIndex].join(", "),
        clients: contFlowRows.length,
        activeClients: contFlowRows.filter(inferActiveStatus).length,
        quotaComplete: quotaAnalytics.allDelivered,
        quotaCoverage: quotaAnalytics.coverage,
        ptRevenue,
        ptBc,
        ptIr,
        ptCsll,
        lrRevenue,
        lrBc,
        lrIr,
        lrCsll,
      });
    }

    const annualRevenue = monthlyRevenue.reduce((sum, item) => sum + item.value, 0);
    const averageMonthlyRevenue = monthlyRevenue.length ? annualRevenue / monthlyRevenue.length : 0;
    const bestMonth = monthlyRevenue.reduce(
      (best, item) => (item.value > (best?.value || 0) ? item : best),
      null
    );
    const bestQuarter = quarterSummary.reduce(
      (best, item) => (item.ptRevenue > (best?.ptRevenue || 0) ? item : best),
      null
    );

    return {
      monthlyRevenue,
      quarterSummary,
      annualRevenue,
      averageMonthlyRevenue,
      bestMonth,
      bestQuarter,
      totalPtBc: quarterSummary.reduce((sum, item) => sum + item.ptBc, 0),
      totalPtIr: quarterSummary.reduce((sum, item) => sum + item.ptIr, 0),
      totalPtCsll: quarterSummary.reduce((sum, item) => sum + item.ptCsll, 0),
      totalLrBc: quarterSummary.reduce((sum, item) => sum + item.lrBc, 0),
      totalLrIr: quarterSummary.reduce((sum, item) => sum + item.lrIr, 0),
      totalLrCsll: quarterSummary.reduce((sum, item) => sum + item.lrCsll, 0),
    };
  }

  function buildSourceChecks(contFlowSheets, painelTributario, painelTributarioLR) {
    const checks = contFlowSheets.map((dataset, index) => ({
      label: `ContFlow ${QUARTER_LABELS[index]}`,
      rows: getValidContFlowRows(dataset).length,
      updatedAt: dataset?.savedAt || "",
    }));

    checks.push({
      label: "Painel Tributário",
      rows: (painelTributario?.rows || []).length,
      updatedAt: painelTributario?.savedAt || "",
    });
    checks.push({
      label: "Painel Tributário LR",
      rows: (painelTributarioLR?.rows || []).length,
      updatedAt: painelTributarioLR?.savedAt || "",
    });

    return checks;
  }

  function buildRowSignal(row) {
    const reasons = [];
    let score = 0;

    if (!isFilled(row.trib)) {
      score += 2;
      reasons.push("Sem trib.");
    }
    if (!isFilled(row.status)) {
      score += 2;
      reasons.push("Sem status");
    }
    if (!isFilled(row.resp1)) {
      score += 3;
      reasons.push("Sem Resp.1");
    }
    if (isMitPending(row)) {
      score += 2;
      reasons.push("MIT");
    }
    if (isFilled(row.inconsistencia_athenas)) {
      score += 3;
      reasons.push("Athenas");
    }
    if (isFilled(row.desligamento)) {
      score += 1;
      reasons.push("Deslig.");
    }

    if (score >= 5) return { score, tone: "danger", label: reasons.join(" · ") || "Ação imediata" };
    if (score >= 2) return { score, tone: "warn", label: reasons.join(" · ") || "Monitorar" };
    return { score, tone: "ok", label: "Base estável" };
  }

  function computeAnalytics(dataset, extras = {}) {
    const validRows = dataset.rows.filter((row) => isRealClientRow(row, dataset.columns));
    const totalRows = validRows.length;
    const totalColumns = dataset.columns.length;
    const activeRows = validRows.filter(inferActiveStatus).length;
    const noResp1 = validRows.filter((row) => !isFilled(row.resp1)).length;
    const mitPending = validRows.filter(isMitPending).length;
    const inconsistencias = validRows.filter((row) => isFilled(row.inconsistencia_athenas)).length;
    const desligamentos = validRows.filter((row) => isFilled(row.desligamento)).length;
    const coverage = buildCoverage(dataset.columns, validRows, dataset.cells);
    const averageCoverage =
      coverage.length > 0
        ? coverage.reduce((sum, item) => sum + item.rate, 0) / coverage.length
        : 0;
    const totalFilledCells = coverage.reduce((sum, item) => sum + item.filled, 0);
    const activity = buildActivitySeries(dataset.cells);
    const validRowIds = new Set(validRows.map((row) => row.__rowId));
    const quotaAnalytics = buildQuotaAnalytics(
      validRows,
      (dataset.cells || []).filter((cell) => validRowIds.has(cell.rowId))
    );

    const triDist = buildDistribution(validRows, "trib");
    const statusDist = buildDistribution(validRows, "status");
    const respDist = buildDistribution(validRows, "resp1");
    const resp2Dist = buildDistribution(validRows, "resp2");
    const grupoDist = buildDistribution(validRows, "grupo");
    const classDist = buildDistribution(validRows, "class");

    const criticalColumns = coverage
      .filter((item) => item.rate < 75)
      .sort((a, b) => a.rate - b.rate)
      .slice(0, 4);

    const highlightRows = validRows
      .map((row) => ({ row, signal: buildRowSignal(row) }))
      .sort((a, b) => {
        if (b.signal.score !== a.signal.score) return b.signal.score - a.signal.score;
        return String(a.row.razao_social || "").localeCompare(String(b.row.razao_social || ""), "pt-BR");
      })
      .slice(0, 14);

    const timeAnalytics = buildTimeAnalytics(
      extras.contFlowSheets || [dataset],
      extras.painelTributario || EMPTY_DATASET,
      extras.painelTributarioLR || EMPTY_DATASET
    );

    return {
      totalRows,
      totalColumns,
      activeRows,
      noResp1,
      mitPending,
      inconsistencias,
      desligamentos,
      totalFilledCells,
      averageCoverage,
      quotaAnalytics,
      triDist,
      statusDist,
      respDist,
      resp2Dist,
      grupoDist,
      classDist,
      coverage,
      activity,
      criticalColumns,
      highlightRows,
      timeAnalytics,
    };
  }

  function getHealthTone(analytics) {
    const base = analytics.totalRows || 1;
    const pressure =
      analytics.noResp1 / base +
      analytics.mitPending / base +
      analytics.inconsistencias / base +
      analytics.criticalColumns.length / Math.max(analytics.totalColumns || 1, 1);

    if (pressure >= 0.7) return { label: "Auditoria crítica", tone: "danger" };
    if (pressure >= 0.3) return { label: "Auditoria ativa", tone: "warn" };
    return { label: "Auditoria estável", tone: "ok" };
  }

  function buildInsights(analytics) {
    const tribLeader = analytics.triDist[0];
    const respLeader = analytics.respDist[0];
    const activitySum = analytics.activity.reduce((sum, item) => sum + item.value, 0);

    const items = [];
    if (tribLeader) {
      items.push({
        title: `Regime dominante: ${tribLeader.label}`,
        text: `${formatNumber(tribLeader.value)} cliente(s) estão concentrados nesse regime na leitura atual do ContFlow.`,
      });
    }
    if (respLeader) {
      items.push({
        title: `Maior carteira: ${respLeader.label}`,
        text: `${formatNumber(respLeader.value)} cliente(s) estão hoje ligados a esse responsável principal.`,
      });
    }
    items.push({
      title: "Cobertura média da planilha",
      text: `A base está com ${formatPercent(analytics.averageCoverage)} de preenchimento médio considerando todas as colunas atuais do ContFlow.`,
    });
    if (analytics.noResp1 > 0) {
      items.push({
        title: "Dono primário pendente",
        text: `${formatNumber(analytics.noResp1)} linha(s) seguem sem Resp.1, o que impacta rastreabilidade operacional.`,
      });
    }
    if (analytics.criticalColumns.length) {
      items.push({
        title: "Campos com cobertura fraca",
        text: analytics.criticalColumns
          .map((item) => `${item.label} (${formatPercent(item.rate)})`)
          .join(" · "),
      });
    }
    items.push({
      title: "Movimento recente",
      text: activitySum
        ? `${formatNumber(activitySum)} alteração(ões) de célula foram identificadas nos últimos ${ACTIVITY_DAYS} dias com base nos timestamps salvos.`
        : "Não houve atividade recente suficiente para formar histórico de alterações.",
    });

    return items.slice(0, 5);
  }

  function setMetric(id, value, hint, formatter = formatNumber) {
    const valueEl = document.getElementById(id);
    const hintEl = document.getElementById(`${id}Hint`);
    if (valueEl) valueEl.textContent = formatter(value);
    if (hintEl && hint) hintEl.textContent = hint;
  }

  function renderBarList(targetId, items, options = {}) {
    const target = document.getElementById(targetId);
    if (!target) return;
    const valueFormatter = options.valueFormatter || formatNumber;

    if (!items.length) {
      target.innerHTML = '<div class="empty-state">Sem dados suficientes para este recorte.</div>';
      return;
    }

    const max = Math.max(...items.map((item) => item.value), 1);
    target.innerHTML = items
      .map(
        (item) => `
          <div class="bar-row">
            <div class="bar-row__meta">
              <span class="bar-row__label">${escapeHtml(item.label)}</span>
              <span class="bar-row__value">${valueFormatter(item.value)}</span>
            </div>
            <div class="bar-row__track">
              <div class="bar-row__fill" style="width:${Math.max(6, (item.value / max) * 100)}%"></div>
            </div>
          </div>
        `
      )
      .join("");
  }

  function renderDonutChart(chartId, legendId, items, centerLabel, total) {
    const chart = document.getElementById(chartId);
    const legend = document.getElementById(legendId);
    if (!chart || !legend) return;

    if (!items.length || !total) {
      chart.style.setProperty("--donut-gradient", "conic-gradient(rgba(255,255,255,0.08) 0deg 360deg)");
      chart.dataset.center = `${centerLabel}\n0`;
      legend.innerHTML = '<div class="empty-state">Sem dados para este gráfico.</div>';
      return;
    }

    let currentDeg = 0;
    const stops = [];
    const legendHtml = [];

    items.forEach((item, index) => {
      const color = DONUT_COLORS[index % DONUT_COLORS.length];
      const angle = (item.value / total) * 360;
      const endDeg = currentDeg + angle;
      stops.push(`${color} ${currentDeg}deg ${endDeg}deg`);
      currentDeg = endDeg;

      legendHtml.push(`
        <div class="legend-item">
          <div class="legend-item__main">
            <span class="legend-swatch" style="background:${color}"></span>
            <span class="legend-label">${escapeHtml(item.label)}</span>
          </div>
          <span class="legend-value">${formatNumber(item.value)}</span>
        </div>
      `);
    });

    if (currentDeg < 360) {
      stops.push(`rgba(255,255,255,0.08) ${currentDeg}deg 360deg`);
    }

    chart.style.setProperty("--donut-gradient", `conic-gradient(${stops.join(",")})`);
    chart.dataset.center = `${centerLabel}\n${formatNumber(total)}`;
    legend.innerHTML = legendHtml.join("");
  }

  function renderInsights(analytics) {
    const target = document.getElementById("analyticsInsights");
    const healthPill = document.getElementById("analyticsHealthPill");
    if (!target || !healthPill) return;

    const health = getHealthTone(analytics);
    healthPill.textContent = health.label;
    healthPill.dataset.tone = health.tone;

    const items = buildInsights(analytics);
    target.innerHTML = items
      .map(
        (item, index) => `
          <article class="insight-item">
            <div class="insight-item__title">
              <span>${index + 1}. ${escapeHtml(item.title)}</span>
            </div>
            <div class="insight-item__text">${escapeHtml(item.text)}</div>
          </article>
        `
      )
      .join("");
  }

  function renderQualityGrid(analytics) {
    const target = document.getElementById("qualityGrid");
    if (!target) return;

    const items = [
      {
        label: "Sem tributação",
        count: analytics.coverage.find((item) => item.key === "trib")?.empty || 0,
        hint: "Registros sem regime tributário informado.",
      },
      {
        label: "Sem status",
        count: analytics.coverage.find((item) => item.key === "status")?.empty || 0,
        hint: "Linhas sem status operacional preenchido.",
      },
      {
        label: "Sem Resp.1",
        count: analytics.noResp1,
        hint: "Clientes que seguem sem responsável principal.",
      },
      {
        label: "MIT pendente",
        count: analytics.mitPending,
        hint: "Heurística baseada nos campos MIT e Controle de MIT.",
      },
      {
        label: "Athenas com apontamento",
        count: analytics.inconsistencias,
        hint: "Campo de inconsistência preenchido no cadastro.",
      },
      {
        label: "Desligamentos",
        count: analytics.desligamentos,
        hint: "Linhas com data de desligamento informada.",
      },
    ];

    target.innerHTML = items
      .map(
        (item) => `
          <article class="quality-item">
            <div class="quality-item__label">
              <span>${escapeHtml(item.label)}</span>
              <strong class="quality-item__count">${formatNumber(item.count)}</strong>
            </div>
            <div class="quality-item__hint">${escapeHtml(item.hint)}</div>
          </article>
        `
      )
      .join("");
  }

  function renderQuotaMetrics(analytics) {
    const target = document.getElementById("quotaMetrics");
    if (!target) return;

    const quota = analytics.quotaAnalytics || {
      quota1: 0,
      quota2: 0,
      quota3: 0,
      allDelivered: 0,
      anyQuota: 0,
      pending: 0,
      totalDelivered: 0,
      coverage: 0,
      averagePerClient: 0,
      timeline: [],
    };

    const pendingTone = quota.pending > Math.max(quota.allDelivered, 1) ? "warn" : "ok";
    const coverageTone = quota.coverage < 40 ? "danger" : quota.coverage < 75 ? "warn" : "ok";

    target.innerHTML = `
      <article class="quota-card" data-tone="ok">
        <div class="quota-card__label">1ª quota entregue</div>
        <div class="quota-card__value">${formatNumber(quota.quota1)}</div>
        <div class="quota-card__hint">Clientes com a primeira quota preenchida.</div>
      </article>
      <article class="quota-card" data-tone="ok">
        <div class="quota-card__label">2ª quota entregue</div>
        <div class="quota-card__value">${formatNumber(quota.quota2)}</div>
        <div class="quota-card__hint">Clientes com segunda quota registrada.</div>
      </article>
      <article class="quota-card" data-tone="ok">
        <div class="quota-card__label">3ª quota entregue</div>
        <div class="quota-card__value">${formatNumber(quota.quota3)}</div>
        <div class="quota-card__hint">Clientes com terceira quota concluída.</div>
      </article>
      <article class="quota-card" data-tone="ok">
        <div class="quota-card__label">Ciclo esperado completo</div>
        <div class="quota-card__value">${formatNumber(quota.clientsCompleteExpected)}</div>
        <div class="quota-card__hint">Clientes que entregaram tudo o que o campo Num Quotas pede.</div>
      </article>
      <article class="quota-card" data-tone="${coverageTone}">
        <div class="quota-card__label">Cobertura total</div>
        <div class="quota-card__value">${formatPercent(quota.coverage)}</div>
        <div class="quota-card__hint">${formatNumber(quota.totalDelivered)} entregas registradas de um total esperado de ${formatNumber(quota.totalPossible)}.</div>
      </article>
      <article class="quota-card" data-tone="${pendingTone}">
        <div class="quota-card__label">Pendência de ciclo</div>
        <div class="quota-card__value">${formatNumber(quota.clientsPendingExpected)}</div>
        <div class="quota-card__hint">Clientes que ainda não fecharam a quantidade esperada de quotas.</div>
      </article>
      <article class="quota-card" data-tone="${quota.missingNumQuotas ? "warn" : "ok"}">
        <div class="quota-card__label">Sem Num Quotas</div>
        <div class="quota-card__value">${formatNumber(quota.missingNumQuotas)}</div>
        <div class="quota-card__hint">Linhas que ficaram sem quantidade declarada de quotas.</div>
      </article>
      <article class="quota-card" data-tone="${quota.sequenceIssues ? "danger" : "ok"}">
        <div class="quota-card__label">Sequência inconsistente</div>
        <div class="quota-card__value">${formatNumber(quota.sequenceIssues)}</div>
        <div class="quota-card__hint">Há 2ª/3ª quota sem a etapa anterior preenchida.</div>
      </article>
      <article class="quota-card" data-tone="${quota.invalidDateRows ? "warn" : "ok"}">
        <div class="quota-card__label">Datas inválidas</div>
        <div class="quota-card__value">${formatNumber(quota.invalidDateRows)}</div>
        <div class="quota-card__hint">Campos de quota preenchidos, mas com data fora do padrão reconhecido.</div>
      </article>
      <article class="quota-card" data-tone="${quota.dispensadas ? "warn" : "ok"}">
        <div class="quota-card__label">Dispensadas</div>
        <div class="quota-card__value">${formatNumber(quota.dispensadas)}</div>
        <div class="quota-card__hint">Quantidade de quotas marcadas como dispensadas.</div>
      </article>
      <article class="quota-card" data-tone="${quota.semMovimento ? "warn" : "ok"}">
        <div class="quota-card__label">S/M</div>
        <div class="quota-card__value">${formatNumber(quota.semMovimento)}</div>
        <div class="quota-card__hint">Quantidade de quotas marcadas como sem movimento.</div>
      </article>
      <article class="quota-card" data-tone="${quota.withActor ? "ok" : "warn"}">
        <div class="quota-card__label">Com autor identificado</div>
        <div class="quota-card__value">${formatNumber(quota.withActor)}</div>
        <div class="quota-card__hint">Linhas de quota em que foi possível identificar quem fez.</div>
      </article>
    `;

    renderBarList("quotaTimeline", quota.timeline);
  }

  function renderQuotaStageCoverage(analytics) {
    const target = document.getElementById("quotaStageCoverage");
    if (!target) return;
    const items = (analytics.quotaAnalytics.stageCoverage || []).map((item) => ({
      label: `${item.label} · ${formatNumber(item.filled)}/${formatNumber(item.expectedRows)}`,
      value: item.rate,
    }));
    renderBarList("quotaStageCoverage", items, { valueFormatter: (value) => formatPercent(value) });
  }

  function renderQuotaExpectedDistribution(analytics) {
    renderBarList("quotaExpectedDistribution", analytics.quotaAnalytics.expectedDistribution || []);
  }

  function renderQuotaPendingByResp(analytics) {
    renderBarList("quotaPendingByResp", analytics.quotaAnalytics.pendingByResp || []);
  }

  function renderQuotaActors(analytics) {
    renderBarList("quotaActorDistribution", analytics.quotaAnalytics.actorDistribution || []);
  }

  function renderQuotaStageTimelines(analytics) {
    const target = document.getElementById("quotaStageTimelines");
    if (!target) return;
    const groups = analytics.quotaAnalytics.stageTimelines || [];
    if (!groups.length) {
      target.innerHTML = '<div class="empty-state">Sem histórico por etapa para mostrar.</div>';
      return;
    }

    target.innerHTML = groups
      .map(
        (group) => `
          <article class="quota-stage-panel">
            <div class="quota-stage-panel__title">${escapeHtml(group.label)}</div>
            <div class="bar-list">${group.items.length ? group.items
              .map(
                (item) => `
                  <div class="bar-row">
                    <div class="bar-row__meta">
                      <span class="bar-row__label">${escapeHtml(item.label)}</span>
                      <span class="bar-row__value">${formatNumber(item.value)}</span>
                    </div>
                    <div class="bar-row__track">
                      <div class="bar-row__fill" style="width:${Math.max(6, (item.value / Math.max(...group.items.map((entry) => entry.value), 1)) * 100)}%"></div>
                    </div>
                  </div>
                `
              )
              .join("") : '<div class="empty-state">Sem datas nessa etapa.</div>'}</div>
          </article>
        `
      )
      .join("");
  }

  function renderQuotaAuditRows(analytics) {
    const tbody = document.getElementById("quotaAuditRows");
    if (!tbody) return;
    const items = analytics.quotaAnalytics.focusRows || [];
    if (!items.length) {
      tbody.innerHTML =
        '<tr><td colspan="11"><div class="empty-state">Sem linhas de quota suficientes para auditoria detalhada.</div></td></tr>';
      return;
    }

    tbody.innerHTML = items
      .map(
        (item) => `
          <tr>
            <td><span class="row-code">${escapeHtml(item.cod || "-")}</span></td>
            <td><div class="row-name">${escapeHtml(item.razao_social || "Sem razão social")}</div></td>
            <td>${escapeHtml(item.resp1 || "Não informado")}</td>
            <td>${escapeHtml(String(item.num_quotas || "-"))}</td>
            <td>${formatNumber(item.expected)}</td>
            <td>${formatNumber(item.delivered)}</td>
            <td>${formatNumber(item.pendingExpected)}</td>
            <td>${escapeHtml(item.quota1 || "-")}<br>${escapeHtml(item.quota2 || "-")}<br>${escapeHtml(item.quota3 || "-")}</td>
            <td>${formatNumber(item.invalidDates)}</td>
            <td>${escapeHtml(item.actor || "Não identificado")}</td>
            <td><span class="table-badge" data-tone="${item.issueTone}">${escapeHtml(item.issueLabel)}</span></td>
          </tr>
        `
      )
      .join("");
  }

  function renderMonthlyRevenue(analytics) {
    const monthlyKpis = document.getElementById("monthlyKpis");
    if (monthlyKpis) {
      const time = analytics.timeAnalytics;
      monthlyKpis.innerHTML = `
        <article class="summary-kpi">
          <span class="summary-kpi__label">Faturamento anual PT</span>
          <strong class="summary-kpi__value">${formatCurrency(time.annualRevenue)}</strong>
          <span class="summary-kpi__hint">Soma dos 12 meses do Painel Tributário.</span>
        </article>
        <article class="summary-kpi">
          <span class="summary-kpi__label">Média mensal</span>
          <strong class="summary-kpi__value">${formatCurrency(time.averageMonthlyRevenue)}</strong>
          <span class="summary-kpi__hint">Média mensal consolidada no ano.</span>
        </article>
        <article class="summary-kpi">
          <span class="summary-kpi__label">Maior mês</span>
          <strong class="summary-kpi__value">${time.bestMonth ? escapeHtml(time.bestMonth.label) : "--"}</strong>
          <span class="summary-kpi__hint">${time.bestMonth ? formatCurrency(time.bestMonth.value) : "Sem dados mensais."}</span>
        </article>
        <article class="summary-kpi">
          <span class="summary-kpi__label">Maior trimestre</span>
          <strong class="summary-kpi__value">${time.bestQuarter ? escapeHtml(time.bestQuarter.label) : "--"}</strong>
          <span class="summary-kpi__hint">${time.bestQuarter ? formatCurrency(time.bestQuarter.ptRevenue) : "Sem dados trimestrais."}</span>
        </article>
      `;
    }

    renderBarList("monthlyRevenueBars", analytics.timeAnalytics.monthlyRevenue, {
      valueFormatter: formatCurrency,
    });
  }

  function renderQuarterSummary(analytics) {
    const tbody = document.getElementById("quarterSummaryRows");
    if (!tbody) return;

    const rows = analytics.timeAnalytics.quarterSummary || [];
    if (!rows.length) {
      tbody.innerHTML =
        '<tr><td colspan="11"><div class="empty-state">Sem leitura trimestral suficiente para consolidar o BI.</div></td></tr>';
      return;
    }

    tbody.innerHTML = rows
      .map(
        (item) => `
          <tr>
            <td><span class="row-name">${escapeHtml(item.label)}</span><div class="row-note">${escapeHtml(item.monthsLabel)}</div></td>
            <td>${formatNumber(item.clients)}</td>
            <td>${formatNumber(item.quotaComplete)}</td>
            <td>${formatCurrency(item.ptRevenue)}</td>
            <td>${formatCurrency(item.ptBc)}</td>
            <td>${formatCurrency(item.ptIr)}</td>
            <td>${formatCurrency(item.ptCsll)}</td>
            <td>${formatCurrency(item.lrRevenue)}</td>
            <td>${formatCurrency(item.lrBc)}</td>
            <td>${formatCurrency(item.lrIr)}</td>
            <td>${formatCurrency(item.lrCsll)}</td>
          </tr>
        `
      )
      .join("");
  }

  function renderSourceChecks(checks) {
    const target = document.getElementById("sourceChecks");
    if (!target) return;
    if (!checks.length) {
      target.innerHTML = '<div class="empty-state">Sem fontes monitoradas para esta leitura.</div>';
      return;
    }

    target.innerHTML = checks
      .map(
        (item) => `
          <article class="source-check">
            <div class="source-check__head">
              <strong>${escapeHtml(item.label)}</strong>
              <span>${formatNumber(item.rows)} registro(s)</span>
            </div>
            <div class="source-check__meta">${escapeHtml(formatDateTime(item.updatedAt))}</div>
          </article>
        `
      )
      .join("");
  }

  function renderHighlightRows(items) {
    const tbody = document.getElementById("analyticsRows");
    if (!tbody) return;

    if (!items.length) {
      tbody.innerHTML =
        '<tr><td colspan="9"><div class="empty-state">Sem registros sensíveis suficientes para montar o foco da auditoria.</div></td></tr>';
      return;
    }

    tbody.innerHTML = items
      .map(({ row, signal }) => `
        <tr>
          <td><span class="row-code">${escapeHtml(row.cod || "-")}</span></td>
          <td>
            <div class="row-name">${escapeHtml(row.razao_social || "Sem razão social")}</div>
            <div class="row-note">${escapeHtml(row.grupo || "Sem grupo")}</div>
          </td>
          <td>${escapeHtml(row.trib || "Não informado")}</td>
          <td>${escapeHtml(row.status || "Não informado")}</td>
          <td>${escapeHtml(row.resp1 || "Não informado")}</td>
          <td>${escapeHtml(row.resp2 || "Não informado")}</td>
          <td>${escapeHtml(row.mit || row.controle_mit || "Sem registro")}</td>
          <td>${escapeHtml(row.inconsistencia_athenas || "Sem apontamento")}</td>
          <td><span class="table-badge" data-tone="${signal.tone}">${escapeHtml(signal.label)}</span></td>
        </tr>
      `)
      .join("");
  }

  function renderAuditRows(coverage) {
    const tbody = document.getElementById("analyticsAuditRows");
    if (!tbody) return;

    if (!coverage.length) {
      tbody.innerHTML =
        '<tr><td colspan="6"><div class="empty-state">Sem estrutura suficiente para auditar as colunas.</div></td></tr>';
      return;
    }

    tbody.innerHTML = coverage
      .map((item) => `
        <tr>
          <td><span class="row-name">${escapeHtml(item.label)}</span><div class="row-note">${escapeHtml(item.key)}</div></td>
          <td>${formatNumber(item.filled)}</td>
          <td>${formatNumber(item.empty)}</td>
          <td>
            <div class="audit-fill"><span style="width:${item.rate}%"></span></div>
            <div class="audit-summary">${formatPercent(item.rate)}</div>
          </td>
          <td>${escapeHtml(formatDateTime(item.lastUpdatedAt))}</td>
          <td><span class="table-badge" data-tone="${item.tone}">${
            item.tone === "danger" ? "Cobertura baixa" : item.tone === "warn" ? "Cobertura média" : "Cobertura boa"
          }</span></td>
        </tr>
      `)
      .join("");
  }

  function renderActivityChart(series) {
    const svg = document.getElementById("activityChart");
    const summary = document.getElementById("activitySummary");
    if (!svg || !summary) return;

    if (!series.length) {
      svg.innerHTML = "";
      summary.innerHTML = '<div class="empty-state">Sem histórico suficiente para montar a atividade recente.</div>';
      return;
    }

    const width = 420;
    const height = 170;
    const padding = { top: 18, right: 18, bottom: 28, left: 18 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const maxValue = Math.max(...series.map((item) => item.value), 1);

    const points = series.map((item, index) => {
      const x = padding.left + (plotWidth / Math.max(series.length - 1, 1)) * index;
      const y = padding.top + plotHeight - (item.value / maxValue) * plotHeight;
      return { ...item, x, y };
    });

    const linePath = points
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
      .join(" ");

    const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(2)} ${(padding.top + plotHeight).toFixed(2)} L ${
      points[0].x.toFixed(2)
    } ${(padding.top + plotHeight).toFixed(2)} Z`;

    const gridLines = [0, 0.5, 1]
      .map((ratio) => {
        const y = padding.top + plotHeight - ratio * plotHeight;
        return `<line class="activity-chart__grid" x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}"></line>`;
      })
      .join("");

    const dots = points
      .map((point) => `<circle class="activity-chart__dot" cx="${point.x}" cy="${point.y}" r="4"></circle>`)
      .join("");

    const labels = points
      .filter((_, index) => index === 0 || index === points.length - 1 || index === Math.floor(points.length / 2))
      .map(
        (point) =>
          `<text class="activity-chart__label" x="${point.x}" y="${height - 8}" text-anchor="middle">${escapeHtml(point.label)}</text>`
      )
      .join("");

    svg.innerHTML = `
      ${gridLines}
      <path class="activity-chart__area" d="${areaPath}"></path>
      <path class="activity-chart__line" d="${linePath}"></path>
      ${dots}
      ${labels}
    `;

    const total = series.reduce((sum, item) => sum + item.value, 0);
    const max = Math.max(...series.map((item) => item.value), 0);
    const activeDays = series.filter((item) => item.value > 0).length;

    summary.innerHTML = `
      <div class="activity-summary__card">
        <div class="activity-summary__label">Alterações no período</div>
        <div class="activity-summary__value">${formatNumber(total)}</div>
      </div>
      <div class="activity-summary__card">
        <div class="activity-summary__label">Pico diário</div>
        <div class="activity-summary__value">${formatNumber(max)}</div>
      </div>
      <div class="activity-summary__card">
        <div class="activity-summary__label">Dias com movimento</div>
        <div class="activity-summary__value">${formatNumber(activeDays)}</div>
      </div>
    `;
  }

  function getSpreadsheetBaseRows() {
    return state.contFlow.rows.filter((row) => isRealClientRow(row, state.contFlow.columns));
  }

  function filterRowsForSheet(rows, columns, searchTerm) {
    const query = normalizeText(searchTerm);
    if (!query) return rows;

    return rows.filter((row) =>
      columns.some((col) => normalizeText(row[col.key]).includes(query))
    );
  }

  function renderSpreadsheet() {
    const head = document.getElementById("analyticsSheetHead");
    const body = document.getElementById("analyticsSheetBody");
    const meta = document.getElementById("analyticsSheetMeta");
    if (!head || !body || !meta) return;

    const columns = state.contFlow.columns;
    const rows = state.filteredRows;

    if (!columns.length) {
      head.innerHTML = "";
      body.innerHTML = '<tr><td><div class="empty-state">Sem colunas disponíveis na planilha integrada.</div></td></tr>';
      meta.textContent = "0 linha(s)";
      return;
    }

    head.innerHTML = `<tr>${columns.map((col) => `<th>${escapeHtml(col.label)}</th>`).join("")}</tr>`;

    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="${columns.length}"><div class="empty-state">Nenhuma linha encontrada para o filtro atual.</div></td></tr>`;
      meta.textContent = "0 linha(s)";
      return;
    }

    body.innerHTML = rows
      .map(
        (row) => `<tr>${columns.map((col) => `<td>${escapeHtml(row[col.key] || "")}</td>`).join("")}</tr>`
      )
      .join("");

    meta.textContent = `${formatNumber(rows.length)} linha(s)`;
  }

  function renderAnalytics() {
    const analytics = computeAnalytics(state.contFlow, {
      contFlowSheets: state.contFlowSheets,
      painelTributario: state.painelTributario,
      painelTributarioLR: state.painelTributarioLR,
    });
    const updatedEl = document.getElementById("analyticsUpdatedAt");
    const sourceChip = document.getElementById("analyticsSourceChip");

    setMetric("metricQuotaComplete", analytics.quotaAnalytics.allDelivered, "Clientes com ciclo completo de quotas.");
    setMetric("metricQuotaCoverage", analytics.quotaAnalytics.coverage, "Preenchimento médio entre 1ª, 2ª e 3ª quota.", (value) => formatPercent(value));
    setMetric("metricQuotaPending", analytics.quotaAnalytics.pending, "Clientes com quota iniciada e ciclo ainda aberto.");
    setMetric("metricTotal", analytics.totalRows, "Clientes válidos identificados na base.");
    setMetric("metricActive", analytics.activeRows, `${formatNumber(Math.max(analytics.totalRows - analytics.activeRows, 0))} fora da operação ativa.`);
    setMetric("metricNoResp1", analytics.noResp1, analytics.noResp1 ? "Carteira ainda sem dono primário em parte da base." : "Cobertura completa de Resp.1.");
    setMetric("metricMit", analytics.mitPending, analytics.mitPending ? "Há sinais de pendência em MIT/Controle MIT." : "Sem sinais fortes de pendência no MIT.");
    setMetric("metricAthenas", analytics.inconsistencias, analytics.inconsistencias ? "Campo de inconsistência com registros preenchidos." : "Sem inconsistências preenchidas.");
    setMetric("metricDesligamento", analytics.desligamentos, analytics.desligamentos ? "Há linhas com desligamento informado." : "Sem desligamentos preenchidos.");
    setMetric("metricColumns", analytics.totalColumns, "Todas as colunas atuais do ContFlow estão auditadas.");
    setMetric("metricCoverage", analytics.averageCoverage, "Média de preenchimento entre todas as colunas.", (value) => formatPercent(value));

    renderInsights(analytics);
    renderBarList("tribDistribution", analytics.triDist);
    renderBarList("statusDistribution", analytics.statusDist);
    renderBarList("responsavelDistribution", analytics.respDist);
    renderBarList("resp2Distribution", analytics.resp2Dist);
    renderBarList("grupoDistribution", analytics.grupoDist);
    renderBarList("classDistribution", analytics.classDist);
    renderQualityGrid(analytics);
    renderQuotaMetrics(analytics);
    renderQuotaStageCoverage(analytics);
    renderQuotaExpectedDistribution(analytics);
    renderQuotaPendingByResp(analytics);
    renderQuotaActors(analytics);
    renderQuotaStageTimelines(analytics);
    renderQuotaAuditRows(analytics);
    renderMonthlyRevenue(analytics);
    renderQuarterSummary(analytics);
    renderSourceChecks(state.sourceChecks);
    renderHighlightRows(analytics.highlightRows);
    renderAuditRows(analytics.coverage);
    renderActivityChart(analytics.activity);
    renderDonutChart("tribDonutChart", "tribDonutLegend", analytics.triDist, "Tributação", analytics.totalRows);
    renderDonutChart("statusDonutChart", "statusDonutLegend", analytics.statusDist, "Status", analytics.totalRows);
    renderSpreadsheet();

    if (updatedEl) {
      updatedEl.textContent = `Última leitura: ${formatDateTime(state.contFlow.savedAt || new Date().toISOString())}`;
    }
    if (sourceChip) {
      sourceChip.textContent = `Fonte: ContFlow + Painel Tributário + LR • ${formatNumber(analytics.totalRows)} cliente(s) • ${formatNumber(analytics.timeAnalytics.quarterSummary.length)} trimestre(s) auditado(s)`;
    }
  }

  function renderLoadingState() {
    const updatedEl = document.getElementById("analyticsUpdatedAt");
    const sourceChip = document.getElementById("analyticsSourceChip");
    const insights = document.getElementById("analyticsInsights");
    const auditRows = document.getElementById("analyticsAuditRows");
    const sheetBody = document.getElementById("analyticsSheetBody");

    if (updatedEl) updatedEl.textContent = "Atualizando indicadores e auditoria...";
    if (sourceChip) sourceChip.textContent = "Fonte: ContFlow";
    if (insights) insights.innerHTML = '<div class="empty-state">Carregando leitura gerencial da base...</div>';
    if (auditRows) {
      auditRows.innerHTML = '<tr><td colspan="6"><div class="empty-state">Montando auditoria por coluna...</div></td></tr>';
    }
    if (sheetBody) {
      sheetBody.innerHTML = '<tr><td><div class="empty-state">Carregando planilha integrada...</div></td></tr>';
    }
    renderBarList("monthlyRevenueBars", []);
    renderSourceChecks([]);
    renderBarList("quotaStageCoverage", []);
    renderBarList("quotaExpectedDistribution", []);
    renderBarList("quotaPendingByResp", []);
    renderBarList("quotaActorDistribution", []);
    const quotaStageTimelines = document.getElementById("quotaStageTimelines");
    if (quotaStageTimelines) {
      quotaStageTimelines.innerHTML = '<div class="empty-state">Carregando linha do tempo por etapa...</div>';
    }
    const quotaAuditRows = document.getElementById("quotaAuditRows");
    if (quotaAuditRows) {
      quotaAuditRows.innerHTML = '<tr><td colspan="11"><div class="empty-state">Montando auditoria detalhada de quotas...</div></td></tr>';
    }
    const quarterRows = document.getElementById("quarterSummaryRows");
    if (quarterRows) {
      quarterRows.innerHTML = '<tr><td colspan="11"><div class="empty-state">Consolidando leitura mensal e trimestral...</div></td></tr>';
    }
  }

  function renderAnalyticsError(err) {
    console.error("❌ Falha ao carregar BI do ContAnalytics:", err);
    const healthPill = document.getElementById("analyticsHealthPill");
    const insights = document.getElementById("analyticsInsights");
    const rows = document.getElementById("analyticsRows");
    const auditRows = document.getElementById("analyticsAuditRows");
    const sheetBody = document.getElementById("analyticsSheetBody");
    const quotaMetrics = document.getElementById("quotaMetrics");

    ["metricQuotaComplete", "metricQuotaCoverage", "metricQuotaPending", "metricTotal", "metricActive", "metricNoResp1", "metricMit", "metricAthenas", "metricDesligamento", "metricColumns", "metricCoverage"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = "--";
    });

    if (healthPill) {
      healthPill.textContent = "Falha parcial";
      healthPill.dataset.tone = "danger";
    }
    if (insights) {
      insights.innerHTML = `<div class="empty-state">${escapeHtml(err?.message || "Não foi possível carregar a auditoria agora.")}</div>`;
    }
    if (rows) {
      rows.innerHTML = '<tr><td colspan="8"><div class="empty-state">Os destaques não puderam ser montados.</div></td></tr>';
    }
    if (auditRows) {
      auditRows.innerHTML = '<tr><td colspan="6"><div class="empty-state">A auditoria por coluna não pôde ser calculada.</div></td></tr>';
    }
    if (sheetBody) {
      sheetBody.innerHTML = '<tr><td><div class="empty-state">A planilha integrada não pôde ser carregada.</div></td></tr>';
    }
    if (quotaMetrics) {
      quotaMetrics.innerHTML = '<div class="empty-state">As métricas de quotas não puderam ser calculadas.</div>';
    }

    renderBarList("tribDistribution", []);
    renderBarList("statusDistribution", []);
    renderBarList("responsavelDistribution", []);
    renderBarList("resp2Distribution", []);
    renderBarList("grupoDistribution", []);
    renderBarList("classDistribution", []);
    renderBarList("quotaTimeline", []);
    renderBarList("quotaStageCoverage", []);
    renderBarList("quotaExpectedDistribution", []);
    renderBarList("quotaPendingByResp", []);
    renderBarList("quotaActorDistribution", []);
    renderBarList("monthlyRevenueBars", []);
    renderSourceChecks([]);
    renderDonutChart("tribDonutChart", "tribDonutLegend", [], "Tributação", 0);
    renderDonutChart("statusDonutChart", "statusDonutLegend", [], "Status", 0);
    renderActivityChart([]);
    const quotaStageTimelines = document.getElementById("quotaStageTimelines");
    if (quotaStageTimelines) {
      quotaStageTimelines.innerHTML = '<div class="empty-state">A linha do tempo por etapa não pôde ser calculada.</div>';
    }
    const quotaAuditRows = document.getElementById("quotaAuditRows");
    if (quotaAuditRows) {
      quotaAuditRows.innerHTML = '<tr><td colspan="11"><div class="empty-state">A auditoria de quotas não pôde ser montada.</div></td></tr>';
    }
    const quarterRows = document.getElementById("quarterSummaryRows");
    if (quarterRows) {
      quarterRows.innerHTML = '<tr><td colspan="11"><div class="empty-state">O resumo trimestral não pôde ser montado.</div></td></tr>';
    }
  }

  async function loadAnalytics() {
    renderLoadingState();
    const sources = [
      { key: "cf1", url: API_CONTFLOW, extractor: extractContFlowDataset },
      { key: "cf2", url: API_CONTFLOW_Q2, extractor: extractContFlowDataset },
      { key: "cf3", url: API_CONTFLOW_Q3, extractor: extractContFlowDataset },
      { key: "cf4", url: API_CONTFLOW_Q4, extractor: extractContFlowDataset },
      { key: "pt", url: API_PAINEL_TRIBUTARIO, extractor: extractSheetDataset },
      { key: "ptlr", url: API_PAINEL_TRIBUTARIO_LR, extractor: extractSheetDataset },
    ];

    const results = await Promise.allSettled(
      sources.map((source) => fetchJson(source.url, { method: "GET" }))
    );

    const datasets = {};
    results.forEach((result, index) => {
      const source = sources[index];
      if (result.status === "fulfilled") {
        datasets[source.key] = source.extractor(result.value);
      } else {
        console.warn(`Falha ao carregar ${source.key} no ContAnalytics:`, result.reason);
        datasets[source.key] = EMPTY_DATASET;
      }
    });

    state.contFlowSheets = [datasets.cf1, datasets.cf2, datasets.cf3, datasets.cf4];
    state.contFlow = datasets.cf1 || EMPTY_DATASET;
    state.painelTributario = datasets.pt || EMPTY_DATASET;
    state.painelTributarioLR = datasets.ptlr || EMPTY_DATASET;
    state.sourceChecks = buildSourceChecks(
      state.contFlowSheets,
      state.painelTributario,
      state.painelTributarioLR
    );

    state.filteredRows = filterRowsForSheet(getSpreadsheetBaseRows(), state.contFlow.columns, state.searchTerm);
    renderAnalytics();
  }

  function exportSpreadsheet() {
    if (!window.XLSX) {
      alert("Biblioteca XLSX não carregada.");
      return;
    }

    const columns = state.contFlow.columns;
    const rows = state.filteredRows.length ? state.filteredRows : getSpreadsheetBaseRows();
    if (!columns.length) {
      alert("Nenhuma coluna disponível para exportação.");
      return;
    }

    const analytics = computeAnalytics(state.contFlow, {
      contFlowSheets: state.contFlowSheets,
      painelTributario: state.painelTributario,
      painelTributarioLR: state.painelTributarioLR,
    });

    const header = columns.map((col) => col.label);
    const body = rows.map((row) => columns.map((col) => row[col.key] ?? ""));
    const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ContAnalytics");

    const quarterSheet = XLSX.utils.aoa_to_sheet([
      ["Trimestre", "Clientes", "Quotas completas", "Fat PT", "BC PT", "IRPJ PT", "CSLL PT", "Fat LR", "BC LR", "IRPJ LR", "CSLL LR"],
      ...analytics.timeAnalytics.quarterSummary.map((item) => [
        item.label,
        item.clients,
        item.quotaComplete,
        item.ptRevenue,
        item.ptBc,
        item.ptIr,
        item.ptCsll,
        item.lrRevenue,
        item.lrBc,
        item.lrIr,
        item.lrCsll,
      ]),
    ]);
    XLSX.utils.book_append_sheet(wb, quarterSheet, "Resumo Trimestral");

    const monthlySheet = XLSX.utils.aoa_to_sheet([
      ["Mês", "Fat PT", "Fat LR"],
      ...analytics.timeAnalytics.monthlyRevenue.map((item) => [item.label, item.value, item.lrValue]),
    ]);
    XLSX.utils.book_append_sheet(wb, monthlySheet, "Faturamento Mensal");

    const quotaSummarySheet = XLSX.utils.aoa_to_sheet([
      ["Indicador", "Valor"],
      ["1ª quota entregue", analytics.quotaAnalytics.quota1],
      ["2ª quota entregue", analytics.quotaAnalytics.quota2],
      ["3ª quota entregue", analytics.quotaAnalytics.quota3],
      ["Ciclo esperado completo", analytics.quotaAnalytics.clientsCompleteExpected],
      ["Clientes com pendência", analytics.quotaAnalytics.clientsPendingExpected],
      ["Cobertura de quotas (%)", analytics.quotaAnalytics.coverage],
      ["Sem Num Quotas", analytics.quotaAnalytics.missingNumQuotas],
      ["Num Quotas inválido", analytics.quotaAnalytics.invalidNumQuotas],
      ["Sequência inconsistente", analytics.quotaAnalytics.sequenceIssues],
      ["Linhas com datas inválidas", analytics.quotaAnalytics.invalidDateRows],
      ["Dispensadas", analytics.quotaAnalytics.dispensadas],
      ["S/M", analytics.quotaAnalytics.semMovimento],
      ["Com autor identificado", analytics.quotaAnalytics.withActor],
    ]);
    XLSX.utils.book_append_sheet(wb, quotaSummarySheet, "Resumo Quotas");

    const quotaAuditSheet = XLSX.utils.aoa_to_sheet([
      ["Cód.", "Razão social", "Resp.1", "Num Quotas", "Esperado", "Entregue", "Pendente", "1ª quota", "2ª quota", "3ª quota", "Datas inválidas", "Quem fez", "Leitura"],
      ...analytics.quotaAnalytics.focusRows.map((item) => [
        item.cod,
        item.razao_social,
        item.resp1,
        item.num_quotas,
        item.expected,
        item.delivered,
        item.pendingExpected,
        item.quota1,
        item.quota2,
        item.quota3,
        item.invalidDates,
        item.actor,
        item.issueLabel,
      ]),
    ]);
    XLSX.utils.book_append_sheet(wb, quotaAuditSheet, "Auditoria Quotas");

    XLSX.writeFile(wb, `contanalytics-auditoria-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function bindAnalyticsActions() {
    const btnRefresh = document.getElementById("btnAnalyticsRefresh");
    const btnExport = document.getElementById("btnAnalyticsExport");
    const searchInput = document.getElementById("analyticsSheetSearch");

    btnRefresh?.addEventListener("click", async () => {
      btnRefresh.disabled = true;
      btnRefresh.textContent = "Atualizando...";
      try {
        await loadAnalytics();
      } catch (err) {
        renderAnalyticsError(err);
      } finally {
        btnRefresh.disabled = false;
        btnRefresh.textContent = "Atualizar BI";
      }
    });

    btnExport?.addEventListener("click", exportSpreadsheet);

    searchInput?.addEventListener("input", () => {
      state.searchTerm = String(searchInput.value || "");
      state.filteredRows = filterRowsForSheet(getSpreadsheetBaseRows(), state.contFlow.columns, state.searchTerm);
      renderSpreadsheet();
    });
  }

  function handleInitError(err) {
    console.error("❌ Falha ao inicializar ContAnalytics:", err);
    fillPageTexts();
    bindMenu();
    bindSidebarNavigation();
    syncSidebarFromStore();
    markCurrentModuleActive();
    renderUserCard();
    bindAnalyticsActions();
    renderAnalyticsError(err);
  }

  async function init() {
    try {
      await loadSessionUser();

      if (!currentUser) {
        throw new Error("Sessão do usuário não encontrada.");
      }

      await loadModulesFromApi();

      fillPageTexts();
      bindMenu();
      bindSidebarNavigation();
      syncSidebarFromStore();
      applyRoleToSidebar();
      markCurrentModuleActive();
      renderUserCard();
      bindUserActions();
      bindAnalyticsActions();
      await loadAnalytics();

      console.log("🎉 ContAnalytics inicializado!");
    } catch (err) {
      handleInitError(err);
    }
  }

  init();
});
