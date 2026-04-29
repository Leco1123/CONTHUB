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
  const API_PAINEL_TRIBUTARIO_LRA = "/api/sheets/painel-tributario-lra";
  const DONUT_COLORS = ["#31c8ff", "#4ecca3", "#ffd166", "#ff8fab", "#9b8cff", "#ff9f43", "#7bd389"];
  const ACTIVITY_DAYS = 14;
  const QUARTER_LABELS = ["1º Trimestre", "2º Trimestre", "3º Trimestre", "4º Trimestre"];
  const MONTH_LABELS = [
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
  let moduleAccessMap = {};
  let analyticsDrillBound = false;

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
    painelTributarioLRA: EMPTY_DATASET,
    sourceChecks: [],
    filteredRows: [],
    searchTerm: "",
    lastAnalytics: null,
    taxBiAnalytics: {},
    contFlowCompanyMap: new Map(),
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

  function normalizeAccessToken(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function getAccessProfile(user) {
    const profile = normalizeAccessToken(
      user?.accessProfile || user?.access_profile || user?.perfilAcesso || user?.perfil_acesso || user?.role
    );
    if (profile === "ti") return "ti";
    if (profile === "admin" || profile === "gerencial" || profile === "gerencia") return "gerencial";
    if (profile === "coordenacao" || profile === "coordenador") return "coordenacao";
    if (profile === "consulta") return "consulta";
    return "operacional";
  }

  function normalizeModuleAccess(access) {
    return String(access || "")
      .split("+")
      .map(normalizeAccessToken)
      .filter(Boolean);
  }

  function canAccessModule(moduleId, user = getSessionUser()) {
    const id = normalizeAccessToken(moduleId);
    const profile = getAccessProfile(user);
    const role = normalizeAccessToken(user?.role);
    const rules = normalizeModuleAccess(moduleAccessMap[id]);

    if (profile === "ti" || role === "ti") return true;
    if (id === "contadmin") return profile === "gerencial" || role === "admin";
    if (id === "contanalytics") return ["ti", "gerencial", "coordenacao"].includes(profile) || role === "admin";
    if (!rules.length || rules.includes("user") || rules.includes("user+admin")) return true;
    if (rules.includes("all") || rules.includes("*") || rules.includes("auth")) return true;
    return rules.includes(profile) || rules.includes(role) || (rules.includes("admin") && role === "admin");
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
    let raw = String(value ?? "").trim();
    if (!raw) return 0;

    raw = raw
      .replace(/\s+/g, "")
      .replace(/\u00a0/g, "")
      .replace(/^R\$/i, "")
      .replace(/[^\d,.-]/g, "");

    if (!raw || raw === "-" || raw === "," || raw === ".") return 0;

    const hasComma = raw.includes(",");
    const dotCount = (raw.match(/\./g) || []).length;

    if (hasComma) {
      raw = raw.replace(/\./g, "").replace(",", ".");
    } else if (dotCount > 1) {
      raw = raw.replace(/\./g, "");
    } else if (dotCount === 1) {
      const signless = raw.replace(/^-/, "");
      const [intPart, fracPart = ""] = signless.split(".");
      if (fracPart.length === 3 && intPart.length <= 3) {
        raw = raw.replace(".", "");
      }
    }

    const parsed = Number(raw);
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
    const accessMap = {};
    rows.forEach((m) => {
      const slug = String(m.slug || "").trim().toLowerCase();
      if (!slug) return;
      map[slug] = normalizeModuleStatus(m.status, m.active);
      accessMap[slug] = String(m.access || "").trim();
    });

    moduleStatusMap = map;
    moduleAccessMap = accessMap;
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

    getSidebarCards().forEach((card) => {
      const moduleId = card.dataset.moduleId;
      if (!moduleId) return;

      const blocked = !canAccessModule(moduleId, current);
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

  function newestDateValue(values) {
    return (values || []).reduce((best, value) => {
      if (!value) return best;
      const dt = new Date(value);
      if (Number.isNaN(dt.getTime())) return best;
      if (!best || dt > new Date(best)) return dt.toISOString();
      return best;
    }, "");
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

      const savedAt = newestDateValue([
        payload?.savedAt,
        payload?.sheet?.updatedAt,
        payload?.sheet?.createdAt,
        ...cells.map((cell) => cell.updatedAt),
      ]);

      return {
        columns,
        rows: Array.from(rowMap.values()),
        cells,
        savedAt,
        version: Number(payload?.sheet?.version || payload?.version || 0),
        sheetKey: String(payload?.sheet?.key || payload?.key || ""),
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
        savedAt: newestDateValue([
          payload?.savedAt,
          payload?.updatedAt,
          payload?.createdAt,
          ...cells.map((cell) => cell.updatedAt),
        ]),
        version: Number(payload?.version || 0),
        sheetKey: String(payload?.key || ""),
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

  function getDatasetTime(dataset) {
    const dt = new Date(dataset?.savedAt || "");
    return Number.isNaN(dt.getTime()) ? 0 : dt.getTime();
  }

  function getLatestContFlowDataset(datasets = []) {
    const candidates = datasets
      .map((dataset, index) => ({
        dataset: dataset || EMPTY_DATASET,
        index,
        rows: getValidContFlowRows(dataset || EMPTY_DATASET).length,
        time: getDatasetTime(dataset),
        version: Number(dataset?.version || 0),
      }))
      .filter((item) => item.rows > 0);

    if (!candidates.length) return EMPTY_DATASET;

    candidates.sort((a, b) => {
      if (b.time !== a.time) return b.time - a.time;
      if (b.version !== a.version) return b.version - a.version;
      return b.index - a.index;
    });

    return {
      ...candidates[0].dataset,
      __sourceIndex: candidates[0].index,
      __sourceLabel: `ContFlow ${QUARTER_LABELS[candidates[0].index] || ""}`.trim(),
    };
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
          monthOffset: monthOffset + 1,
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

  function buildSourceChecks(contFlowSheets, painelTributario, painelTributarioLR, painelTributarioLRA) {
    const checks = contFlowSheets.map((dataset, index) => ({
      key: `contflow-${index}`,
      label: `ContFlow ${QUARTER_LABELS[index]}`,
      rows: getValidContFlowRows(dataset).length,
      updatedAt: dataset?.savedAt || "",
    }));

    checks.push({
      key: "pt",
      label: "Painel Tributário",
      rows: (painelTributario?.rows || []).length,
      updatedAt: painelTributario?.savedAt || "",
    });
    checks.push({
      key: "ptlr",
      label: "Painel Tributário LR",
      rows: (painelTributarioLR?.rows || []).length,
      updatedAt: painelTributarioLR?.savedAt || "",
    });
    checks.push({
      key: "ptlra",
      label: "Painel Tributário - LRA",
      rows: (painelTributarioLRA?.rows || []).length,
      updatedAt: painelTributarioLRA?.savedAt || "",
    });

    checks.forEach((item) => {
      item.active = item.key === `contflow-${state.contFlow?.__sourceIndex}`;
    });

    return checks;
  }

  function getTaxBiConfigs() {
    return {
      lp: {
        key: "lp",
        title: "BI - LP",
        shortLabel: "LP",
        tribMode: "LP",
        dataset: state.painelTributario,
        periodLabels: QUARTER_LABELS,
        periodKind: "trimestre",
        baseKey: "total_bc",
        irKey: "ir_a_pagar",
        csllKey: "csll_a_pagar",
        additionalKey: "adicional",
        retentionKeys: ["retencoes_ir", "retencoes_csll"],
        revenue(row) {
          const receita = toNumberBR(row?.receita_bruta);
          if (receita) return receita;
          return [1, 2, 3].reduce((sum, monthOffset) => sum + sumPainelTributarioMonth(row, monthOffset), 0);
        },
      },
      lrt: {
        key: "lrt",
        title: "BI - LRT",
        shortLabel: "LRT",
        tribMode: "LRT",
        dataset: state.painelTributarioLR,
        periodLabels: QUARTER_LABELS,
        periodKind: "trimestre",
        baseKey: "bc",
        irKey: "irpj_a_pagar",
        csllKey: "csll_a_pagar",
        additionalKey: "irpj_adicional_lrt",
        retentionKeys: ["retencoes_incentivos_pagos", "retencoes_pagos_csll"],
        revenue(row) {
          return toNumberBR(row?.fat_total);
        },
      },
      lra: {
        key: "lra",
        title: "BI - LRA",
        shortLabel: "LRA",
        tribMode: "LRA",
        dataset: state.painelTributarioLRA,
        periodLabels: MONTH_LABELS,
        periodKind: "mês",
        baseKey: "bc",
        irKey: "irpj_a_pagar",
        csllKey: "csll_a_pagar",
        additionalKey: "irpj_adicional_lra",
        retentionKeys: ["retencoes_incentivos_pagos", "retencoes_pagos_csll"],
        revenue(row) {
          return toNumberBR(row?.fat_total);
        },
      },
    };
  }

  function getTaxPeriodIndex(row, max) {
    const raw = Number(row?.sheet_index ?? row?.sheetIndex ?? 0);
    if (Number.isInteger(raw) && raw >= 0 && raw < max) return raw;
    return 0;
  }

  function detectTaxTribMode(value) {
    const normalized = normalizeText(value).toUpperCase();
    if (!normalized) return "";
    if (normalized === "LP" || normalized.includes("PRESUMIDO")) return "LP";
    if (normalized === "LRA" || normalized.includes("REAL ANUAL")) return "LRA";
    if (
      normalized === "LRT" ||
      normalized.includes("REAL TRIMESTRAL") ||
      normalized.includes("REAL TRIMESTRA")
    ) {
      return "LRT";
    }
    return normalized;
  }

  function getTaxCompanyKey(row) {
    const documentKey = String(row?.cnpj_cpf || "").replace(/\D/g, "");
    if (documentKey) return `doc:${documentKey}`;

    const codeKey = String(row?.cod || "").trim();
    if (codeKey) return `cod:${codeKey}`;

    const nameKey = normalizeText(row?.razao_social);
    return nameKey ? `nome:${nameKey}` : "sem-identificacao";
  }

  function getTaxCompanyName(row) {
    const current = getCurrentContFlowCompany(row);
    return String(current?.razao_social || row?.razao_social || row?.cnpj_cpf || row?.cod || "Sem identificação").trim();
  }

  function buildContFlowCompanyMap(rows) {
    const map = new Map();
    (rows || []).forEach((row) => {
      const keys = [
        String(row?.cnpj_cpf || "").replace(/\D/g, "") ? `doc:${String(row.cnpj_cpf).replace(/\D/g, "")}` : "",
        String(row?.cod || "").trim() ? `cod:${String(row.cod).trim()}` : "",
        normalizeText(row?.razao_social) ? `nome:${normalizeText(row.razao_social)}` : "",
      ].filter(Boolean);

      keys.forEach((key) => {
        if (!map.has(key)) map.set(key, row);
      });
    });
    return map;
  }

  function getCurrentContFlowCompany(row) {
    const keys = [
      String(row?.cnpj_cpf || "").replace(/\D/g, "") ? `doc:${String(row.cnpj_cpf).replace(/\D/g, "")}` : "",
      String(row?.cod || "").trim() ? `cod:${String(row.cod).trim()}` : "",
      normalizeText(row?.razao_social) ? `nome:${normalizeText(row.razao_social)}` : "",
    ].filter(Boolean);

    for (const key of keys) {
      const match = state.contFlowCompanyMap.get(key);
      if (match) return match;
    }
    return null;
  }

  function getTaxBaseRows(config) {
    return getValidContFlowRows(state.contFlow).filter(
      (row) => detectTaxTribMode(row?.trib) === config.tribMode
    );
  }

  function isTaxDataRow(row, config) {
    return (
      Math.abs(config.revenue(row)) > 0 ||
      Math.abs(toNumberBR(row?.[config.baseKey])) > 0 ||
      Math.abs(toNumberBR(row?.[config.irKey])) > 0 ||
      Math.abs(toNumberBR(row?.[config.csllKey])) > 0 ||
      Math.abs(toNumberBR(row?.[config.additionalKey])) > 0 ||
      Math.abs(sumTaxRetention(row, config)) > 0
    );
  }

  function sumTaxRetention(row, config) {
    return (config.retentionKeys || []).reduce((sum, key) => sum + toNumberBR(row?.[key]), 0);
  }

  function buildTaxTotals(rows, config) {
    return rows.reduce(
      (totals, row) => {
        const revenue = config.revenue(row);
        const base = toNumberBR(row?.[config.baseKey]);
        const ir = toNumberBR(row?.[config.irKey]);
        const csll = toNumberBR(row?.[config.csllKey]);
        const additional = toNumberBR(row?.[config.additionalKey]);
        const retention = sumTaxRetention(row, config);
        totals.revenue += revenue;
        totals.base += base;
        totals.ir += ir;
        totals.csll += csll;
        totals.additional += additional;
        totals.retention += retention;
        totals.tax += ir + csll;
        return totals;
      },
      { revenue: 0, base: 0, ir: 0, csll: 0, additional: 0, retention: 0, tax: 0 }
    );
  }

  function buildTaxTopCompanies(rows, config, limit = 8) {
    const map = new Map();
    rows.forEach((row) => {
      const key = getTaxCompanyKey(row);
      const contFlowRow = getCurrentContFlowCompany(row);
      const current =
        map.get(key) || {
          key,
          name: getTaxCompanyName(row),
          meta: String(contFlowRow?.trib || contFlowRow?.status || row?.trib || row?.status || "").trim(),
          revenue: 0,
          tax: 0,
        };
      current.revenue += config.revenue(row);
      current.tax += toNumberBR(row?.[config.irKey]) + toNumberBR(row?.[config.csllKey]);
      map.set(key, current);
    });

    return Array.from(map.values())
      .sort((a, b) => b.tax - a.tax || b.revenue - a.revenue || a.name.localeCompare(b.name, "pt-BR"))
      .slice(0, limit);
  }

  function buildTaxTopRevenueCompanies(rows, config, limit = 8) {
    return buildTaxTopCompanies(rows, config, rows.length)
      .sort((a, b) => b.revenue - a.revenue || b.tax - a.tax || a.name.localeCompare(b.name, "pt-BR"))
      .slice(0, limit);
  }

  function buildTaxBiAnalytics(config) {
    const baseRows = getTaxBaseRows(config);
    const baseCompanyKeys = new Set(baseRows.map(getTaxCompanyKey));
    const rows = (config.dataset?.rows || []).filter((row) => baseCompanyKeys.has(getTaxCompanyKey(row)));
    const movementRows = rows.filter((row) => isTaxDataRow(row, config));
    const movementCompanyKeys = new Set(movementRows.map(getTaxCompanyKey));
    const totals = buildTaxTotals(movementRows, config);
    const periods = config.periodLabels.map((label, index) => {
      const periodRows = rows.filter((row) => getTaxPeriodIndex(row, config.periodLabels.length) === index);
      const periodMovementRows = periodRows.filter((row) => isTaxDataRow(row, config));
      const periodTotals = buildTaxTotals(periodMovementRows, config);
      return {
        key: `${config.key}-${index}`,
        label,
        periodIndex: index,
        rows: periodRows.length,
        clients: new Set(periodRows.map(getTaxCompanyKey)).size,
        ...periodTotals,
        effectiveRate: periodTotals.revenue ? (periodTotals.tax / periodTotals.revenue) * 100 : 0,
      };
    });
    const bestPeriod = periods.reduce(
      (best, item) => (item.tax > (best?.tax || 0) ? item : best),
      null
    );
    const averageTicket = baseCompanyKeys.size ? totals.revenue / baseCompanyKeys.size : 0;

    return {
      ...config,
      baseRows,
      rows,
      movementRows,
      totals,
      periods,
      bestPeriod,
      averageTicket,
      clients: baseCompanyKeys.size,
      activeClients: baseRows.filter(inferActiveStatus).length,
      inactiveClients: baseRows.filter((row) => !inferActiveStatus(row)).length,
      movementClients: movementCompanyKeys.size,
      noMovementClients: Math.max(baseCompanyKeys.size - movementCompanyKeys.size, 0),
      effectiveRate: totals.revenue ? (totals.tax / totals.revenue) * 100 : 0,
      topCompanies: buildTaxTopCompanies(movementRows, config),
      topRevenueCompanies: buildTaxTopRevenueCompanies(movementRows, config),
      statusDist: buildDistribution(baseRows, "status", 5),
      respDist: buildDistribution(baseRows, "resp1", 5),
    };
  }

  function renderTaxBiBars(items, valueKey = "value", formatter = formatCurrency, options = {}) {
    const max = Math.max(...items.map((item) => Math.abs(Number(item?.[valueKey] || 0))), 0);
    if (!items.length) return '<div class="empty-state">Sem dados para montar o gráfico.</div>';

    return `<div class="tax-bi-bars">${items
      .map((item) => {
        const value = Number(item?.[valueKey] || 0);
        const width = max ? Math.max((Math.abs(value) / max) * 100, 4) : 0;
        const attrs = typeof options.getAttrs === "function"
          ? drillAttrs(options.getAttrs(item))
          : options.drillType
            ? drillAttrs({
                "analytics-drill": options.drillType,
                "tax-panel": options.panelKey,
                "period-index": item.periodIndex ?? item.index ?? "",
                "drill-value": item.label,
                "drill-title": item.label,
              })
            : "";
        return `
          <div class="tax-bi-bar" ${attrs}>
            <div class="tax-bi-bar__head">
              <span>${escapeHtml(item.label)}</span>
              <strong>${escapeHtml(formatter(value))}</strong>
            </div>
            <div class="tax-bi-bar__track"><span class="tax-bi-bar__fill" style="--bar: ${width.toFixed(2)}%"></span></div>
          </div>
        `;
      })
      .join("")}</div>`;
  }

  function renderTaxBiRanking(items, valueKey = "tax", panelKey = "") {
    if (!items.length) return '<div class="empty-state">Sem empresas para ranquear ainda.</div>';

    return `<div class="tax-bi-ranking">${items
      .map((item, index) => {
        const secondary =
          valueKey === "revenue"
            ? `IRPJ + CSLL ${formatCurrency(item.tax)}`
            : `Receita ${formatCurrency(item.revenue)}`;
        return `
          <div class="tax-bi-rank" ${drillAttrs({
            "analytics-drill": "tax-company",
            "tax-panel": panelKey,
            "company-key": item.key,
            "drill-title": item.name,
          })}>
            <span class="tax-bi-rank__pos">${index + 1}</span>
            <div>
              <div class="tax-bi-rank__name">${escapeHtml(item.name)}</div>
              <div class="tax-bi-rank__meta">${escapeHtml(item.meta || "Sem classificação")} • ${escapeHtml(secondary)}</div>
            </div>
            <strong class="tax-bi-rank__value">${escapeHtml(formatCurrency(item[valueKey]))}</strong>
          </div>
        `;
      })
      .join("")}</div>`;
  }

  function renderTaxBiTopic(kicker, title, subtitle, body, modifier = "") {
    return `
      <section class="tax-bi-topic ${modifier}">
        <div class="tax-bi-topic__head">
          <div>
            <span class="tax-bi-topic__kicker">${escapeHtml(kicker)}</span>
            <h3 class="tax-bi-topic__title">${escapeHtml(title)}</h3>
            <p class="tax-bi-topic__subtitle">${escapeHtml(subtitle)}</p>
          </div>
        </div>
        <div class="tax-bi-topic__body">${body}</div>
      </section>
    `;
  }

  function renderTaxBiCard(label, value, hint, modifier = "", attrs = {}) {
    return `
      <article class="tax-bi-card ${modifier}" ${drillAttrs(attrs)}>
        <span class="tax-bi-card__label">${escapeHtml(label)}</span>
        <strong class="tax-bi-card__value">${escapeHtml(value)}</strong>
        <span class="tax-bi-card__hint">${escapeHtml(hint)}</span>
      </article>
    `;
  }

  function renderTaxBiProgress(label, current, total, hint = "") {
    const rate = total ? (current / total) * 100 : 0;
    return `
      <div class="tax-bi-progress">
        <div class="tax-bi-progress__head">
          <span>${escapeHtml(label)}</span>
          <strong>${formatNumber(current)} / ${formatNumber(total)} • ${formatPercent(rate)}</strong>
        </div>
        <div class="tax-bi-progress__track">
          <span class="tax-bi-progress__fill" style="--bar: ${Math.min(Math.max(rate, 0), 100).toFixed(2)}%"></span>
        </div>
        ${hint ? `<div class="tax-bi-card__hint">${escapeHtml(hint)}</div>` : ""}
      </div>
    `;
  }

  function renderTaxBiValueList(items) {
    return `<div class="tax-bi-value-list">${items
      .map(
        ([label, value]) => `
          <div class="tax-bi-value-row">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(value)}</strong>
          </div>
        `
      )
      .join("")}</div>`;
  }

  function renderTaxBiDiagnostics(analytics) {
    const bestPeriod = analytics.bestPeriod?.label || "sem destaque";
    const topCompany = analytics.topCompanies[0]?.name || "sem empresa ranqueada";
    const topTax = analytics.topCompanies[0]?.tax || 0;
    const statusLeader = analytics.statusDist[0]?.label || "sem status";
    const movementRate = analytics.clients ? (analytics.movementClients / analytics.clients) * 100 : 0;

    const items = [
      `<strong>Período mais forte:</strong> ${escapeHtml(bestPeriod)}, com ${formatCurrency(analytics.bestPeriod?.tax || 0)} de IRPJ + CSLL.`,
      `<strong>Maior impacto:</strong> ${escapeHtml(topCompany)}, com ${formatCurrency(topTax)} de imposto apurado.`,
      `<strong>Cobertura de movimento:</strong> ${formatPercent(movementRate)} das empresas desse regime têm valor salvo no painel tributário.`,
      `<strong>Status dominante:</strong> ${escapeHtml(statusLeader)}. Use isso para separar carteira ativa de bases que precisam revisão.`,
    ];

    return `<div class="tax-bi-diagnostic">${items
      .map((item) => `<div class="tax-bi-diagnostic__item">${item}</div>`)
      .join("")}</div>`;
  }

  function renderTaxBiPeriodTable(analytics) {
    return `
      <div class="table-shell">
        <table class="tax-bi-table">
          <thead>
            <tr>
              <th>${analytics.periodKind}</th>
              <th>Empresas</th>
              <th>Receita</th>
              <th>BC</th>
              <th>IRPJ</th>
              <th>CSLL</th>
              <th>Adicional</th>
              <th>Carga</th>
            </tr>
          </thead>
          <tbody>
            ${analytics.periods
              .map(
                (item) => `
                  <tr ${drillAttrs({
                    "analytics-drill": "tax-period",
                    "tax-panel": analytics.key,
                    "period-index": item.periodIndex,
                    "drill-title": item.label,
                  })}>
                    <td>${escapeHtml(item.label)}</td>
                    <td>${formatNumber(item.clients)}</td>
                    <td>${formatCurrency(item.revenue)}</td>
                    <td>${formatCurrency(item.base)}</td>
                    <td>${formatCurrency(item.ir)}</td>
                    <td>${formatCurrency(item.csll)}</td>
                    <td>${formatCurrency(item.additional)}</td>
                    <td>${formatPercent(item.effectiveRate)}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderSingleTaxBiPage(panelKey) {
    const config = getTaxBiConfigs()[panelKey];
    const panel = document.querySelector(`[data-tax-bi-panel="${panelKey}"]`);
    if (!config || !panel) return null;

    const analytics = buildTaxBiAnalytics(config);
    state.taxBiAnalytics[panelKey] = analytics;
    const movementRate = analytics.clients ? (analytics.movementClients / analytics.clients) * 100 : 0;
    const valueCards = `
      <div class="tax-bi-topic-grid tax-bi-topic-grid--four">
        ${renderTaxBiCard("Receita", formatCurrency(analytics.totals.revenue), `Ticket médio por empresa: ${formatCurrency(analytics.averageTicket)}.`, "", { "analytics-drill": "tax-panel", "tax-panel": panelKey, "tax-scope": "metric", "tax-metric": "revenue", "drill-title": "Receita" })}
        ${renderTaxBiCard("Base de cálculo", formatCurrency(analytics.totals.base), "Total usado para apuração no painel.", "", { "analytics-drill": "tax-panel", "tax-panel": panelKey, "tax-scope": "metric", "tax-metric": "base", "drill-title": "Base de cálculo" })}
        ${renderTaxBiCard("IRPJ + CSLL", formatCurrency(analytics.totals.tax), `Carga efetiva: ${formatPercent(analytics.effectiveRate)}.`, "", { "analytics-drill": "tax-panel", "tax-panel": panelKey, "tax-scope": "metric", "tax-metric": "tax", "drill-title": "IRPJ + CSLL" })}
        ${renderTaxBiCard("Retenções", formatCurrency(analytics.totals.retention), `Adicional: ${formatCurrency(analytics.totals.additional)}.`, "", { "analytics-drill": "tax-panel", "tax-panel": panelKey, "tax-scope": "metric", "tax-metric": "retention", "drill-title": "Retenções" })}
      </div>
      ${renderTaxBiValueList([
        ["IRPJ", formatCurrency(analytics.totals.ir)],
        ["CSLL", formatCurrency(analytics.totals.csll)],
        ["Adicional", formatCurrency(analytics.totals.additional)],
        ["Retenções", formatCurrency(analytics.totals.retention)],
      ])}
    `;

    panel.innerHTML = `
      <div class="tax-bi-topics">
        <section class="tax-bi-topic tax-bi-topic--hero">
          <div>
            <span class="tax-bi-topic__kicker">Panorama</span>
            <h3 class="tax-bi-topic__title">${escapeHtml(analytics.title)} conectado ao ${escapeHtml(analytics.tribMode)}</h3>
            <p class="tax-bi-topic__subtitle">
              Empresas vêm do ContFlow pela tributação ${escapeHtml(analytics.tribMode)}.
              Os valores vêm somente do painel tributário correspondente e cruzam por CNPJ/código.
            </p>
            <div class="tax-bi-topic-grid tax-bi-topic-grid--two">
              ${renderTaxBiCard("Empresas do regime", formatNumber(analytics.clients), `${formatNumber(analytics.activeClients)} ativa(s) e ${formatNumber(analytics.inactiveClients)} fora da operação.`, "tax-bi-card--compact", { "analytics-drill": "tax-panel", "tax-panel": panelKey, "tax-scope": "all", "drill-title": "Empresas do regime" })}
              ${renderTaxBiCard("Com movimento", formatNumber(analytics.movementClients), `${formatNumber(analytics.noMovementClients)} empresa(s) ainda sem valores salvos.`, "tax-bi-card--compact", { "analytics-drill": "tax-panel", "tax-panel": panelKey, "tax-scope": "movement", "drill-title": "Empresas com movimento" })}
            </div>
          </div>
          <article class="tax-bi-card tax-bi-card--accent" ${drillAttrs({
            "analytics-drill": "tax-panel",
            "tax-panel": panelKey,
            "tax-scope": "no-movement",
            "drill-title": "Empresas sem movimento no painel",
          })}>
            <span class="tax-bi-card__label">Cobertura do painel</span>
            <strong class="tax-bi-card__value">${formatPercent(movementRate)}</strong>
            <span class="tax-bi-card__hint">Quanto da carteira ${escapeHtml(analytics.tribMode)} já tem movimento tributário salvo.</span>
            ${renderTaxBiProgress("Empresas com movimento", analytics.movementClients, analytics.clients)}
          </article>
        </section>

        ${renderTaxBiTopic(
          "Tópico 1",
          "Valores principais",
          "Leitura financeira do regime: receita, base, imposto, retenções e carga efetiva.",
          valueCards
        )}

        <section class="tax-bi-topic tax-bi-topic--split">
          <div>
            <span class="tax-bi-topic__kicker">Tópico 2</span>
            <h3 class="tax-bi-topic__title">Empresas que puxam o resultado</h3>
            <p class="tax-bi-topic__subtitle">Ranking por imposto apurado e por receita, para entender concentração.</p>
            ${renderTaxBiRanking(analytics.topCompanies, "tax", panelKey)}
          </div>
          <div>
            <span class="tax-bi-topic__kicker">Tópico 3</span>
            <h3 class="tax-bi-topic__title">Carteira e responsáveis</h3>
            <p class="tax-bi-topic__subtitle">Distribuição operacional do mesmo grupo de empresas do regime.</p>
            ${renderTaxBiBars(analytics.respDist, "value", (value) => `${formatNumber(value)} empresa(s)`)}
          </div>
        </section>

        <section class="tax-bi-topic tax-bi-topic--split">
          <div>
            <span class="tax-bi-topic__kicker">Tópico 4</span>
            <h3 class="tax-bi-topic__title">Períodos</h3>
            <p class="tax-bi-topic__subtitle">Onde receita e imposto aparecem por ${escapeHtml(analytics.periodKind)}.</p>
            ${renderTaxBiBars(analytics.periods, "tax", formatCurrency, { drillType: "tax-period", panelKey })}
          </div>
          <div>
            <span class="tax-bi-topic__kicker">Tópico 5</span>
            <h3 class="tax-bi-topic__title">Receita por empresa</h3>
            <p class="tax-bi-topic__subtitle">Outra lente para ver quem mais movimenta o painel.</p>
            ${renderTaxBiRanking(analytics.topRevenueCompanies, "revenue", panelKey)}
          </div>
        </section>

        ${renderTaxBiTopic(
          "Tópico 6",
          "Tabela e diagnóstico",
          "Resumo detalhado por período mais os sinais de leitura automática.",
          `${renderTaxBiPeriodTable(analytics)}${renderTaxBiDiagnostics(analytics)}`
        )}
      </div>
    `;

    return analytics;
  }

  function renderTaxBiCompletePage(analyticsList) {
    const panel = document.querySelector('[data-tax-bi-panel="complete"]');
    if (!panel) return;

    const combined = analyticsList.reduce(
      (acc, item) => {
        acc.rows += item.movementRows.length;
        acc.revenue += item.totals.revenue;
        acc.base += item.totals.base;
        acc.ir += item.totals.ir;
        acc.csll += item.totals.csll;
        acc.tax += item.totals.tax;
        acc.additional += item.totals.additional;
        acc.retention += item.totals.retention;
        return acc;
      },
      { clients: 0, rows: 0, revenue: 0, base: 0, ir: 0, csll: 0, tax: 0, additional: 0, retention: 0 }
    );
    combined.clients = new Set(
      analyticsList.flatMap((item) => item.baseRows.map(getTaxCompanyKey))
    ).size;
    const effectiveRate = combined.revenue ? (combined.tax / combined.revenue) * 100 : 0;
    const panelBars = analyticsList.map((item) => ({
      panelKey: item.key,
      label: item.shortLabel,
      value: item.totals.tax,
      revenue: item.totals.revenue,
    }));

    panel.innerHTML = `
      <div class="tax-bi-topics">
        <section class="tax-bi-topic tax-bi-topic--hero">
          <div>
            <span class="tax-bi-topic__kicker">Completo</span>
            <h3 class="tax-bi-topic__title">Visão consolidada LP, LRT e LRA</h3>
            <p class="tax-bi-topic__subtitle">
              Esta tela soma os três regimes, mas cada bloco abaixo continua respeitando
              a tributação original do ContFlow.
            </p>
            <div class="tax-bi-topic-grid tax-bi-topic-grid--two">
              ${renderTaxBiCard("Empresas mapeadas", formatNumber(combined.clients), `${formatNumber(combined.rows)} linha(s) com movimento tributário.`, "tax-bi-card--compact", { "analytics-drill": "tax-complete", "tax-scope": "all", "drill-title": "Empresas mapeadas" })}
              ${renderTaxBiCard("Carga efetiva", formatPercent(effectiveRate), "IRPJ + CSLL sobre a receita consolidada.", "tax-bi-card--compact", { "analytics-drill": "tax-complete", "tax-scope": "metric", "tax-metric": "tax", "drill-title": "Carga efetiva consolidada" })}
            </div>
          </div>
          <article class="tax-bi-card tax-bi-card--accent" ${drillAttrs({ "analytics-drill": "tax-complete", "tax-scope": "metric", "tax-metric": "tax", "drill-title": "Total tributário" })}>
            <span class="tax-bi-card__label">Total tributário</span>
            <strong class="tax-bi-card__value">${formatCurrency(combined.tax)}</strong>
            <span class="tax-bi-card__hint">IRPJ + CSLL somados entre os regimes.</span>
            ${renderTaxBiValueList([
              ["Receita", formatCurrency(combined.revenue)],
              ["Base de cálculo", formatCurrency(combined.base)],
              ["Adicional", formatCurrency(combined.additional)],
              ["Retenções", formatCurrency(combined.retention)],
            ])}
          </article>
        </section>

        ${renderTaxBiTopic(
          "Tópico 1",
          "Comparativo por regime",
          "Resumo lado a lado para enxergar onde estão empresas, receita, imposto e carga.",
          `<section class="tax-bi-complete-cards">
            ${analyticsList
              .map(
                (item) => `
                  <article class="tax-bi-complete-card" ${drillAttrs({ "analytics-drill": "tax-panel", "tax-panel": item.key, "tax-scope": "all", "drill-title": item.title })}>
                    <h3>${escapeHtml(item.title)}</h3>
                    <dl>
                      <div><dt>Empresas</dt><dd>${formatNumber(item.clients)}</dd></div>
                      <div><dt>Com movimento</dt><dd>${formatNumber(item.movementClients)}</dd></div>
                      <div><dt>Receita</dt><dd>${formatCurrency(item.totals.revenue)}</dd></div>
                      <div><dt>IRPJ + CSLL</dt><dd>${formatCurrency(item.totals.tax)}</dd></div>
                      <div><dt>Carga</dt><dd>${formatPercent(item.effectiveRate)}</dd></div>
                    </dl>
                  </article>
                `
              )
              .join("")}
          </section>`
        )}

        <section class="tax-bi-topic tax-bi-topic--split">
          <div>
            <span class="tax-bi-topic__kicker">Tópico 2</span>
            <h3 class="tax-bi-topic__title">Imposto por regime</h3>
            <p class="tax-bi-topic__subtitle">Comparativo direto de IRPJ + CSLL entre LP, LRT e LRA.</p>
            ${renderTaxBiBars(panelBars, "value", formatCurrency, {
              getAttrs: (item) => ({
                "analytics-drill": "tax-panel",
                "tax-panel": item.panelKey,
                "tax-scope": "movement",
                "drill-title": `Imposto ${item.label}`,
              }),
            })}
          </div>
          <div>
            <span class="tax-bi-topic__kicker">Tópico 3</span>
            <h3 class="tax-bi-topic__title">Receita por regime</h3>
            <p class="tax-bi-topic__subtitle">Mostra qual aba concentra mais faturamento salvo.</p>
            ${renderTaxBiBars(panelBars, "revenue", formatCurrency, {
              getAttrs: (item) => ({
                "analytics-drill": "tax-panel",
                "tax-panel": item.panelKey,
                "tax-scope": "movement",
                "drill-title": `Receita ${item.label}`,
              }),
            })}
          </div>
        </section>

        ${renderTaxBiTopic(
          "Tópico 4",
          "Diagnóstico geral",
          "Sinais rápidos para saber se os painéis já estão alimentados da forma esperada.",
          `<div class="tax-bi-diagnostic">
            ${analyticsList
              .map((item) => {
                const rate = item.clients ? (item.movementClients / item.clients) * 100 : 0;
                return `<div class="tax-bi-diagnostic__item"><strong>${escapeHtml(item.shortLabel)}:</strong> ${formatNumber(item.clients)} empresa(s), ${formatNumber(item.movementClients)} com movimento (${formatPercent(rate)}), imposto total de ${formatCurrency(item.totals.tax)}.</div>`;
              })
              .join("")}
          </div>`
        )}
      </div>
    `;
  }

  function renderTaxBi() {
    const analyticsList = ["lp", "lrt", "lra"]
      .map((key) => renderSingleTaxBiPage(key))
      .filter(Boolean);
    renderTaxBiCompletePage(analyticsList);

    const updatedEl = document.getElementById("taxBiUpdatedAt");
    const savedDates = [
      state.painelTributario?.savedAt,
      state.painelTributarioLR?.savedAt,
      state.painelTributarioLRA?.savedAt,
    ].filter(Boolean);
    const latest = savedDates
      .map((value) => new Date(value))
      .filter((date) => !Number.isNaN(date.getTime()))
      .sort((a, b) => b - a)[0];
    if (updatedEl) {
      updatedEl.textContent = `BI tributário: ${latest ? formatDateTime(latest.toISOString()) : "sem salvamento ainda"}`;
    }
  }

  function renderTaxBiLoading() {
    document.querySelectorAll(".tax-bi-page").forEach((panel) => {
      panel.innerHTML = '<div class="empty-state">Carregando BI tributário...</div>';
    });
    const updatedEl = document.getElementById("taxBiUpdatedAt");
    if (updatedEl) updatedEl.textContent = "Atualizando BI tributário...";
  }

  function renderTaxBiError(message) {
    document.querySelectorAll(".tax-bi-page").forEach((panel) => {
      panel.innerHTML = `<div class="empty-state">${escapeHtml(message || "O BI tributário não pôde ser carregado.")}</div>`;
    });
    const updatedEl = document.getElementById("taxBiUpdatedAt");
    if (updatedEl) updatedEl.textContent = "Falha ao carregar BI tributário";
  }

  function bindTaxBiActions() {
    document.querySelectorAll("[data-tax-bi-page]").forEach((button) => {
      button.addEventListener("click", () => {
        const page = button.dataset.taxBiPage;
        document.querySelectorAll("[data-tax-bi-page]").forEach((item) => {
          item.classList.toggle("is-active", item === button);
        });
        document.querySelectorAll("[data-tax-bi-panel]").forEach((panel) => {
          panel.classList.toggle("is-active", panel.dataset.taxBiPanel === page);
        });
      });
    });

    const btnTaxRefresh = document.getElementById("btnTaxBiRefresh");
    btnTaxRefresh?.addEventListener("click", async () => {
      btnTaxRefresh.disabled = true;
      btnTaxRefresh.textContent = "Atualizando...";
      try {
        await loadAnalytics();
      } catch (err) {
        renderAnalyticsError(err);
      } finally {
        btnTaxRefresh.disabled = false;
        btnTaxRefresh.textContent = "Atualizar tributário";
      }
    });
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

  function drillAttrs(attrs = {}) {
    return Object.entries(attrs)
      .filter(([, value]) => value != null && value !== "")
      .map(([key, value]) => `data-${key}="${escapeHtml(value)}"`)
      .join(" ");
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
      .map((item) => {
        const attrs = typeof options.getAttrs === "function"
          ? drillAttrs(options.getAttrs(item))
          : options.drillType
            ? drillAttrs({
                "analytics-drill": options.drillType,
                "drill-field": options.drillField,
                "drill-value": item.label,
                "drill-title": options.drillTitle || item.label,
              })
            : "";
        return `
          <div class="bar-row" ${attrs}>
            <div class="bar-row__meta">
              <span class="bar-row__label">${escapeHtml(item.label)}</span>
              <span class="bar-row__value">${valueFormatter(item.value)}</span>
            </div>
            <div class="bar-row__track">
              <div class="bar-row__fill" style="width:${Math.max(6, (item.value / max) * 100)}%"></div>
            </div>
          </div>
        `;
      })
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
      const field =
        chartId === "tribDonutChart" ? "trib" : chartId === "statusDonutChart" ? "status" : "";
      const attrs = field
        ? drillAttrs({
            "analytics-drill": "distribution",
            "drill-field": field,
            "drill-value": item.label,
            "drill-title": item.label,
          })
        : "";

      legendHtml.push(`
        <div class="legend-item" ${attrs}>
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

  function renderOperationalRadarChart(analytics) {
    const svg = document.getElementById("operationalRadarChart");
    const summary = document.getElementById("operationalRadarSummary");
    if (!svg || !summary) return;

    const total = Math.max(analytics.totalRows || 0, 1);
    const groupFilled = analytics.coverage.find((item) => item.key === "grupo")?.filled || 0;
    const metrics = [
      {
        key: "active",
        label: "Ativos",
        value: analytics.activeRows,
        score: (analytics.activeRows / total) * 100,
        hint: "Carteira em operação hoje.",
      },
      {
        key: "resp1",
        label: "Resp.1",
        value: Math.max(analytics.totalRows - analytics.noResp1, 0),
        score: ((analytics.totalRows - analytics.noResp1) / total) * 100,
        hint: "Empresas com responsável primário.",
      },
      {
        key: "mit-ok",
        label: "MIT OK",
        value: Math.max(analytics.totalRows - analytics.mitPending, 0),
        score: ((analytics.totalRows - analytics.mitPending) / total) * 100,
        hint: "Sem sinal de pendência MIT.",
      },
      {
        key: "athenas-ok",
        label: "Athenas OK",
        value: Math.max(analytics.totalRows - analytics.inconsistencias, 0),
        score: ((analytics.totalRows - analytics.inconsistencias) / total) * 100,
        hint: "Sem inconsistência apontada.",
      },
      {
        key: "groups",
        label: "Grupos",
        value: groupFilled,
        score: (groupFilled / total) * 100,
        hint: "Empresas com grupo preenchido.",
      },
      {
        key: "no-disconnect",
        label: "Sem deslig.",
        value: Math.max(analytics.totalRows - analytics.desligamentos, 0),
        score: ((analytics.totalRows - analytics.desligamentos) / total) * 100,
        hint: "Linhas sem desligamento informado.",
      },
    ].map((item) => ({ ...item, score: Math.max(0, Math.min(item.score, 100)) }));

    const cx = 260;
    const cy = 130;
    const maxRadius = 86;
    const angleStep = (Math.PI * 2) / metrics.length;

    const pointFor = (index, score = 100) => {
      const angle = -Math.PI / 2 + index * angleStep;
      const radius = (Math.max(0, Math.min(score, 100)) / 100) * maxRadius;
      return {
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
      };
    };

    const grid = [25, 50, 75, 100]
      .map((score) => {
        const points = metrics.map((_, index) => pointFor(index, score));
        return `<polygon class="operational-radar__grid" points="${points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}"></polygon>`;
      })
      .join("");

    const axes = metrics
      .map((item, index) => {
        const end = pointFor(index, 100);
        const label = pointFor(index, 122);
        return `
          <line class="operational-radar__axis" x1="${cx}" y1="${cy}" x2="${end.x.toFixed(1)}" y2="${end.y.toFixed(1)}"></line>
          <text class="operational-radar__label" x="${label.x.toFixed(1)}" y="${label.y.toFixed(1)}" text-anchor="middle">${escapeHtml(item.label)}</text>
        `;
      })
      .join("");

    const shapePoints = metrics.map((item, index) => pointFor(index, item.score));
    const dots = metrics
      .map((item, index) => {
        const point = shapePoints[index];
        const attrs = drillAttrs({
          "analytics-drill": "radar",
          "drill-key": item.key,
          "drill-title": item.label,
        });
        return `
          <circle class="operational-radar__dot" ${attrs} cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="5"></circle>
          <text class="operational-radar__score" ${attrs} x="${point.x.toFixed(1)}" y="${(point.y - 10).toFixed(1)}" text-anchor="middle">${formatPercent(item.score, 0)}</text>
        `;
      })
      .join("");

    svg.innerHTML = `
      ${grid}
      ${axes}
      <polygon class="operational-radar__shape" points="${shapePoints.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}"></polygon>
      ${dots}
    `;

    summary.innerHTML = metrics
      .map(
        (item) => `
          <div class="operational-radar__item" ${drillAttrs({
            "analytics-drill": "radar",
            "drill-key": item.key,
            "drill-title": item.label,
          })}>
            <strong>${formatPercent(item.score, 0)}</strong>
            <span>${escapeHtml(item.label)}: ${formatNumber(item.value)} de ${formatNumber(analytics.totalRows)}. ${escapeHtml(item.hint)}</span>
          </div>
        `
      )
      .join("");
  }

  function renderGroupDynamicChart(items) {
    const svg = document.getElementById("groupDynamicChart");
    if (!svg) return;

    if (!items.length) {
      svg.innerHTML = '<text class="group-dynamic-chart__label" x="24" y="42">Sem grupos suficientes para montar o gráfico.</text>';
      return;
    }

    const topItems = items.slice(0, 8);
    const max = Math.max(...topItems.map((item) => item.value), 1);
    const rowHeight = 30;
    const top = 28;
    const labelWidth = 170;
    const chartWidth = 390;
    const height = top + topItems.length * rowHeight + 22;
    svg.setAttribute("viewBox", `0 0 620 ${height}`);

    const rows = topItems
      .map((item, index) => {
        const y = top + index * rowHeight;
        const width = Math.max(8, (item.value / max) * chartWidth);
        const label = String(item.label || "Não informado");
        const shortLabel = label.length > 24 ? `${label.slice(0, 24)}...` : label;
        const attrs = drillAttrs({
          "analytics-drill": "distribution",
          "drill-field": "grupo",
          "drill-value": label,
          "drill-title": `Grupo: ${label}`,
        });
        return `
          <line class="group-dynamic-chart__line" x1="${labelWidth}" y1="${y + 16}" x2="590" y2="${y + 16}"></line>
          <text class="group-dynamic-chart__label" ${attrs} x="18" y="${y + 20}">${escapeHtml(shortLabel)}</text>
          <rect class="group-dynamic-chart__track" x="${labelWidth}" y="${y + 5}" width="${chartWidth}" height="18" rx="9"></rect>
          <rect class="group-dynamic-chart__bar" ${attrs} x="${labelWidth}" y="${y + 5}" width="${width.toFixed(1)}" height="18" rx="9"></rect>
          <text class="group-dynamic-chart__value" ${attrs} x="${Math.min(labelWidth + width + 10, 570).toFixed(1)}" y="${y + 19}">${formatNumber(item.value)}</text>
        `;
      })
      .join("");

    svg.innerHTML = `
      <defs>
        <linearGradient id="groupGradient" x1="0%" x2="100%" y1="0%" y2="0%">
          <stop offset="0%" stop-color="#31c8ff"></stop>
          <stop offset="100%" stop-color="#4ecca3"></stop>
        </linearGradient>
      </defs>
      ${rows}
    `;
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
      <article class="quota-card" data-tone="ok" ${drillAttrs({ "analytics-drill": "quota", "quota-scope": "stage", "quota-stage": "quota1", "drill-title": "1ª quota entregue" })}>
        <div class="quota-card__label">1ª quota entregue</div>
        <div class="quota-card__value">${formatNumber(quota.quota1)}</div>
        <div class="quota-card__hint">Clientes com a primeira quota preenchida.</div>
      </article>
      <article class="quota-card" data-tone="ok" ${drillAttrs({ "analytics-drill": "quota", "quota-scope": "stage", "quota-stage": "quota2", "drill-title": "2ª quota entregue" })}>
        <div class="quota-card__label">2ª quota entregue</div>
        <div class="quota-card__value">${formatNumber(quota.quota2)}</div>
        <div class="quota-card__hint">Clientes com segunda quota registrada.</div>
      </article>
      <article class="quota-card" data-tone="ok" ${drillAttrs({ "analytics-drill": "quota", "quota-scope": "stage", "quota-stage": "quota3", "drill-title": "3ª quota entregue" })}>
        <div class="quota-card__label">3ª quota entregue</div>
        <div class="quota-card__value">${formatNumber(quota.quota3)}</div>
        <div class="quota-card__hint">Clientes com terceira quota concluída.</div>
      </article>
      <article class="quota-card" data-tone="ok" ${drillAttrs({ "analytics-drill": "quota", "quota-scope": "complete", "drill-title": "Ciclo esperado completo" })}>
        <div class="quota-card__label">Ciclo esperado completo</div>
        <div class="quota-card__value">${formatNumber(quota.clientsCompleteExpected)}</div>
        <div class="quota-card__hint">Clientes que entregaram tudo o que o campo Num Quotas pede.</div>
      </article>
      <article class="quota-card" data-tone="${coverageTone}" ${drillAttrs({ "analytics-drill": "quota", "quota-scope": "coverage", "drill-title": "Cobertura total de quotas" })}>
        <div class="quota-card__label">Cobertura total</div>
        <div class="quota-card__value">${formatPercent(quota.coverage)}</div>
        <div class="quota-card__hint">${formatNumber(quota.totalDelivered)} entregas registradas de um total esperado de ${formatNumber(quota.totalPossible)}.</div>
      </article>
      <article class="quota-card" data-tone="${pendingTone}" ${drillAttrs({ "analytics-drill": "quota", "quota-scope": "pending", "drill-title": "Pendência de ciclo" })}>
        <div class="quota-card__label">Pendência de ciclo</div>
        <div class="quota-card__value">${formatNumber(quota.clientsPendingExpected)}</div>
        <div class="quota-card__hint">Clientes que ainda não fecharam a quantidade esperada de quotas.</div>
      </article>
      <article class="quota-card" data-tone="${quota.missingNumQuotas ? "warn" : "ok"}" ${drillAttrs({ "analytics-drill": "quota", "quota-scope": "missing-num", "drill-title": "Sem Num Quotas" })}>
        <div class="quota-card__label">Sem Num Quotas</div>
        <div class="quota-card__value">${formatNumber(quota.missingNumQuotas)}</div>
        <div class="quota-card__hint">Linhas que ficaram sem quantidade declarada de quotas.</div>
      </article>
      <article class="quota-card" data-tone="${quota.sequenceIssues ? "danger" : "ok"}" ${drillAttrs({ "analytics-drill": "quota", "quota-scope": "sequence", "drill-title": "Sequência inconsistente" })}>
        <div class="quota-card__label">Sequência inconsistente</div>
        <div class="quota-card__value">${formatNumber(quota.sequenceIssues)}</div>
        <div class="quota-card__hint">Há 2ª/3ª quota sem a etapa anterior preenchida.</div>
      </article>
      <article class="quota-card" data-tone="${quota.invalidDateRows ? "warn" : "ok"}" ${drillAttrs({ "analytics-drill": "quota", "quota-scope": "invalid-date", "drill-title": "Datas inválidas" })}>
        <div class="quota-card__label">Datas inválidas</div>
        <div class="quota-card__value">${formatNumber(quota.invalidDateRows)}</div>
        <div class="quota-card__hint">Campos de quota preenchidos, mas com data fora do padrão reconhecido.</div>
      </article>
      <article class="quota-card" data-tone="${quota.dispensadas ? "warn" : "ok"}" ${drillAttrs({ "analytics-drill": "quota", "quota-scope": "dispensada", "drill-title": "Quotas dispensadas" })}>
        <div class="quota-card__label">Dispensadas</div>
        <div class="quota-card__value">${formatNumber(quota.dispensadas)}</div>
        <div class="quota-card__hint">Quantidade de quotas marcadas como dispensadas.</div>
      </article>
      <article class="quota-card" data-tone="${quota.semMovimento ? "warn" : "ok"}" ${drillAttrs({ "analytics-drill": "quota", "quota-scope": "sem-movimento", "drill-title": "Quotas S/M" })}>
        <div class="quota-card__label">S/M</div>
        <div class="quota-card__value">${formatNumber(quota.semMovimento)}</div>
        <div class="quota-card__hint">Quantidade de quotas marcadas como sem movimento.</div>
      </article>
      <article class="quota-card" data-tone="${quota.withActor ? "ok" : "warn"}" ${drillAttrs({ "analytics-drill": "quota", "quota-scope": "with-actor", "drill-title": "Com autor identificado" })}>
        <div class="quota-card__label">Com autor identificado</div>
        <div class="quota-card__value">${formatNumber(quota.withActor)}</div>
        <div class="quota-card__hint">Linhas de quota em que foi possível identificar quem fez.</div>
      </article>
    `;

    renderBarList("quotaTimeline", quota.timeline, {
      getAttrs: (item) => ({
        "analytics-drill": "quota",
        "quota-scope": "timeline",
        "quota-period": item.key,
        "drill-title": `Quotas em ${item.label}`,
      }),
    });
  }

  function renderQuotaStageCoverage(analytics) {
    const target = document.getElementById("quotaStageCoverage");
    if (!target) return;
    const items = (analytics.quotaAnalytics.stageCoverage || []).map((item) => ({
      label: `${item.label} · ${formatNumber(item.filled)}/${formatNumber(item.expectedRows)}`,
      value: item.rate,
      stage: item.id,
    }));
    renderBarList("quotaStageCoverage", items, {
      valueFormatter: (value) => formatPercent(value),
      getAttrs: (item) => ({
        "analytics-drill": "quota",
        "quota-scope": "stage-expected",
        "quota-stage": item.stage,
        "drill-title": item.label,
      }),
    });
  }

  function renderQuotaExpectedDistribution(analytics) {
    renderBarList("quotaExpectedDistribution", analytics.quotaAnalytics.expectedDistribution || [], {
      getAttrs: (item) => ({
        "analytics-drill": "quota",
        "quota-scope": "expected",
        "quota-value": item.label,
        "drill-title": item.label,
      }),
    });
  }

  function renderQuotaPendingByResp(analytics) {
    renderBarList("quotaPendingByResp", analytics.quotaAnalytics.pendingByResp || [], {
      getAttrs: (item) => ({
        "analytics-drill": "quota",
        "quota-scope": "pending-resp",
        "quota-value": item.label,
        "drill-title": `Pendências de ${item.label}`,
      }),
    });
  }

  function renderQuotaActors(analytics) {
    renderBarList("quotaActorDistribution", analytics.quotaAnalytics.actorDistribution || [], {
      getAttrs: (item) => ({
        "analytics-drill": "quota",
        "quota-scope": "actor",
        "quota-value": item.label,
        "drill-title": `Quotas feitas por ${item.label}`,
      }),
    });
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
                  <div class="bar-row" ${drillAttrs({
                    "analytics-drill": "quota",
                    "quota-scope": "timeline",
                    "quota-stage": group.id,
                    "quota-period": item.key,
                    "drill-title": `${group.label} · ${item.label}`,
                  })}>
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
        <article class="summary-kpi" ${drillAttrs({ "analytics-drill": "month", "month-scope": "all", "drill-title": "Faturamento anual PT" })}>
          <span class="summary-kpi__label">Faturamento anual PT</span>
          <strong class="summary-kpi__value">${formatCurrency(time.annualRevenue)}</strong>
          <span class="summary-kpi__hint">Soma dos 12 meses do Painel Tributário.</span>
        </article>
        <article class="summary-kpi" ${drillAttrs({ "analytics-drill": "month", "month-scope": "all", "drill-title": "Média mensal" })}>
          <span class="summary-kpi__label">Média mensal</span>
          <strong class="summary-kpi__value">${formatCurrency(time.averageMonthlyRevenue)}</strong>
          <span class="summary-kpi__hint">Média mensal consolidada no ano.</span>
        </article>
        <article class="summary-kpi" ${drillAttrs({
          "analytics-drill": "month",
          "month-scope": "single",
          "quarter-index": time.bestMonth?.quarterIndex ?? "",
          "month-offset": time.bestMonth?.monthOffset ?? "",
          "drill-title": time.bestMonth ? `Maior mês: ${time.bestMonth.label}` : "Maior mês",
        })}>
          <span class="summary-kpi__label">Maior mês</span>
          <strong class="summary-kpi__value">${time.bestMonth ? escapeHtml(time.bestMonth.label) : "--"}</strong>
          <span class="summary-kpi__hint">${time.bestMonth ? formatCurrency(time.bestMonth.value) : "Sem dados mensais."}</span>
        </article>
        <article class="summary-kpi" ${drillAttrs({
          "analytics-drill": "quarter",
          "quarter-index": time.bestQuarter?.quarterIndex ?? "",
          "drill-title": time.bestQuarter ? `Maior trimestre: ${time.bestQuarter.label}` : "Maior trimestre",
        })}>
          <span class="summary-kpi__label">Maior trimestre</span>
          <strong class="summary-kpi__value">${time.bestQuarter ? escapeHtml(time.bestQuarter.label) : "--"}</strong>
          <span class="summary-kpi__hint">${time.bestQuarter ? formatCurrency(time.bestQuarter.ptRevenue) : "Sem dados trimestrais."}</span>
        </article>
      `;
    }

    renderBarList("monthlyRevenueBars", analytics.timeAnalytics.monthlyRevenue, {
      valueFormatter: formatCurrency,
      getAttrs: (item) => ({
        "analytics-drill": "month",
        "month-scope": "single",
        "quarter-index": item.quarterIndex,
        "month-offset": item.monthOffset,
        "drill-title": item.label,
      }),
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
          <tr data-analytics-drill="quarter" data-quarter-index="${item.quarterIndex}" data-drill-title="${escapeHtml(item.label)}">
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
          <article class="source-check ${item.active ? "source-check--active" : ""}" ${drillAttrs({
            "analytics-drill": "source",
            "source-key": item.key,
            "drill-title": item.label,
          })}>
            <div class="source-check__head">
              <strong>${escapeHtml(item.active ? `${item.label} • usado no BI` : item.label)}</strong>
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
        <tr data-analytics-drill="row" data-row-id="${escapeHtml(row.__rowId)}" data-row-code="${escapeHtml(row.cod)}" data-drill-title="${escapeHtml(row.razao_social || row.cod || "Empresa")}">
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
        <tr data-analytics-drill="coverage-empty" data-drill-field="${escapeHtml(item.key)}" data-drill-title="Campo vazio: ${escapeHtml(item.label)}">
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
      .map((point) => `<circle class="activity-chart__dot" ${drillAttrs({
        "analytics-drill": "activity",
        "activity-date": point.key,
        "drill-title": `Atividade em ${point.label}`,
      })} cx="${point.x}" cy="${point.y}" r="4"></circle>`)
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
      <div class="activity-summary__card" ${drillAttrs({ "analytics-drill": "activity", "activity-scope": "all", "drill-title": "Alterações no período" })}>
        <div class="activity-summary__label">Alterações no período</div>
        <div class="activity-summary__value">${formatNumber(total)}</div>
      </div>
      <div class="activity-summary__card" ${drillAttrs({
        "analytics-drill": "activity",
        "activity-date": series.find((item) => item.value === max)?.key || "",
        "drill-title": "Pico diário",
      })}>
        <div class="activity-summary__label">Pico diário</div>
        <div class="activity-summary__value">${formatNumber(max)}</div>
      </div>
      <div class="activity-summary__card" ${drillAttrs({ "analytics-drill": "activity", "activity-scope": "active", "drill-title": "Dias com movimento" })}>
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

  function renderAnalytics() {
    const analytics = computeAnalytics(state.contFlow, {
      contFlowSheets: state.contFlowSheets,
      painelTributario: state.painelTributario,
      painelTributarioLR: state.painelTributarioLR,
    });
    state.lastAnalytics = analytics;
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
    renderBarList("tribDistribution", analytics.triDist, { drillType: "distribution", drillField: "trib", drillTitle: "Tributação" });
    renderBarList("statusDistribution", analytics.statusDist, { drillType: "distribution", drillField: "status", drillTitle: "Status" });
    renderBarList("responsavelDistribution", analytics.respDist, { drillType: "distribution", drillField: "resp1", drillTitle: "Resp.1" });
    renderBarList("resp2Distribution", analytics.resp2Dist, { drillType: "distribution", drillField: "resp2", drillTitle: "Resp.2" });
    renderBarList("grupoDistribution", analytics.grupoDist, { drillType: "distribution", drillField: "grupo", drillTitle: "Grupo" });
    renderOperationalRadarChart(analytics);
    renderGroupDynamicChart(analytics.grupoDist);
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
    renderTaxBi();

    if (updatedEl) {
      updatedEl.textContent = `Última leitura: ${formatDateTime(state.contFlow.savedAt || new Date().toISOString())}`;
    }
    if (sourceChip) {
      const activeSource = state.contFlow.__sourceLabel || "ContFlow mais atualizado";
      sourceChip.textContent = `Fonte: ${activeSource} + LP + LRT + LRA • ${formatNumber(analytics.totalRows)} cliente(s)`;
    }
  }

  function renderLoadingState() {
    const updatedEl = document.getElementById("analyticsUpdatedAt");
    const sourceChip = document.getElementById("analyticsSourceChip");
    const insights = document.getElementById("analyticsInsights");
    const auditRows = document.getElementById("analyticsAuditRows");

    if (updatedEl) updatedEl.textContent = "Atualizando indicadores e auditoria...";
    if (sourceChip) sourceChip.textContent = "Fonte: ContFlow";
    renderTaxBiLoading();
    if (insights) insights.innerHTML = '<div class="empty-state">Carregando leitura gerencial da base...</div>';
    if (auditRows) {
      auditRows.innerHTML = '<tr><td colspan="6"><div class="empty-state">Montando auditoria por coluna...</div></td></tr>';
    }
    renderBarList("monthlyRevenueBars", []);
    renderSourceChecks([]);
    renderOperationalRadarChart({
      totalRows: 0,
      activeRows: 0,
      noResp1: 0,
      mitPending: 0,
      inconsistencias: 0,
      desligamentos: 0,
      coverage: [],
    });
    renderGroupDynamicChart([]);
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
    if (quotaMetrics) {
      quotaMetrics.innerHTML = '<div class="empty-state">As métricas de quotas não puderam ser calculadas.</div>';
    }

    renderBarList("tribDistribution", []);
    renderBarList("statusDistribution", []);
    renderBarList("responsavelDistribution", []);
    renderBarList("resp2Distribution", []);
    renderBarList("grupoDistribution", []);
    renderOperationalRadarChart({
      totalRows: 0,
      activeRows: 0,
      noResp1: 0,
      mitPending: 0,
      inconsistencias: 0,
      desligamentos: 0,
      coverage: [],
    });
    renderGroupDynamicChart([]);
    renderBarList("quotaTimeline", []);
    renderBarList("quotaStageCoverage", []);
    renderBarList("quotaExpectedDistribution", []);
    renderBarList("quotaPendingByResp", []);
    renderBarList("quotaActorDistribution", []);
    renderBarList("monthlyRevenueBars", []);
    renderSourceChecks([]);
    renderTaxBiError(err?.message);
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
      { key: "ptlra", url: API_PAINEL_TRIBUTARIO_LRA, extractor: extractSheetDataset },
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
    state.contFlow = getLatestContFlowDataset(state.contFlowSheets);
    state.contFlowCompanyMap = buildContFlowCompanyMap(getValidContFlowRows(state.contFlow));
    state.painelTributario = datasets.pt || EMPTY_DATASET;
    state.painelTributarioLR = datasets.ptlr || EMPTY_DATASET;
    state.painelTributarioLRA = datasets.ptlra || EMPTY_DATASET;
    state.sourceChecks = buildSourceChecks(
      state.contFlowSheets,
      state.painelTributario,
      state.painelTributarioLR,
      state.painelTributarioLRA
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

  function getDetailRowsBase() {
    return getValidContFlowRows(state.contFlow);
  }

  function getDisplayLabel(value) {
    return String(value || "").trim() || "Não informado";
  }

  function getQuotaRowInfo(row) {
    const expectedInfo = getExpectedQuotaInfo(row);
    const entries = [parseQuotaEntry(row.quota1), parseQuotaEntry(row.quota2), parseQuotaEntry(row.quota3)];
    const delivered = entries.filter((entry) => entry.isFilled).length;
    const deliveredExpected = Math.min(delivered, expectedInfo.expected);
    const pendingExpected = Math.max(expectedInfo.expected - deliveredExpected, 0);
    const hasSequenceIssue = (entries[1].isFilled && !entries[0].isFilled) || (entries[2].isFilled && !entries[1].isFilled);
    const invalidDates = entries.filter((entry) => entry.isInvalidDate).length;
    return {
      expectedInfo,
      entries,
      delivered,
      pendingExpected,
      completeExpected: pendingExpected === 0 && !hasSequenceIssue,
      hasSequenceIssue,
      invalidDates,
      actors: entries.map((entry) => entry.actor).filter(Boolean),
    };
  }

  function quotaEntryPeriodKey(entry) {
    if (!entry?.date) return "";
    return `${entry.date.getFullYear()}-${String(entry.date.getMonth() + 1).padStart(2, "0")}`;
  }

  function rowsByDistribution(field, value) {
    const target = getDisplayLabel(value);
    return getDetailRowsBase().filter((row) => getDisplayLabel(row?.[field]) === target);
  }

  function rowsByQuota(scope, { stage = "", value = "", period = "" } = {}) {
    const rows = getDetailRowsBase();
    const stageIndex = { quota1: 0, quota2: 1, quota3: 2 }[stage];
    return rows.filter((row) => {
      const info = getQuotaRowInfo(row);
      const entry = Number.isInteger(stageIndex) ? info.entries[stageIndex] : null;
      switch (scope) {
        case "stage":
          return Boolean(entry?.isFilled);
        case "stage-expected":
          return Number.isInteger(stageIndex) && getExpectedQuotaInfo(row).expected >= stageIndex + 1;
        case "complete":
          return info.completeExpected;
        case "coverage":
          return info.delivered > 0;
        case "pending":
          return info.pendingExpected > 0 || info.hasSequenceIssue;
        case "missing-num":
          return info.expectedInfo.isMissing;
        case "sequence":
          return info.hasSequenceIssue;
        case "invalid-date":
          return info.invalidDates > 0;
        case "dispensada":
          return info.entries.some((item) => item.isDispensada);
        case "sem-movimento":
          return info.entries.some((item) => item.isSemMovimento);
        case "with-actor":
          return info.actors.length > 0;
        case "expected": {
          const label = info.expectedInfo.isMissing
            ? "Sem Num Quotas"
            : info.expectedInfo.isInvalid
              ? "Num Quotas inválido"
              : `${info.expectedInfo.expected} ${info.expectedInfo.expected === 1 ? "quota" : "quotas"}`;
          return label === value;
        }
        case "pending-resp":
          return (info.pendingExpected > 0 || info.hasSequenceIssue) && getDisplayLabel(row.resp1) === value;
        case "actor":
          return info.actors.some((actor) => actor === value);
        case "timeline":
          return info.entries.some((item, index) =>
            (!stage || index === stageIndex) && quotaEntryPeriodKey(item) === period
          );
        default:
          return rows;
      }
    });
  }

  function rowsByRadarKey(key) {
    const rows = getDetailRowsBase();
    switch (key) {
      case "all":
        return rows;
      case "active":
        return rows.filter(inferActiveStatus);
      case "no-resp1":
        return rows.filter((row) => !isFilled(row.resp1));
      case "resp1":
        return rows.filter((row) => isFilled(row.resp1));
      case "mit-pending":
        return rows.filter(isMitPending);
      case "mit-ok":
        return rows.filter((row) => !isMitPending(row));
      case "athenas":
        return rows.filter((row) => isFilled(row.inconsistencia_athenas));
      case "athenas-ok":
        return rows.filter((row) => !isFilled(row.inconsistencia_athenas));
      case "groups":
        return rows.filter((row) => isFilled(row.grupo));
      case "disconnect":
        return rows.filter((row) => isFilled(row.desligamento));
      case "no-disconnect":
        return rows.filter((row) => !isFilled(row.desligamento));
      default:
        return rows;
    }
  }

  function rowsByQuarterIndex(quarterIndex) {
    const index = Number(quarterIndex || 0);
    return getValidContFlowRows(state.contFlowSheets?.[index] || EMPTY_DATASET);
  }

  function rowsBySingleRow(rowId, rowCode) {
    const target = String(rowId || "");
    const code = String(rowCode || "");
    return getDetailRowsBase().filter((row) =>
      (target && String(row.__rowId || "") === target) || (code && String(row.cod || "") === code)
    );
  }

  function rowsByEmptyCoverageField(field) {
    const key = String(field || "").trim();
    if (!key) return [];
    return getDetailRowsBase().filter((row) => !isFilled(row[key]));
  }

  function rowsBySourceKey(sourceKey) {
    const key = String(sourceKey || "");
    if (key.startsWith("contflow-")) {
      const index = Number(key.replace("contflow-", ""));
      return getValidContFlowRows(state.contFlowSheets?.[index] || EMPTY_DATASET);
    }
    if (key === "pt") return state.painelTributario?.rows || [];
    if (key === "ptlr") return state.painelTributarioLR?.rows || [];
    if (key === "ptlra") return state.painelTributarioLRA?.rows || [];
    return [];
  }

  function rowsByMonthRevenue(scope, quarterIndex, monthOffset) {
    const allRows = state.painelTributario?.rows || [];
    if (scope === "all") {
      return decorateTaxRows(
        allRows.filter((row) => [1, 2, 3].some((month) => sumPainelTributarioMonth(row, month) !== 0)),
        "lp"
      );
    }

    const qIndex = Number(quarterIndex || 0);
    const month = Number(monthOffset || 1);
    return decorateTaxRows(
      allRows.filter((row) => {
        if (getQuarterIndexFromRow(row) !== qIndex) return false;
        return sumPainelTributarioMonth(row, month) !== 0;
      }),
      "lp"
    );
  }

  function rowsByActivity(dateKey = "", scope = "") {
    const cells = state.contFlow?.cells || [];
    const validDates = new Set();
    const rowIds = new Set();
    cells.forEach((cell) => {
      if (!cell.updatedAt) return;
      const dt = new Date(cell.updatedAt);
      if (Number.isNaN(dt.getTime())) return;
      const key = dt.toISOString().slice(0, 10);
      if (scope === "active") {
        validDates.add(key);
      } else if (scope === "all" || key === dateKey) {
        rowIds.add(Number(cell.rowId));
      }
    });
    if (scope === "active") {
      cells.forEach((cell) => {
        if (!cell.updatedAt) return;
        const dt = new Date(cell.updatedAt);
        if (Number.isNaN(dt.getTime())) return;
        const key = dt.toISOString().slice(0, 10);
        if (validDates.has(key)) rowIds.add(Number(cell.rowId));
      });
    }
    return getDetailRowsBase().filter((row) => rowIds.has(Number(row.__rowId)));
  }

  function filterTaxRowsByMetric(rows, analytics, metric = "") {
    if (!metric) return rows;
    return rows.filter((row) => {
      if (metric === "revenue") return analytics.revenue(row) !== 0;
      if (metric === "base") return toNumberBR(row?.[analytics.baseKey]) !== 0;
      if (metric === "tax") {
        return toNumberBR(row?.[analytics.irKey]) + toNumberBR(row?.[analytics.csllKey]) !== 0;
      }
      if (metric === "retention") return sumTaxRetention(row, analytics) !== 0;
      if (metric === "additional") return toNumberBR(row?.[analytics.additionalKey]) !== 0;
      return true;
    });
  }

  function decorateTaxRows(rows, panelKey) {
    return (rows || []).map((row) => ({
      ...row,
      __detailPanelKey: panelKey,
      __contFlowRow: getCurrentContFlowCompany(row),
    }));
  }

  function getTaxCompleteRows(scope = "movement", metric = "") {
    const panels = Object.values(state.taxBiAnalytics || {});
    const rows = panels.flatMap((analytics) => {
      const sourceRows = scope === "all" ? analytics.baseRows || [] : analytics.movementRows || [];
      const filteredRows = scope === "metric" ? filterTaxRowsByMetric(sourceRows, analytics, metric) : sourceRows;
      return decorateTaxRows(filteredRows, analytics.key);
    });
    const seen = new Set();
    return rows.filter((row) => {
      const key = `${getTaxCompanyKey(row)}::${row.__rowId || ""}::${row.sheet_index ?? row.sheetIndex ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function getTaxDetailRows(panelKey, scope = "all", metric = "") {
    const analytics = state.taxBiAnalytics?.[panelKey];
    if (!analytics) return [];
    if (scope === "metric") return decorateTaxRows(filterTaxRowsByMetric(analytics.movementRows || [], analytics, metric), panelKey);
    if (scope === "movement") return decorateTaxRows(analytics.movementRows || [], panelKey);
    if (scope === "no-movement") {
      const movementKeys = new Set((analytics.movementRows || []).map(getTaxCompanyKey));
      return (analytics.baseRows || []).filter((row) => !movementKeys.has(getTaxCompanyKey(row)));
    }
    return analytics.baseRows || [];
  }

  function getTaxPeriodRows(panelKey, periodIndex) {
    const analytics = state.taxBiAnalytics?.[panelKey];
    if (!analytics) return [];
    const index = Number(periodIndex || 0);
    return decorateTaxRows(
      (analytics.rows || []).filter((row) => getTaxPeriodIndex(row, analytics.periodLabels.length) === index),
      panelKey
    );
  }

  function getTaxCompanyRows(panelKey, companyKey) {
    const analytics = state.taxBiAnalytics?.[panelKey];
    if (!analytics) return [];
    return decorateTaxRows((analytics.rows || []).filter((row) => getTaxCompanyKey(row) === companyKey), panelKey);
  }

  function renderDetailKpis(items) {
    return `<div class="analytics-detail-kpis">${items
      .map(
        ([label, value]) => `
          <div class="analytics-detail-kpi">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(value)}</strong>
          </div>
        `
      )
      .join("")}</div>`;
  }

  function getTaxDetailConfig(row, options = {}) {
    const key = options.panelKey || row.__detailPanelKey || "lp";
    return state.taxBiAnalytics?.[key] || getTaxBiConfigs()[key] || state.taxBiAnalytics?.lp || getTaxBiConfigs().lp;
  }

  function getTaxDetailPeriod(row, config) {
    const index = getTaxPeriodIndex(row, config.periodLabels.length);
    return config.periodLabels[index] || "-";
  }

  function taxDetailMoney(row, options = {}) {
    const config = getTaxDetailConfig(row, options);
    return {
      config,
      revenue: config.revenue(row),
      base: toNumberBR(row?.[config.baseKey]),
      ir: toNumberBR(row?.[config.irKey]),
      csll: toNumberBR(row?.[config.csllKey]),
      additional: toNumberBR(row?.[config.additionalKey]),
      retention: sumTaxRetention(row, config),
    };
  }

  function renderContFlowDetailTable(rows, options = {}) {
    if (!rows.length) {
      return '<div class="empty-state">Nenhum registro encontrado para este clique.</div>';
    }

    const extraColumn = options.focus || "";
    const extraHeader =
      extraColumn === "mit"
        ? "<th>MIT / Controle</th>"
        : extraColumn === "athenas"
          ? "<th>Inconsistência</th>"
          : extraColumn === "disconnect"
            ? "<th>Desligamento</th>"
            : "";
    const extraCell = (row) => {
      if (extraColumn === "mit") return `<td>${escapeHtml(row.mit || row.controle_mit || "-")}</td>`;
      if (extraColumn === "athenas") return `<td>${escapeHtml(row.inconsistencia_athenas || "-")}</td>`;
      if (extraColumn === "disconnect") return `<td>${escapeHtml(row.desligamento || "-")}</td>`;
      return "";
    };

    return `
      <div class="table-shell">
        <table class="analytics-detail-table">
          <thead>
            <tr>
              <th>Cód.</th>
              <th>Razão social</th>
              <th>Trib.</th>
              <th>Status</th>
              <th>Resp.1</th>
              <th>Grupo</th>
              ${extraHeader}
            </tr>
          </thead>
          <tbody>
            ${rows
              .slice(0, 160)
              .map((row) => {
                return `
                  <tr>
                    <td>${escapeHtml(row.cod || "-")}</td>
                    <td>${escapeHtml(row.razao_social || row.cnpj_cpf || "Sem razão social")}</td>
                    <td>${escapeHtml(row.trib || "-")}</td>
                    <td>${escapeHtml(row.status || "-")}</td>
                    <td>${escapeHtml(row.resp1 || "-")}</td>
                    <td>${escapeHtml(row.grupo || "-")}</td>
                    ${extraCell(row)}
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderQuotaDetailTable(rows) {
    if (!rows.length) {
      return '<div class="empty-state">Nenhum registro encontrado para este clique.</div>';
    }

    return `
      <div class="table-shell">
        <table class="analytics-detail-table">
          <thead>
            <tr>
              <th>Cód.</th>
              <th>Razão social</th>
              <th>Resp.1</th>
              <th>Num Quotas</th>
              <th>Entregues</th>
              <th>Pendentes</th>
              <th>1ª quota</th>
              <th>2ª quota</th>
              <th>3ª quota</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .slice(0, 160)
              .map((row) => {
                const info = getQuotaRowInfo(row);
                return `
                  <tr>
                    <td>${escapeHtml(row.cod || "-")}</td>
                    <td>${escapeHtml(row.razao_social || "Sem razão social")}</td>
                    <td>${escapeHtml(row.resp1 || "-")}</td>
                    <td>${escapeHtml(info.expectedInfo.raw || String(info.expectedInfo.expected))}</td>
                    <td>${formatNumber(info.delivered)}</td>
                    <td>${formatNumber(info.pendingExpected)}</td>
                    <td>${escapeHtml(row.quota1 || "-")}</td>
                    <td>${escapeHtml(row.quota2 || "-")}</td>
                    <td>${escapeHtml(row.quota3 || "-")}</td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderTaxDetailTable(rows, options = {}) {
    if (!rows.length) {
      return '<div class="empty-state">Nenhum registro encontrado para este clique.</div>';
    }

    const metric = options.metric || "";
    const metricHeaders =
      metric === "revenue"
        ? "<th>Receita</th>"
        : metric === "base"
          ? "<th>BC</th>"
          : metric === "tax"
            ? "<th>IRPJ</th><th>CSLL</th><th>IRPJ + CSLL</th>"
            : metric === "retention"
              ? "<th>Retenções</th>"
              : "<th>Receita</th><th>BC</th><th>IRPJ + CSLL</th>";

    const metricCells = (row) => {
      const money = taxDetailMoney(row, options);
      if (metric === "revenue") return `<td>${formatCurrency(money.revenue)}</td>`;
      if (metric === "base") return `<td>${formatCurrency(money.base)}</td>`;
      if (metric === "tax") return `<td>${formatCurrency(money.ir)}</td><td>${formatCurrency(money.csll)}</td><td>${formatCurrency(money.ir + money.csll)}</td>`;
      if (metric === "retention") return `<td>${formatCurrency(money.retention)}</td>`;
      return `<td>${formatCurrency(money.revenue)}</td><td>${formatCurrency(money.base)}</td><td>${formatCurrency(money.ir + money.csll)}</td>`;
    };

    return `
      <div class="table-shell">
        <table class="analytics-detail-table">
          <thead>
            <tr>
              <th>Cód.</th>
              <th>Razão social</th>
              <th>Painel</th>
              <th>Período</th>
              ${metricHeaders}
            </tr>
          </thead>
          <tbody>
            ${rows
              .slice(0, 160)
              .map((row) => {
                const config = getTaxDetailConfig(row, options);
                const current = row.__contFlowRow || getCurrentContFlowCompany(row) || row;
                return `
                  <tr>
                    <td>${escapeHtml(current.cod || row.cod || "-")}</td>
                    <td>${escapeHtml(current.razao_social || row.razao_social || row.cnpj_cpf || "Sem razão social")}</td>
                    <td>${escapeHtml(config.shortLabel || config.title || "-")}</td>
                    <td>${escapeHtml(getTaxDetailPeriod(row, config))}</td>
                    ${metricCells(row)}
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderMonthDetailTable(rows, options = {}) {
    if (!rows.length) {
      return '<div class="empty-state">Nenhum registro encontrado para este clique.</div>';
    }

    const month = Number(options.monthOffset || 0);
    return `
      <div class="table-shell">
        <table class="analytics-detail-table">
          <thead>
            <tr>
              <th>Cód.</th>
              <th>Razão social</th>
              <th>Período</th>
              <th>Receita do botão</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .slice(0, 160)
              .map((row) => {
                const period = QUARTER_LABELS[getQuarterIndexFromRow(row)] || "-";
                const value = month
                  ? sumPainelTributarioMonth(row, month)
                  : [1, 2, 3].reduce((sum, item) => sum + sumPainelTributarioMonth(row, item), 0);
                const current = row.__contFlowRow || getCurrentContFlowCompany(row) || row;
                return `
                  <tr>
                    <td>${escapeHtml(current.cod || row.cod || "-")}</td>
                    <td>${escapeHtml(current.razao_social || row.razao_social || row.cnpj_cpf || "Sem razão social")}</td>
                    <td>${escapeHtml(period)}</td>
                    <td>${formatCurrency(value)}</td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderDetailTable(rows, options = {}) {
    if (options.mode === "quota") return renderQuotaDetailTable(rows);
    if (options.mode === "tax") return renderTaxDetailTable(rows, options);
    if (options.mode === "month") return renderMonthDetailTable(rows, options);
    return renderContFlowDetailTable(rows, options);
  }

  function openAnalyticsDetail(title, subtitle, rows, options = {}) {
    const panel = document.getElementById("analyticsDetailPanel");
    const backdrop = document.getElementById("analyticsDetailBackdrop");
    const titleEl = document.getElementById("analyticsDetailTitle");
    const subtitleEl = document.getElementById("analyticsDetailSubtitle");
    const body = document.getElementById("analyticsDetailBody");
    if (!panel || !backdrop || !titleEl || !subtitleEl || !body) return;

    const mode = options.mode || "contflow";
    const kpis = (() => {
      if (mode === "quota") {
        const delivered = rows.reduce((sum, row) => sum + getQuotaRowInfo(row).delivered, 0);
        const pending = rows.reduce((sum, row) => sum + getQuotaRowInfo(row).pendingExpected, 0);
        return [["Empresas", formatNumber(rows.length)], ["Entregues", formatNumber(delivered)], ["Pendentes", formatNumber(pending)]];
      }
      if (mode === "tax") {
        const totals = rows.reduce(
          (acc, row) => {
            const money = taxDetailMoney(row, options);
            acc.revenue += money.revenue;
            acc.base += money.base;
            acc.ir += money.ir;
            acc.csll += money.csll;
            acc.retention += money.retention;
            return acc;
          },
          { revenue: 0, base: 0, ir: 0, csll: 0, retention: 0 }
        );
        if (options.metric === "revenue") return [["Registros", formatNumber(rows.length)], ["Receita", formatCurrency(totals.revenue)]];
        if (options.metric === "base") return [["Registros", formatNumber(rows.length)], ["BC", formatCurrency(totals.base)]];
        if (options.metric === "tax") return [["Registros", formatNumber(rows.length)], ["IRPJ", formatCurrency(totals.ir)], ["CSLL", formatCurrency(totals.csll)]];
        if (options.metric === "retention") return [["Registros", formatNumber(rows.length)], ["Retenções", formatCurrency(totals.retention)]];
        return [["Registros", formatNumber(rows.length)], ["Receita", formatCurrency(totals.revenue)], ["IRPJ + CSLL", formatCurrency(totals.ir + totals.csll)]];
      }
      if (mode === "month") {
        const month = Number(options.monthOffset || 0);
        const total = rows.reduce(
          (sum, row) =>
            sum + (month ? sumPainelTributarioMonth(row, month) : [1, 2, 3].reduce((acc, item) => acc + sumPainelTributarioMonth(row, item), 0)),
          0
        );
        return [["Registros", formatNumber(rows.length)], ["Receita", formatCurrency(total)]];
      }
      return [
        ["Registros", formatNumber(rows.length)],
        ["Ativos", formatNumber(rows.filter(inferActiveStatus).length)],
        ["Sem Resp.1", formatNumber(rows.filter((row) => !isFilled(row.resp1)).length)],
      ];
    })();

    titleEl.textContent = title || "Detalhe";
    subtitleEl.textContent = subtitle || "Recorte dinâmico do BI.";
    body.innerHTML = `
      ${renderDetailKpis(kpis)}
      ${rows.length > 160 ? `<div class="empty-state">Mostrando os primeiros 160 de ${formatNumber(rows.length)} registro(s).</div>` : ""}
      ${renderDetailTable(rows, options)}
    `;
    backdrop.hidden = false;
    panel.classList.add("is-open");
    panel.setAttribute("aria-hidden", "false");
  }

  function closeAnalyticsDetail() {
    const panel = document.getElementById("analyticsDetailPanel");
    const backdrop = document.getElementById("analyticsDetailBackdrop");
    if (!panel || !backdrop) return;
    panel.classList.remove("is-open");
    panel.setAttribute("aria-hidden", "true");
    backdrop.hidden = true;
  }

  function handleAnalyticsDrillClick(event) {
    const trigger = event.target.closest("[data-analytics-drill]");
    if (!trigger) return;

    event.preventDefault();
    const type = trigger.dataset.analyticsDrill;
    const title = trigger.dataset.drillTitle || "Detalhe";
    let rows = [];
    let subtitle = "Clique dinâmico do ContAnalytics.";
    let detailOptions = { mode: "contflow" };

    if (type === "distribution") {
      const field = trigger.dataset.drillField;
      const value = trigger.dataset.drillValue;
      rows = rowsByDistribution(field, value);
      subtitle = `${title}: ${value || "Não informado"}`;
    } else if (type === "quota") {
      rows = rowsByQuota(trigger.dataset.quotaScope, {
        stage: trigger.dataset.quotaStage,
        value: trigger.dataset.quotaValue,
        period: trigger.dataset.quotaPeriod,
      });
      subtitle = "Recorte das quotas no ContFlow.";
      detailOptions = { mode: "quota" };
    } else if (type === "radar") {
      rows = rowsByRadarKey(trigger.dataset.drillKey);
      subtitle = "Recorte do Radar Operacional.";
      detailOptions = {
        mode: "contflow",
        focus: trigger.dataset.drillKey === "mit-pending" ? "mit" : trigger.dataset.drillKey === "athenas" ? "athenas" : trigger.dataset.drillKey === "disconnect" ? "disconnect" : "",
      };
    } else if (type === "quarter") {
      rows = rowsByQuarterIndex(trigger.dataset.quarterIndex);
      subtitle = "Clientes do trimestre selecionado no ContFlow.";
    } else if (type === "row") {
      rows = rowsBySingleRow(trigger.dataset.rowId, trigger.dataset.rowCode);
      subtitle = "Registro selecionado na auditoria.";
    } else if (type === "coverage-empty") {
      rows = rowsByEmptyCoverageField(trigger.dataset.drillField);
      subtitle = "Empresas sem preenchimento nesse campo.";
    } else if (type === "source") {
      rows = rowsBySourceKey(trigger.dataset.sourceKey);
      subtitle = "Linhas lidas nessa fonte de dados.";
      detailOptions =
        trigger.dataset.sourceKey === "pt"
          ? { mode: "tax", panelKey: "lp" }
          : trigger.dataset.sourceKey === "ptlr"
            ? { mode: "tax", panelKey: "lrt" }
            : trigger.dataset.sourceKey === "ptlra"
              ? { mode: "tax", panelKey: "lra" }
              : { mode: "contflow" };
    } else if (type === "month") {
      rows = rowsByMonthRevenue(trigger.dataset.monthScope, trigger.dataset.quarterIndex, trigger.dataset.monthOffset);
      subtitle = "Registros tributários ligados ao período selecionado.";
      detailOptions = { mode: "month", monthOffset: trigger.dataset.monthOffset };
    } else if (type === "activity") {
      rows = rowsByActivity(trigger.dataset.activityDate, trigger.dataset.activityScope);
      subtitle = "Clientes com alterações recentes no ContFlow.";
    } else if (type === "tax-panel") {
      const panelKey = trigger.dataset.taxPanel;
      const scope = trigger.dataset.taxScope || "all";
      const metric = trigger.dataset.taxMetric || "";
      rows = getTaxDetailRows(panelKey, scope, metric);
      subtitle = `BI ${String(panelKey || "").toUpperCase()} • ${title}`;
      detailOptions = scope === "movement" || scope === "metric" ? { mode: "tax", panelKey, metric } : { mode: "contflow" };
    } else if (type === "tax-complete") {
      const scope = trigger.dataset.taxScope || "movement";
      const metric = trigger.dataset.taxMetric || "";
      rows = getTaxCompleteRows(scope, metric);
      subtitle = "BI Completo consolidando LP, LRT e LRA.";
      detailOptions = scope === "all" ? { mode: "contflow" } : { mode: "tax", metric };
    } else if (type === "tax-period") {
      const panelKey = trigger.dataset.taxPanel;
      rows = getTaxPeriodRows(panelKey, trigger.dataset.periodIndex);
      subtitle = `BI ${String(panelKey || "").toUpperCase()} • ${title}`;
      detailOptions = { mode: "tax", panelKey };
    } else if (type === "tax-company") {
      const panelKey = trigger.dataset.taxPanel;
      rows = getTaxCompanyRows(panelKey, trigger.dataset.companyKey);
      subtitle = `Empresa no BI ${String(panelKey || "").toUpperCase()}`;
      detailOptions = { mode: "tax", panelKey };
    }

    openAnalyticsDetail(title, subtitle, rows, detailOptions);
  }

  function bindInteractiveAnalyticsActions() {
    if (analyticsDrillBound) return;
    analyticsDrillBound = true;
    document.addEventListener("click", handleAnalyticsDrillClick);
    document.getElementById("analyticsDetailClose")?.addEventListener("click", closeAnalyticsDetail);
    document.getElementById("analyticsDetailBackdrop")?.addEventListener("click", closeAnalyticsDetail);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeAnalyticsDetail();
    });
  }

  function bindAnalyticsActions() {
    const btnRefresh = document.getElementById("btnAnalyticsRefresh");
    const btnExport = document.getElementById("btnAnalyticsExport");

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
    bindTaxBiActions();
    bindInteractiveAnalyticsActions();
    renderAnalyticsError(err);
  }

  async function init() {
    try {
      await loadSessionUser();

      if (!currentUser) {
        throw new Error("Sessão do usuário não encontrada.");
      }

      await loadModulesFromApi();

      if (!canAccessModule(currentModuleId, currentUser)) {
        alert("Seu cargo não possui acesso ao ContAnalytics.");
        goto("../dashboard/dashboard.html");
        return;
      }

      fillPageTexts();
      bindMenu();
      bindSidebarNavigation();
      syncSidebarFromStore();
      applyRoleToSidebar();
      markCurrentModuleActive();
      renderUserCard();
      bindUserActions();
      bindAnalyticsActions();
      bindTaxBiActions();
      bindInteractiveAnalyticsActions();
      await loadAnalytics();

      console.log("🎉 ContAnalytics inicializado!");
    } catch (err) {
      handleInitError(err);
    }
  }

  init();
});
