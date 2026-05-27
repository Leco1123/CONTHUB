// ============================
// DASHBOARD • JS (POSTGRES + SESSION COOKIE)
// ============================

(function () {
  let AUTH_USER = null;
  let MODULES_MAP = {};
  let MODULE_ACCESS_MAP = {};
  const dashboardTicketsState = {
    selectedFunction: "",
    searchTerm: "",
    imageDataUrl: "",
    doc: null,
    lastSignature: "",
    knownIds: new Set(),
    toastTimer: null,
    pollTimer: null,
    refreshPromise: null,
    visibilityBound: false,
    nextActionsFeed: null,
    ticketsSource: "local",
  };
  const dashboardQuotaModalState = {
    open: false,
    loading: false,
    saving: false,
    sheetKey: "contflow",
    sheets: new Map(),
    filteredRows: [],
  };
  let nextActionsStateCache = null;
  let contFlowSnapshotCache = null;
  let contFlowFeedCache = null;

  // ----------------------------
  // CONFIG
  // ----------------------------
  const API_BASE = "";
  const API_MODULES = `${API_BASE}/api/admin/modules`;

  const CONTFLOW_KEY = "conthub:contflow:data";
  const CONTFLOW_QUARTER_SHEETS = [
    { key: "contflow", label: "1º Trimestre" },
    { key: "contflow-q2", label: "2º Trimestre" },
    { key: "contflow-q3", label: "3º Trimestre" },
    { key: "contflow-q4", label: "4º Trimestre" },
  ];
  const QUOTA_MODAL_MODE_LABELS = {
    compensacao: "Compensação",
    prejuizo: "Prejuízo",
    sm: "S/M",
    data: "Data",
    outro: "Outro valor",
  };
  const TICKETS_API_URL = `${API_BASE}/api/dashboard/tickets`;
  const CLICKUP_NEXT_ACTIONS_API_URL = `${API_BASE}/api/dashboard/clickup-next-actions`;
  const TICKETS_API_SHEET_KEY = "dashboard-chamados";
  const TICKETS_API_SHEET_URL = `${API_BASE}/api/sheets/${TICKETS_API_SHEET_KEY}`;
  const TICKETS_POLL_INTERVAL_MS = 10000;
  const TICKET_FUNCTIONS = [
    "Contábil",
    "Fiscal",
    "Departamento Pessoal",
    "Legalização",
    "Financeiro",
    "Societário",
    "Atendimento",
  ];
  const TICKET_PRIORITIES = ["baixa", "media", "alta", "critica"];
  const TICKET_STATUSES = ["aberto", "em_andamento", "aguardando", "concluido"];
  const MAX_TICKET_IMAGE_SIZE = 2 * 1024 * 1024;
  dashboardTicketsState.selectedFunction = TICKET_FUNCTIONS[0];

  // LEGADO (fallback apenas)
  const CF_SNAPSHOT_PREFIX = "conthub:dashboard:contflow_snapshot:";
  const CF_FEED_PREFIX = "conthub:dashboard:contflow_feed:";
  const NEXT_ACTIONS_PREFIX = "conthub:dashboard:nextActions:";
  const TICKETS_PREFIX = "conthub:dashboard:tickets:";
  const NEXT_ACTIONS_CLICKUP_PREFIX = "conthub:dashboard:clickup-next-actions:v3:";

  const NEXT_ACTIONS_MANUAL_LIMIT = 3;
  const NEXT_ACTIONS_CLICKUP_LIMIT = 3;
  const DEFAULT_MANUAL = Array.from({ length: NEXT_ACTIONS_MANUAL_LIMIT }, () => "");
  const DEFAULT_CHECKS = Array.from({ length: NEXT_ACTIONS_MANUAL_LIMIT }, () => false);
  const STATUS_LABEL = {
    online: "ONLINE",
    dev: "DEV",
    offline: "OFFLINE",
    admin: "ADMIN",
  };

  // ----------------------------
  // HELPERS
  // ----------------------------
  function safeJSONParse(raw, fallback) {
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, (char) => {
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

  function normalizeSearchText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();
  }

  function normalizeColumnLabel(value) {
    return normalizeSearchText(value).replace(/[^\w]+/g, " ").trim();
  }

  function formatDateInputToBR(value) {
    const match = String(value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return "";
    return `${match[3]}/${match[2]}/${match[1]}`;
  }

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

  function fmtToday() {
    const now = new Date();
    try {
      return now.toLocaleDateString("pt-BR", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
    } catch {
      return now.toISOString().slice(0, 10);
    }
  }

  function formatDateBR(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "--";
    return date.toLocaleDateString("pt-BR");
  }

  function formatDateTimeBR(value) {
    const date = value ? new Date(value) : null;
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "--";
    try {
      return date.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return date.toISOString();
    }
  }

  function formatRelativeOrDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "--";
    const diffMs = Date.now() - date.getTime();
    const diffMin = Math.max(0, Math.round(diffMs / 60000));
    if (diffMin < 1) return "Agora";
    if (diffMin < 60) return `${diffMin} min atrás`;
    const diffHours = Math.round(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h atrás`;
    return date.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function getNotificationSupport() {
    return typeof window !== "undefined" && "Notification" in window ? window.Notification : null;
  }

  async function ensureTicketNotificationPermission() {
    const NotificationApi = getNotificationSupport();
    if (!NotificationApi) return "unsupported";
    if (NotificationApi.permission === "granted") return "granted";
    if (NotificationApi.permission === "denied") return "denied";
    try {
      return await NotificationApi.requestPermission();
    } catch {
      return NotificationApi.permission || "default";
    }
  }

  function notifyForNewTickets(tickets) {
    const NotificationApi = getNotificationSupport();
    if (!NotificationApi || NotificationApi.permission !== "granted") return;

    const items = Array.isArray(tickets) ? tickets : [];
    items.forEach((ticket) => {
      const title = `${ticket.funcao || "Chamado"} • ${ticketStatusLabel(ticket.status)}`;
      const body = getTicketTitle(ticket);
      try {
        const notification = new NotificationApi(title, {
          body,
          tag: `conthub-ticket-${ticket.id}`,
          renotify: false,
        });
        notification.onclick = () => {
          try {
            window.focus();
          } catch (_) {}
          dashboardTicketsState.selectedFunction = String(ticket.funcao || dashboardTicketsState.selectedFunction || TICKET_FUNCTIONS[0]).trim() || TICKET_FUNCTIONS[0];
          renderTickets();
          renderTiTickets();
        };
      } catch (_) {}
    });
  }

  function detectNewTickets(nextDoc) {
    const tickets = sortTickets(Array.isArray(nextDoc?.data) ? nextDoc.data : []);
    const incoming = tickets.filter((ticket) => ticket?.id && !dashboardTicketsState.knownIds.has(String(ticket.id)));
    dashboardTicketsState.knownIds = new Set(
      tickets.map((ticket) => String(ticket?.id || "").trim()).filter(Boolean)
    );
    return incoming;
  }

  function ensureTicketToastHost() {
    let host = document.getElementById("ticketToastHost");
    if (host) return host;

    host = document.createElement("div");
    host.id = "ticketToastHost";
    host.className = "ticketToastHost";
    document.body.appendChild(host);
    return host;
  }

  function showTicketToasts(tickets) {
    const items = Array.isArray(tickets) ? tickets : [];
    if (!items.length) return;

    const host = ensureTicketToastHost();
    items.forEach((ticket) => {
      const toast = document.createElement("button");
      toast.type = "button";
      toast.className = "ticketToast";
      toast.innerHTML = `
        <div class="ticketToast__eyebrow">Novo chamado • ${escapeHTML(ticket.funcao || "Chamado")}</div>
        <strong class="ticketToast__title">${escapeHTML(getTicketTitle(ticket))}</strong>
        <div class="ticketToast__meta">${escapeHTML(ticketStatusLabel(ticket.status))} • ${escapeHTML(ticketPriorityLabel(ticket.urgencia))}</div>
      `;
      toast.addEventListener("click", () => {
        dashboardTicketsState.selectedFunction = String(ticket.funcao || dashboardTicketsState.selectedFunction || TICKET_FUNCTIONS[0]).trim() || TICKET_FUNCTIONS[0];
        renderTickets();
        renderTiTickets();
        toast.remove();
        try {
          window.focus();
        } catch (_) {}
      });
      host.appendChild(toast);
      setTimeout(() => {
        toast.classList.add("is-visible");
      }, 20);
      setTimeout(() => {
        toast.classList.remove("is-visible");
        setTimeout(() => toast.remove(), 220);
      }, 7000);
    });

    if (dashboardTicketsState.toastTimer) {
      clearTimeout(dashboardTicketsState.toastTimer);
    }

    document.title = `(${items.length}) Novo chamado • ContHub`;
    dashboardTicketsState.toastTimer = setTimeout(() => {
      document.title = "ContHub • Boas-vindas";
      dashboardTicketsState.toastTimer = null;
    }, 8000);
  }

  function getSessionUser() {
    return AUTH_USER;
  }

  function getUserKey() {
    const u = getSessionUser();
    if (!u) return "anon";

    const email = String(u.email || "").toLowerCase().trim();
    const id = u.id != null ? String(u.id) : "";
    const name = String(u.nome || u.name || "").trim();

    return email || id || name || "anon";
  }

  async function apiFetch(path, options = {}) {
    const {
      redirectOn401 = false,
      headers = {},
      ...rest
    } = options || {};

    const resp = await fetch(path, {
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...headers,
      },
      ...rest,
    });

    if (resp.status === 401 && redirectOn401) {
      goto("../login/login.html");
      return null;
    }

    return resp;
  }

  // ----------------------------
  // AUTH
  // ----------------------------
  async function requireAuthOrRedirect() {
    try {
      const resp = await apiFetch("/api/auth/me", {
        method: "GET",
        redirectOn401: true,
      });

      if (!resp || !resp.ok) {
        goto("../login/login.html");
        return null;
      }

      const data = await resp.json().catch(() => null);
      const me = data && typeof data === "object" ? data.user || data : null;

      if (!me || typeof me !== "object") {
        goto("../login/login.html");
        return null;
      }

      return me;
    } catch (err) {
      console.warn("Falha ao validar /api/auth/me:", err);
      goto("../login/login.html");
      return null;
    }
  }

  async function logoutDashboard() {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch (_) {}

    AUTH_USER = null;

    try {
      localStorage.removeItem("conthub_user");
      localStorage.removeItem("conthub_current_user_id");
    } catch (_) {}

    goto("../login/login.html");
  }

  // ----------------------------
  // MODULES (BANCO)
  // ----------------------------
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
      console.warn("Falha ao carregar módulos do banco:", err);
      MODULES_MAP = {};
      MODULE_ACCESS_MAP = {};
      return MODULES_MAP;
    }
  }

  function cloneState(value) {
    return value ? JSON.parse(JSON.stringify(value)) : value;
  }

  function getSidebarCards() {
    return Array.from(
      document.querySelectorAll(".modulos-sidebar .cards-modulos[data-module-id]")
    );
  }

  function getShortcutCards() {
    return Array.from(
      document.querySelectorAll("[data-module-id]")
    ).filter((el) => !el.closest(".modulos-sidebar"));
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

  function applyStatusToCard(card, moduleId, status) {
    if (!card || !moduleId) return;

    const finalStatus = moduleId === "contadmin" ? "admin" : status || "online";
    const pill = ensureStatusSpan(card);
    if (!pill) return;

    pill.setAttribute("data-status", finalStatus);
    pill.textContent = STATUS_LABEL[finalStatus] || "ONLINE";

    const isOffline = finalStatus === "offline";
    const noAccess = card.getAttribute("data-noaccess") === "true";

    card.setAttribute("data-disabled", isOffline ? "true" : "false");

    if (isOffline || noAccess) {
      card.classList.add("is-disabled");
    } else {
      card.classList.remove("is-disabled");
    }
  }

  function syncSidebarFromStore() {
    const store = MODULES_MAP || {};

    getSidebarCards().forEach((btn) => {
      const moduleId = String(btn.dataset.moduleId || "").trim().toLowerCase();
      if (!moduleId) return;

      const def = moduleId === "contadmin" ? "admin" : "online";
      applyStatusToCard(btn, moduleId, store[moduleId] || def);
    });
  }

  function syncShortcutsFromStore() {
    const store = MODULES_MAP || {};

    getShortcutCards().forEach((btn) => {
      const moduleId = String(btn.dataset.moduleId || "").trim().toLowerCase();
      if (!moduleId) return;

      const def = moduleId === "contadmin" ? "admin" : "online";
      applyStatusToCard(btn, moduleId, store[moduleId] || def);
    });
  }

  function applyRoleToSidebar() {
    const u = getSessionUser();

    [...getSidebarCards(), ...getShortcutCards()].forEach((card) => {
      const moduleId = String(card.dataset.moduleId || "").trim().toLowerCase();
      if (!moduleId) return;

      const blocked = !canAccessModule(u, { id: moduleId, access: MODULE_ACCESS_MAP[moduleId] });
      card.setAttribute("data-noaccess", blocked ? "true" : "false");
      card.hidden = blocked;

      if (blocked) {
        card.classList.add("is-disabled");
      } else if (card.getAttribute("data-disabled") !== "true") {
        card.classList.remove("is-disabled");
      }
    });
  }

  // ----------------------------
  // NEXT ACTIONS (POSTGRES)
  // ----------------------------
  function nextActionsStorageKeyLegacy() {
    return NEXT_ACTIONS_PREFIX + getUserKey();
  }

  function loadNextActionsStateLegacy() {
    const raw = localStorage.getItem(nextActionsStorageKeyLegacy());
    if (!raw) return { manual: [...DEFAULT_MANUAL], checks: [...DEFAULT_CHECKS] };

    const data = safeJSONParse(raw, null);
    if (!data || typeof data !== "object") {
      return { manual: [...DEFAULT_MANUAL], checks: [...DEFAULT_CHECKS] };
    }

    const manual = Array.isArray(data.manual) ? data.manual.slice(0, NEXT_ACTIONS_MANUAL_LIMIT) : [...DEFAULT_MANUAL];
    while (manual.length < NEXT_ACTIONS_MANUAL_LIMIT) manual.push("");

    const checks = Array.isArray(data.checks) ? data.checks.slice(0, NEXT_ACTIONS_MANUAL_LIMIT) : [...DEFAULT_CHECKS];
    while (checks.length < NEXT_ACTIONS_MANUAL_LIMIT) checks.push(false);

    return { manual, checks };
  }

  function saveNextActionsStateLegacy(state) {
    localStorage.setItem(nextActionsStorageKeyLegacy(), JSON.stringify(state));
  }

  function deriveNextActionTitle(ticket) {
    const directTitle = String(
      ticket?.name ||
      ticket?.title ||
      ticket?.taskName ||
      ""
    ).trim();
    if (directTitle) return directTitle;

    const descriptionFirstLine = String(ticket?.description || "")
      .split(/\r?\n/)
      .map((line) => String(line || "").trim())
      .find(Boolean);
    if (descriptionFirstLine) return descriptionFirstLine;

    return "Tarefa sem título";
  }

  function normalizeNextActionTicket(ticket) {
    const row = ticket && typeof ticket === "object" ? ticket : {};
    const assigneeNames = Array.isArray(row.assigneeNames)
      ? row.assigneeNames.map((item) => String(item || "").trim()).filter(Boolean)
      : [];
    const assigneeEmails = Array.isArray(row.assigneeEmails)
      ? row.assigneeEmails.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean)
      : [];
    const fallbackAssignee = String(row.assigneeName || row.assignee || "").trim();
    if (fallbackAssignee && !assigneeNames.includes(fallbackAssignee)) {
      assigneeNames.unshift(fallbackAssignee);
    }
    return {
      id: String(row.id || row.taskId || "").trim(),
      name: deriveNextActionTitle(row),
      description: String(row.description || row.details || "").trim(),
      status: String(row.status || "").trim(),
      priority: String(row.priority || row.urgencia || "").trim().toLowerCase(),
      assigneeName: assigneeNames[0] || fallbackAssignee,
      assigneeNames,
      assigneeEmails,
      assigneeLabel: String(row.assigneeLabel || "").trim(),
      assigneeDisplay: String(row.assigneeDisplay || "").trim(),
      assignedToSessionUser: Boolean(row.assignedToSessionUser),
      responsibleCount: Number(row.responsibleCount || 0) || 0,
      dueAt: String(row.dueAt || row.due_date || "").trim(),
      createdAt: String(row.createdAt || row.date_created || "").trim(),
      updatedAt: String(row.updatedAt || row.date_updated || "").trim(),
      url: String(row.url || row.link || "").trim(),
      listName: String(row.listName || row.list || "").trim(),
      folderName: String(row.folderName || row.folder || "").trim(),
      spaceName: String(row.spaceName || row.space || "").trim(),
      solicitanteNome: String(row.solicitanteNome || row.requesterName || "").trim(),
      solicitanteEmail: String(row.solicitanteEmail || row.requesterEmail || "").trim(),
    };
  }

  function nextActionsClickupStorageKeyLegacy() {
    return NEXT_ACTIONS_CLICKUP_PREFIX + getUserKey();
  }

  function loadNextActionsClickupLegacy() {
    const raw = localStorage.getItem(nextActionsClickupStorageKeyLegacy());
    const parsed = safeJSONParse(raw, null);
    if (!parsed || typeof parsed !== "object") {
      return { savedAt: "", data: [], configured: false };
    }
    return {
      savedAt: String(parsed.savedAt || ""),
      configured: Boolean(parsed.configured),
      data: Array.isArray(parsed.data) ? parsed.data.map(normalizeNextActionTicket) : [],
      debug: parsed.debug && typeof parsed.debug === "object" ? parsed.debug : null,
    };
  }

  function saveNextActionsClickupLegacy(payload) {
    localStorage.setItem(nextActionsClickupStorageKeyLegacy(), JSON.stringify({
      savedAt: String(payload?.savedAt || ""),
      configured: Boolean(payload?.configured),
      data: Array.isArray(payload?.data) ? payload.data.map(normalizeNextActionTicket) : [],
      debug: payload?.debug && typeof payload.debug === "object" ? payload.debug : null,
    }));
  }

  async function loadNextActionsClickupFeed({ force = false } = {}) {
    if (!force && dashboardTicketsState.nextActionsFeed) {
      return dashboardTicketsState.nextActionsFeed;
    }

    try {
      const bust = `ts=${Date.now()}`;
      const sep = CLICKUP_NEXT_ACTIONS_API_URL.includes("?") ? "&" : "?";
      const resp = await apiFetch(`${CLICKUP_NEXT_ACTIONS_API_URL}${sep}${bust}`, {
        method: "GET",
        cache: "no-store",
      });
      const data = await resp?.json().catch(() => null);
      if (!resp || !resp.ok) {
        throw new Error(data?.error || "Falha ao carregar próximas ações do ClickUp.");
      }

      if (data?.configured === false) {
        const fallback = loadNextActionsClickupLegacy();
        const payload = {
          savedAt: String(fallback?.savedAt || data?.savedAt || ""),
          configured: false,
          data: Array.isArray(fallback?.data) ? fallback.data : [],
          debug: fallback?.debug && typeof fallback.debug === "object" ? fallback.debug : null,
        };
        dashboardTicketsState.nextActionsFeed = payload;
        return payload;
      }

      const payload = {
        savedAt: String(data?.savedAt || new Date().toISOString()),
        configured: true,
        data: Array.isArray(data?.data) ? data.data.map(normalizeNextActionTicket) : [],
        debug: data?.debug && typeof data.debug === "object" ? data.debug : null,
      };
      dashboardTicketsState.nextActionsFeed = payload;
      saveNextActionsClickupLegacy(payload);
      return payload;
    } catch (err) {
      const fallback = dashboardTicketsState.nextActionsFeed || {
        savedAt: "",
        configured: false,
        data: [],
      };
      dashboardTicketsState.nextActionsFeed = fallback;
      return fallback;
    }
  }

  async function getNextActionsState({ force = false } = {}) {
    if (!force && nextActionsStateCache) {
      return cloneState(nextActionsStateCache);
    }

    try {
      const resp = await apiFetch("/api/dashboard/next-actions", { method: "GET" });
      if (!resp || !resp.ok) throw new Error("GET next-actions failed");

      const data = await resp.json().catch(() => null);

      const manual = Array.isArray(data?.manual) ? data.manual.slice(0, NEXT_ACTIONS_MANUAL_LIMIT) : [...DEFAULT_MANUAL];
      while (manual.length < NEXT_ACTIONS_MANUAL_LIMIT) manual.push("");

      const checks = Array.isArray(data?.checks) ? data.checks.slice(0, NEXT_ACTIONS_MANUAL_LIMIT) : [...DEFAULT_CHECKS];
      while (checks.length < NEXT_ACTIONS_MANUAL_LIMIT) checks.push(false);

      nextActionsStateCache = { manual, checks };
      return cloneState(nextActionsStateCache);
    } catch (e) {
      nextActionsStateCache = loadNextActionsStateLegacy();
      return cloneState(nextActionsStateCache);
    }
  }

  async function saveNextActionsState(state) {
    const normalized = {
      manual: Array.isArray(state?.manual) ? state.manual.slice(0, NEXT_ACTIONS_MANUAL_LIMIT) : [...DEFAULT_MANUAL],
      checks: Array.isArray(state?.checks) ? state.checks.slice(0, NEXT_ACTIONS_MANUAL_LIMIT) : [...DEFAULT_CHECKS],
    };

    while (normalized.manual.length < NEXT_ACTIONS_MANUAL_LIMIT) normalized.manual.push("");
    while (normalized.checks.length < NEXT_ACTIONS_MANUAL_LIMIT) normalized.checks.push(false);

    nextActionsStateCache = cloneState(normalized);
    saveNextActionsStateLegacy(normalized);

    try {
      const resp = await apiFetch("/api/dashboard/next-actions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          manual: normalized.manual.slice(0, NEXT_ACTIONS_MANUAL_LIMIT),
          checks: normalized.checks.slice(0, NEXT_ACTIONS_MANUAL_LIMIT),
        }),
      });

      if (!resp || !resp.ok) throw new Error("PUT next-actions failed");
      return true;
    } catch (e) {
      return false;
    }
  }

  function getCurrentUserIdentity() {
    const user = getSessionUser();
    const email = normalizeSearchText(user?.email || "");
    const emailLocal = email.includes("@") ? email.split("@")[0] : email;
    return {
      name: normalizeSearchText(user?.nome || user?.name || ""),
      email,
      emailLocal,
    };
  }

  function tokenizeIdentity(value) {
    return normalizeSearchText(value)
      .replace(/[^\w]+/g, " ")
      .split(/\s+/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 2);
  }

  function getIdentityInitials(tokens) {
    return (Array.isArray(tokens) ? tokens : [])
      .map((token) => String(token || "").trim().charAt(0))
      .filter(Boolean)
      .join("");
  }

  function identitiesMatch(left, right) {
    const a = normalizeSearchText(left);
    const b = normalizeSearchText(right);
    if (!a || !b) return false;
    if (a === b) return true;
    if (a.includes(b) || b.includes(a)) return true;

    const tokensA = tokenizeIdentity(a);
    const tokensB = tokenizeIdentity(b);
    if (!tokensA.length || !tokensB.length) return false;
    const initialsA = getIdentityInitials(tokensA);
    const initialsB = getIdentityInitials(tokensB);
    if (initialsA && initialsB && (initialsA === initialsB || initialsA.includes(initialsB) || initialsB.includes(initialsA))) {
      return true;
    }

    const shorter = tokensA.length <= tokensB.length ? tokensA : tokensB;
    const longer = tokensA.length <= tokensB.length ? tokensB : tokensA;

    let startIndex = 0;
    for (const shortToken of shorter) {
      let matched = false;
      for (let idx = startIndex; idx < longer.length; idx += 1) {
        const longToken = longer[idx];
        if (
          longToken === shortToken ||
          longToken.startsWith(shortToken) ||
          shortToken.startsWith(longToken)
        ) {
          matched = true;
          startIndex = idx + 1;
          break;
        }
      }
      if (!matched) return false;
    }

    return true;
  }

  function isTicketAssignedToCurrentUser(ticket) {
    const identity = getCurrentUserIdentity();
    const assignees = Array.isArray(ticket?.assigneeNames) && ticket.assigneeNames.length
      ? ticket.assigneeNames
      : [ticket?.assigneeName || ""];
    const assigneeEmails = Array.isArray(ticket?.assigneeEmails)
      ? ticket.assigneeEmails.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean)
      : [];

    if (identity.email && assigneeEmails.includes(identity.email)) return true;
    if (identity.name && assignees.some((item) => identitiesMatch(item, identity.name))) return true;
    if (identity.emailLocal && assignees.some((item) => identitiesMatch(item, identity.emailLocal))) return true;
    return false;
  }

  function getTicketRelationScore(ticket) {
    const identity = getCurrentUserIdentity();
    const assignees = Array.isArray(ticket?.assigneeNames) && ticket.assigneeNames.length
      ? ticket.assigneeNames
      : [ticket?.assigneeName || ""];
    const assigneeEmails = Array.isArray(ticket?.assigneeEmails)
      ? ticket.assigneeEmails.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean)
      : [];
    const requesterName = normalizeSearchText(ticket?.solicitanteNome || "");
    const requesterEmail = normalizeSearchText(ticket?.solicitanteEmail || "");

    if (identity.email && assigneeEmails.includes(identity.email)) return 3;
    if (identity.name && assignees.some((item) => identitiesMatch(item, identity.name))) return 3;
    if (identity.emailLocal && assignees.some((item) => identitiesMatch(item, identity.emailLocal))) return 3;
    if (identity.email && requesterEmail && requesterEmail === identity.email) return 2;
    if (identity.name && requesterName && requesterName === identity.name) return 1;
    return 0;
  }

  function getNextActionAssigneeLabel(ticket) {
    if (String(ticket?.assigneeDisplay || "").trim()) {
      return String(ticket.assigneeDisplay).trim();
    }
    const emails = Array.isArray(ticket?.assigneeEmails)
      ? ticket.assigneeEmails.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean)
      : [];
    const names = Array.isArray(ticket?.assigneeNames) ? ticket.assigneeNames.filter(Boolean) : [];
    const responsibleCount =
      Number(ticket?.responsibleCount || 0) ||
      Math.max(emails.length, names.length, 1);
    if (responsibleCount > 1) return `Você + ${responsibleCount - 1}`;
    return "Você";
  }

  function ticketPriorityRank(priority) {
    switch (String(priority || "").trim().toLowerCase()) {
      case "critica":
        return 0;
      case "alta":
        return 1;
      case "media":
        return 2;
      default:
        return 3;
    }
  }

  function ticketStatusRank(status) {
    switch (String(status || "").trim().toLowerCase()) {
      case "aberto":
        return 0;
      case "em_andamento":
        return 1;
      case "aguardando":
        return 2;
      default:
        return 3;
    }
  }

  function getTicketDueTime(ticket) {
    const time = new Date(ticket?.dueAt || "").getTime();
    return Number.isFinite(time) && time > 0 ? time : Number.MAX_SAFE_INTEGER;
  }

  function ticketPriorityTone(priority) {
    switch (String(priority || "").trim().toLowerCase()) {
      case "critica":
        return "danger";
      case "alta":
        return "warn";
      case "baixa":
        return "soft";
      default:
        return "ok";
    }
  }

  function ticketStatusTone(status) {
    switch (String(status || "").trim().toLowerCase()) {
      case "aberto":
        return "danger";
      case "em_andamento":
        return "warn";
      case "aguardando":
        return "soft";
      default:
        return "ok";
    }
  }

  function getClickupNextActionItems(limit = NEXT_ACTIONS_CLICKUP_LIMIT) {
    const items = (Array.isArray(dashboardTicketsState.nextActionsFeed?.data) ? dashboardTicketsState.nextActionsFeed.data : [])
      .filter((ticket) => String(ticket?.status || "").trim().toLowerCase() !== "concluido")
      .map((ticket) => ({
        ...ticket,
        __dueTime: getTicketDueTime(ticket),
      }))
      .sort((a, b) => {
        if (ticketStatusRank(a.status) !== ticketStatusRank(b.status)) {
          return ticketStatusRank(a.status) - ticketStatusRank(b.status);
        }
        if (ticketPriorityRank(a.priority) !== ticketPriorityRank(b.priority)) {
          return ticketPriorityRank(a.priority) - ticketPriorityRank(b.priority);
        }
        if (a.__dueTime !== b.__dueTime) return a.__dueTime - b.__dueTime;
        return new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime();
      });

    return items.slice(0, limit);
  }

  function renderNextActionsClickupMeta(openCount, selectedCount) {
    const el = document.getElementById("nextActionsClickupMeta");
    if (!el) return;
    const debug = dashboardTicketsState.nextActionsFeed?.debug || null;

    if (!dashboardTicketsState.nextActionsFeed) {
      el.textContent = "ClickUp sincronizando...";
      el.dataset.tone = "soft";
      return;
    }

    if (dashboardTicketsState.nextActionsFeed.configured === false && !openCount) {
      el.textContent = "ClickUp sem cache disponível";
      el.dataset.tone = "soft";
      return;
    }

    if (!openCount) {
      el.textContent = "ClickUp sem pendências abertas";
      el.dataset.tone = "ok";
      return;
    }

    const savedAt = dashboardTicketsState.nextActionsFeed?.savedAt
      ? formatRelativeOrDate(dashboardTicketsState.nextActionsFeed.savedAt)
      : "";
    const sessionSuffix = debug?.sessionEmail ? ` • ${debug.sessionEmail}` : "";
    el.textContent = `ClickUp: ${selectedCount}/${openCount} ações${savedAt ? ` • ${savedAt}` : ""}${sessionSuffix}`;
    el.dataset.tone = openCount > 6 ? "warn" : "ok";
  }

  // ----------------------------
  // CHAMADOS (COMPARTILHADO / TI)
  // ----------------------------
  function ticketsStorageKey() {
    return TICKETS_PREFIX + getUserKey();
  }

  function normalizeAccessProfile(value) {
    const normalized = String(value || "").trim().toLowerCase();
    return ["ti", "gerencial", "coordenacao", "operacional", "consulta", "comercial"].includes(normalized)
      ? normalized
      : "operacional";
  }

  function legacyRoleToAccessProfile(role) {
    const normalized = String(role || "").trim().toLowerCase();
    if (normalized === "ti") return "ti";
    if (normalized === "admin") return "gerencial";
    return "operacional";
  }

  function getAccessProfile(user) {
    return normalizeAccessProfile(
      user?.accessProfile ||
      user?.access_profile ||
      legacyRoleToAccessProfile(user?.role)
    );
  }

  function normalizeModuleAccess(access) {
    return String(access || "")
      .split("+")
      .map((item) =>
        String(item || "")
          .trim()
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
      )
      .filter(Boolean);
  }

  function canAccessModule(user, module) {
    const moduleId = String(module?.id || module?.slug || "").trim().toLowerCase();
    if (Array.isArray(user?.permissions)) {
      const matched = user.permissions.find((entry) => String(entry?.moduleId || "").trim().toLowerCase() === moduleId);
      if (matched) return Boolean(matched.view);
    }
    if (Array.isArray(user?.visibleModules) && user.visibleModules.length) {
      return user.visibleModules.map((item) => String(item || "").trim().toLowerCase()).includes(moduleId);
    }
    const role = String(user?.role || "").trim().toLowerCase();
    const accessProfile = getAccessProfile(user);
    const rules = normalizeModuleAccess(module?.access);

    if (role === "ti" || accessProfile === "ti") return true;
    if (accessProfile === "comercial") return moduleId === "dashboard" || moduleId === "contcomercial";
    if (moduleId === "ti-tickets") return ["ti", "gerencial"].includes(accessProfile) || role === "admin";
    if (moduleId === "contadmin") return role === "admin" || accessProfile === "gerencial";
    if (moduleId === "contanalytics") return ["gerencial", "coordenacao"].includes(accessProfile) || role === "admin";
    if (!rules.length || rules.includes("user") || rules.includes("user+admin")) return true;
    if (rules.includes("all") || rules.includes("*") || rules.includes("auth")) return true;
    if (rules.includes(role) || rules.includes(accessProfile)) return true;
    if (rules.includes("admin") && role === "admin") return true;
    return false;
  }

  function isTiUser() {
    return getAccessProfile(getSessionUser()) === "ti";
  }

  function emptyTicketsDocument() {
    return {
      version: 1,
      savedAt: new Date().toISOString(),
      columns: [
        { key: "id", label: "ID" },
        { key: "funcao", label: "Função" },
        { key: "descricao", label: "Descrição" },
        { key: "urgencia", label: "Urgência" },
        { key: "status", label: "Status" },
        { key: "solicitanteNome", label: "Solicitante" },
        { key: "solicitanteEmail", label: "Email" },
        { key: "assigneeName", label: "Responsável" },
        { key: "imagem", label: "Imagem" },
        { key: "dueAt", label: "Prazo" },
        { key: "createdAt", label: "Criado em" },
        { key: "updatedAt", label: "Atualizado em" },
      ],
      data: [],
    };
  }

  function normalizeTicketRecord(raw) {
    if (!raw || typeof raw !== "object") return null;

    const id = String(raw.id || "").trim() || `tk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const funcao = TICKET_FUNCTIONS.includes(String(raw.funcao || "").trim())
      ? String(raw.funcao || "").trim()
      : TICKET_FUNCTIONS[0];
    const descricao = String(raw.descricao || raw.title || "").trim().slice(0, 1000);
    const urgencia = TICKET_PRIORITIES.includes(String(raw.urgencia || raw.priority || "").trim().toLowerCase())
      ? String(raw.urgencia || raw.priority || "").trim().toLowerCase()
      : "media";
    const status = TICKET_STATUSES.includes(String(raw.status || "").trim().toLowerCase())
      ? String(raw.status || "").trim().toLowerCase()
      : "aberto";
    const solicitanteNome = String(raw.solicitanteNome || raw.requesterName || "").trim().slice(0, 160);
    const solicitanteEmail = String(raw.solicitanteEmail || raw.requesterEmail || "").trim().slice(0, 220);
    const assigneeName = String(raw.assigneeName || raw.assignee || "").trim().slice(0, 160);
    const imagemRaw = String(raw.imagem || raw.imageDataUrl || "").trim();
    const imagem = /^(data:image\/|https?:\/\/)/i.test(imagemRaw)
      ? imagemRaw
      : "";
    const dueAt = String(raw.dueAt || raw.dueDate || "").trim();
    const createdAt = String(raw.createdAt || raw.abertoEm || new Date().toISOString()).trim();
    const updatedAt = String(raw.updatedAt || createdAt || new Date().toISOString()).trim();

    return {
      id,
      funcao,
      descricao,
      urgencia,
      status,
      solicitanteNome,
      solicitanteEmail,
      assigneeName,
      imagem,
      dueAt,
      createdAt,
      updatedAt,
    };
  }

  function normalizeTicketsDocument(payload) {
    const fallback = emptyTicketsDocument();
    if (!payload || typeof payload !== "object") return fallback;

    const data = Array.isArray(payload.data)
      ? payload.data.map(normalizeTicketRecord).filter(Boolean)
      : [];

    return {
      version: Number(payload.version || 1) || 1,
      savedAt: String(payload.savedAt || new Date().toISOString()),
      columns: Array.isArray(payload.columns) && payload.columns.length ? payload.columns : fallback.columns,
      data,
    };
  }

  function relationalSheetToTicketsDocument(payload) {
    if (
      !payload ||
      !Array.isArray(payload.columns) ||
      !Array.isArray(payload.rows) ||
      !Array.isArray(payload.cells)
    ) {
      return null;
    }

    const orderedColumns = payload.columns
      .slice()
      .sort((a, b) => Number(a?.order || 0) - Number(b?.order || 0))
      .map((col) => ({
        key: String(col?.key || "").trim(),
        label: String(col?.label || col?.key || "").trim(),
      }))
      .filter((col) => col.key);

    const rowMap = new Map();
    payload.rows
      .slice()
      .sort((a, b) => Number(a?.order || 0) - Number(b?.order || 0))
      .forEach((row) => {
        const key = String(row?.clientRowId || row?.id || "").trim();
        if (!key) return;
        const base = { __id: key };
        orderedColumns.forEach((col) => {
          base[col.key] = "";
        });
        rowMap.set(Number(row?.id), base);
      });

    payload.cells.forEach((cell) => {
      const rowObj = rowMap.get(Number(cell?.rowId));
      const colKey = String(cell?.colKey || "").trim();
      if (!rowObj || !colKey) return;
      rowObj[colKey] = cell?.value == null ? "" : String(cell.value);
    });

    return normalizeTicketsDocument({
      version: Number(payload?.sheet?.version || 1) || 1,
      savedAt: String(payload?.sheet?.updatedAt || new Date().toISOString()),
      columns: orderedColumns,
      data: Array.from(rowMap.values()).map((row) => ({
        id: row.id || row.__id,
        funcao: row.funcao,
        descricao: row.descricao,
        urgencia: row.urgencia,
        status: row.status,
        solicitanteNome: row.solicitanteNome,
        solicitanteEmail: row.solicitanteEmail,
        assigneeName: row.assigneeName,
        imagem: row.imagem,
        dueAt: row.dueAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
    });
  }

  function loadTicketsStateLegacy() {
    const raw = localStorage.getItem(ticketsStorageKey());
    const data = safeJSONParse(raw, []);
    const items = Array.isArray(data) ? data.map(normalizeTicketRecord).filter(Boolean) : [];
    return {
      ...emptyTicketsDocument(),
      data: items,
    };
  }

  function saveTicketsStateLegacy(doc) {
    localStorage.setItem(ticketsStorageKey(), JSON.stringify((doc && Array.isArray(doc.data)) ? doc.data : []));
  }

  function isTicketsApiPayload(payload) {
    return Boolean(
      payload &&
      typeof payload === "object" &&
      (
        Array.isArray(payload.data) ||
        Array.isArray(payload.tickets) ||
        payload.provider === "clickup"
      )
    );
  }

  function extractTicketsFromApiPayload(payload) {
    if (!payload || typeof payload !== "object") return [];
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.tickets)) return payload.tickets;
    return [];
  }

  function isClickupUnavailableResponse(resp, payload) {
    const code = String(payload?.code || "").trim().toUpperCase();
    return resp?.status === 503
      || code === "CLICKUP_NOT_CONFIGURED"
      || code === "CLICKUP_SYNC_FAILED"
      || payload?.configured === false;
  }

  async function loadTicketsDocument() {
    try {
      const remoteResp = await apiFetch(TICKETS_API_URL, { method: "GET" });
      const remoteData = await remoteResp?.json().catch(() => null);
      if (
        remoteResp &&
        remoteResp.ok &&
        isTicketsApiPayload(remoteData) &&
        remoteData?.configured !== false
      ) {
        const doc = normalizeTicketsDocument({
          savedAt: remoteData?.savedAt || new Date().toISOString(),
          data: extractTicketsFromApiPayload(remoteData),
        });
        dashboardTicketsState.doc = doc;
        dashboardTicketsState.ticketsSource = "clickup";
        saveTicketsStateLegacy(doc);
        void saveTicketsMirrorSnapshot(doc);
        return doc;
      }

      if (remoteResp && !isClickupUnavailableResponse(remoteResp, remoteData)) {
        throw new Error(remoteData?.error || "Falha ao carregar chamados da API.");
      }

      const resp = await apiFetch(TICKETS_API_SHEET_URL, { method: "GET" });
      const data = await resp?.json().catch(() => null);
      if (!resp || !resp.ok) throw new Error(data?.error || "Falha ao carregar chamados.");
      const doc = (
        relationalSheetToTicketsDocument(data) ||
        normalizeTicketsDocument(data?.payload || data?.sheet || data)
      );
      dashboardTicketsState.doc = doc;
      dashboardTicketsState.ticketsSource = "mirror";
      return doc;
    } catch (err) {
      console.warn("Falha ao carregar chamados do banco, usando fallback local:", err);
      const doc = loadTicketsStateLegacy();
      dashboardTicketsState.doc = doc;
      dashboardTicketsState.ticketsSource = "local";
      return doc;
    }
  }

  async function saveTicketsDocument(doc) {
    const payload = normalizeTicketsDocument({
      ...doc,
      savedAt: new Date().toISOString(),
    });

    try {
      const resp = await apiFetch(TICKETS_API_SHEET_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await resp?.json().catch(() => null);
      if (!resp || !resp.ok) throw new Error(data?.error || "Falha ao salvar chamados.");
      saveTicketsStateLegacy(payload);
      dashboardTicketsState.doc = payload;
      return payload;
    } catch (err) {
      console.warn("Falha ao salvar chamados no banco, usando fallback local:", err);
      saveTicketsStateLegacy(payload);
      dashboardTicketsState.doc = payload;
      return payload;
    }
  }

  async function saveTicketsMirrorSnapshot(doc) {
    try {
      await saveTicketsDocument(doc);
      return true;
    } catch (err) {
      console.warn("Falha ao espelhar chamados no ContHub:", err);
      return false;
    }
  }

  async function createTicketViaApi(payload) {
    const resp = await apiFetch(TICKETS_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await resp?.json().catch(() => null);
    if (!resp || !resp.ok) throw new Error(data?.error || "Falha ao criar chamado.");
    return normalizeTicketRecord(data?.ticket || data);
  }

  async function updateTicketStatusViaApi(ticketId, nextStatus) {
    const resp = await apiFetch(`${TICKETS_API_URL}/${encodeURIComponent(ticketId)}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    const data = await resp?.json().catch(() => null);
    if (!resp || !resp.ok) throw new Error(data?.error || "Falha ao atualizar status.");
    return true;
  }

  async function deleteTicketViaApi(ticketId) {
    const resp = await apiFetch(`${TICKETS_API_URL}/${encodeURIComponent(ticketId)}`, {
      method: "DELETE",
    });
    const data = await resp?.json().catch(() => null);
    if (!resp || !resp.ok) throw new Error(data?.error || "Falha ao excluir chamado.");
    return true;
  }

  async function clearClosedTicketsViaApi() {
    const resp = await apiFetch(`${TICKETS_API_URL}/clear-closed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await resp?.json().catch(() => null);
    if (!resp || !resp.ok) throw new Error(data?.error || "Falha ao limpar chamados concluídos.");
    return true;
  }

  function currentTicketAuthorName() {
    const user = getSessionUser();
    return String(user?.nome || user?.name || "Usuário").trim();
  }

  function currentTicketAuthorEmail() {
    const user = getSessionUser();
    return String(user?.email || "").trim();
  }

  function ticketPriorityLabel(priority) {
    switch (String(priority || "").trim().toLowerCase()) {
      case "baixa":
        return "Baixa";
      case "alta":
        return "Alta";
      case "critica":
        return "Crítica";
      default:
        return "Média";
    }
  }

  function ticketStatusLabel(status) {
    switch (String(status || "").trim().toLowerCase()) {
      case "em_andamento":
        return "Em andamento";
      case "aguardando":
        return "Aguardando teste";
      case "concluido":
        return "Concluído";
      default:
        return "Aberto";
    }
  }

  function ticketStatusClass(status) {
    switch (String(status || "").trim().toLowerCase()) {
      case "em_andamento":
        return "ticket__badge--status-em_andamento";
      case "aguardando":
        return "ticket__badge--status-aguardando";
      case "concluido":
        return "ticket__badge--status-concluido";
      default:
        return "ticket__badge--status-aberto";
    }
  }

  function sortTickets(items) {
    return [...items].sort((a, b) => {
      const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return bTime - aTime;
    });
  }

  function getTicketsSignature(doc) {
    const items = Array.isArray(doc?.data) ? doc.data : [];
    return JSON.stringify(
      items.map((ticket) => [
        ticket.id,
        ticket.funcao,
        ticket.urgencia,
        ticket.status,
        ticket.descricao,
        ticket.solicitanteNome,
        ticket.solicitanteEmail,
        ticket.imagem ? "img" : "",
        ticket.updatedAt,
      ])
    );
  }

  function filteredTicketsForSelectedFunction() {
    const items = Array.isArray(dashboardTicketsState.doc?.data) ? dashboardTicketsState.doc.data : [];
    const searchTerm = String(dashboardTicketsState.searchTerm || "").trim().toLowerCase();
    return sortTickets(
      items.filter((ticket) => {
        const isAll = dashboardTicketsState.selectedFunction === "__all__";
        if (!isAll && ticket.funcao !== dashboardTicketsState.selectedFunction) return false;
        if (!searchTerm) return true;
        const haystack = [
          ticket.descricao,
          ticket.solicitanteNome,
          ticket.solicitanteEmail,
          ticket.status,
          ticket.urgencia,
        ]
          .map((value) => String(value || "").toLowerCase())
          .join(" ");
        return haystack.includes(searchTerm);
      })
    );
  }

  function getTicketCode(index) {
    return `CH-${String(index + 1).padStart(3, "0")}`;
  }

  function getTicketCodeById(id) {
    const items = sortTickets(Array.isArray(dashboardTicketsState.doc?.data) ? dashboardTicketsState.doc.data : []);
    const index = items.findIndex((ticket) => ticket.id === id);
    return getTicketCode(index >= 0 ? index : items.length);
  }

  function getTicketTitle(ticket) {
    const raw = String(ticket?.descricao || "").trim();
    if (!raw) return "Chamado sem descrição";
    const [firstLine] = raw.split(/\r?\n/).filter(Boolean);
    return String(firstLine || raw).slice(0, 110);
  }

  function getTicketSummary(ticket) {
    const raw = String(ticket?.descricao || "").trim().replace(/\s+/g, " ");
    if (!raw) return "";
    const title = getTicketTitle(ticket);
    const summary = raw.startsWith(title) ? raw.slice(title.length).trim() : raw;
    if (!summary) return "";
    return summary.slice(0, 200);
  }

  function renderTicketFunctionTabs() {
    const el = document.getElementById("ticketFunctionTabs");
    if (!el) return;

    const items = ["__all__", ...TICKET_FUNCTIONS];
    el.innerHTML = items.map((funcao) => `
      <button
        class="ticketTab ${funcao === dashboardTicketsState.selectedFunction ? "is-active" : ""}"
        type="button"
        data-ticket-function="${escapeHTML(funcao)}"
      >
        ${escapeHTML(funcao === "__all__" ? "Todos" : funcao)}
      </button>
    `).join("");
  }

  function renderTicketComposerMeta() {
    const functionEl = document.getElementById("ticketSelectedFunction");
    const authorEl = document.getElementById("ticketOpenedBy");
    const boardTitleEl = document.getElementById("ticketBoardTitle");
    const functionSelectEl = document.getElementById("ticketFunctionSelect");
    const searchEl = document.querySelector(".ticketSearch");
    const descriptionEl = document.getElementById("ticketDescription");
    const countEl = document.getElementById("ticketDescriptionCount");
    const selectedLabel = dashboardTicketsState.selectedFunction === "__all__" ? "Todas as funções" : dashboardTicketsState.selectedFunction;
    if (functionEl) functionEl.textContent = `Função: ${selectedLabel}`;
    if (authorEl) authorEl.textContent = `Solicitante: ${currentTicketAuthorName()}${currentTicketAuthorEmail() ? ` • ${currentTicketAuthorEmail()}` : ""}`;
    if (boardTitleEl) boardTitleEl.textContent = `${selectedLabel} • fila de chamados`;
    if (functionSelectEl && dashboardTicketsState.selectedFunction !== "__all__") functionSelectEl.value = dashboardTicketsState.selectedFunction;
    if (searchEl && searchEl.value !== dashboardTicketsState.searchTerm) searchEl.value = dashboardTicketsState.searchTerm;
    if (countEl) countEl.textContent = `${String(descriptionEl?.value || "").length}/1000`;
  }

  function renderTicketImagePreview() {
    const wrap = document.getElementById("ticketImagePreviewWrap");
    const img = document.getElementById("ticketImagePreview");
    const statusEl = document.getElementById("ticketImageStatus");
    if (!wrap || !img) return;

    if (!dashboardTicketsState.imageDataUrl) {
      wrap.classList.add("is-hidden");
      img.removeAttribute("src");
      if (statusEl) statusEl.textContent = "Sem imagem anexada";
      return;
    }

    img.src = dashboardTicketsState.imageDataUrl;
    wrap.classList.remove("is-hidden");
    if (statusEl) statusEl.textContent = "Imagem pronta para envio";
  }

  function currentTicketFunctionForCreate() {
    const functionSelectEl = document.getElementById("ticketFunctionSelect");
    const selectedFromField = String(functionSelectEl?.value || "").trim();
    if (selectedFromField) return selectedFromField;
    if (dashboardTicketsState.selectedFunction && dashboardTicketsState.selectedFunction !== "__all__") {
      return dashboardTicketsState.selectedFunction;
    }
    return TICKET_FUNCTIONS[0];
  }

  function renderTickets() {
    renderTicketFunctionTabs();
    renderTicketComposerMeta();
    renderTicketImagePreview();

    const el = document.getElementById("ticketsList");
    const queueCountEl = document.getElementById("ticketQueueCount");
    const functionCountEl = document.getElementById("ticketFunctionCount");
    const summaryEl = document.getElementById("ticketDeskSummary");
    if (!el) return;

    const allTickets = sortTickets(Array.isArray(dashboardTicketsState.doc?.data) ? dashboardTicketsState.doc.data : []);
    const tickets = filteredTicketsForSelectedFunction();
    if (queueCountEl) queueCountEl.textContent = `${allTickets.length} chamados`;
    const selectedLabel = dashboardTicketsState.selectedFunction === "__all__" ? "Todas" : dashboardTicketsState.selectedFunction;
    if (functionCountEl) {
      const sourceLabel =
        dashboardTicketsState.ticketsSource === "clickup"
          ? "ClickUp ao vivo"
          : dashboardTicketsState.ticketsSource === "mirror"
            ? "Espelho do ContHub"
            : "Fallback local";
      functionCountEl.textContent = `${tickets.length} em ${selectedLabel} • ${sourceLabel}`;
    }
    if (summaryEl) {
      const openCount = tickets.filter((ticket) => ticket.status === "aberto").length;
      const progressCount = tickets.filter((ticket) => ticket.status === "em_andamento").length;
      const waitingCount = tickets.filter((ticket) => ticket.status === "aguardando").length;
      const urgentCount = tickets.filter((ticket) => ticket.urgencia === "critica" || ticket.urgencia === "alta").length;
      summaryEl.innerHTML = `
        <span class="ticketDeskSummary__item"><strong>${tickets.length}</strong><span>na fila</span></span>
        <span class="ticketDeskSummary__item"><strong>${openCount}</strong><span>abertos</span></span>
        <span class="ticketDeskSummary__item"><strong>${progressCount}</strong><span>em andamento</span></span>
        <span class="ticketDeskSummary__item"><strong>${waitingCount}</strong><span>aguardando</span></span>
        <span class="ticketDeskSummary__item ${urgentCount ? "is-hot" : ""}"><strong>${urgentCount}</strong><span>prioridade alta</span></span>
      `;
    }
    if (!tickets.length) {
      el.innerHTML = `<div class="tickets__empty">Nenhum chamado aberto para ${escapeHTML(selectedLabel)} ainda.</div>`;
      return;
    }

    el.innerHTML = tickets.map((ticket) => `
      <article class="ticket ticket--desk" data-ticket-id="${escapeHTML(ticket.id)}" data-status="${escapeHTML(ticket.status)}">
        <div class="ticketDeskRow__task">
          <div class="ticketDeskRow__check" aria-hidden="true"></div>
          <div class="ticketDeskRow__copy">
            <div class="ticketDeskRow__title">${escapeHTML(getTicketTitle(ticket))}</div>
            ${getTicketSummary(ticket) ? `<div class="ticketDeskRow__summary">${escapeHTML(getTicketSummary(ticket))}</div>` : ""}
          </div>
        </div>
        <div class="ticketDeskRow__status">
          <span class="ticket__badge ${escapeHTML(ticketStatusClass(ticket.status))}">${escapeHTML(ticketStatusLabel(ticket.status))}</span>
        </div>
        <div class="ticketDeskRow__priority">
          <span class="ticket__badge ticket__badge--urgency-${escapeHTML(ticket.urgencia)}">${escapeHTML(ticketPriorityLabel(ticket.urgencia))}</span>
        </div>
        <div class="ticketDeskRow__owner">${escapeHTML(ticket.solicitanteNome || "Usuário")}</div>
        <div class="ticketDeskRow__assignee">${escapeHTML(ticket.assigneeName || "Central TI")}</div>
        <div class="ticketDeskRow__updated">${escapeHTML(formatRelativeOrDate(ticket.updatedAt))}</div>
      </article>
    `).join("");
  }

  function renderTiTickets() {
    const panel = document.getElementById("tiTicketsPanel");
    const shortcut = document.getElementById("shortcutTiTickets");
    const list = document.getElementById("tiTicketsList");
    const tiMode = isTiUser();

    if (panel) panel.classList.toggle("is-hidden", !tiMode);
    if (shortcut) shortcut.classList.toggle("is-hidden", !tiMode);
    if (!list) return;

    if (!tiMode) {
      list.innerHTML = "";
      return;
    }

    const tickets = sortTickets(Array.isArray(dashboardTicketsState.doc?.data) ? dashboardTicketsState.doc.data : []);
    if (!tickets.length) {
      list.innerHTML = `<div class="tickets__empty">Nenhum chamado registrado ainda.</div>`;
      return;
    }

    list.innerHTML = tickets.map((ticket) => `
      <article class="tiTicket" data-ti-ticket-id="${escapeHTML(ticket.id)}">
        <div class="tiTicket__main">
          <div class="tiTicket__top">
            <span class="ticket__badge ${escapeHTML(ticketStatusClass(ticket.status))}">${escapeHTML(ticketStatusLabel(ticket.status))}</span>
            <span class="ticket__badge ticket__badge--urgency-${escapeHTML(ticket.urgencia)}">${escapeHTML(ticketPriorityLabel(ticket.urgencia))}</span>
            <span class="ticket__badge">${escapeHTML(ticket.funcao)}</span>
            <span class="ticket__badge">ClickUp</span>
          </div>

          <div class="tiTicket__title">${escapeHTML(getTicketCodeById(ticket.id))} • ${escapeHTML(getTicketTitle(ticket))}</div>
          ${getTicketSummary(ticket) ? `<div class="tiTicket__desc">${escapeHTML(getTicketSummary(ticket))}</div>` : ""}

          <div class="ticket__facts ticket__facts--ti">
            <div class="ticket__fact">
              <span class="ticket__factLabel">Solicitante</span>
              <strong>${escapeHTML(ticket.solicitanteNome || "Usuário")}</strong>
            </div>
            <div class="ticket__fact">
              <span class="ticket__factLabel">Email</span>
              <strong>${escapeHTML(ticket.solicitanteEmail || "--")}</strong>
            </div>
            <div class="ticket__fact">
              <span class="ticket__factLabel">Criado em</span>
              <strong>${escapeHTML(formatDateTimeBR(ticket.createdAt))}</strong>
            </div>
            <div class="ticket__fact">
              <span class="ticket__factLabel">Última atualização</span>
              <strong>${escapeHTML(formatDateTimeBR(ticket.updatedAt))}</strong>
            </div>
          </div>
        </div>

        <div class="ticket__side">
          <div class="tiTicket__meta">
            <span class="tiTicket__metaLabel">Urgência</span>
            <strong>${escapeHTML(ticketPriorityLabel(ticket.urgencia))}</strong>
          </div>

          <div class="tiTicket__meta">
            <span class="tiTicket__metaLabel">Status</span>
            <select class="ticket__status" data-ti-ticket-status="${escapeHTML(ticket.id)}">
              ${TICKET_STATUSES.map((status) => `
                <option value="${status}" ${status === ticket.status ? "selected" : ""}>${escapeHTML(ticketStatusLabel(status))}</option>
              `).join("")}
            </select>
          </div>

          ${ticket.imagem ? `
            <img class="tiTicket__image" src="${ticket.imagem}" alt="Anexo do chamado" />
            <a class="ticket__link" href="${escapeHTML(ticket.imagem)}" target="_blank" rel="noreferrer">Abrir anexo</a>
          ` : `
            <div class="ticket__ghost ticket__ghost--ti">
              <span class="ticket__ghostIcon">🗂</span>
              <span>Sem anexo</span>
            </div>
          `}

          <div class="tiTicket__actions">
            <button class="btn btn--ghost" type="button" data-ti-ticket-delete="${escapeHTML(ticket.id)}">Excluir</button>
          </div>
        </div>
      </article>
    `).join("");
  }

  function clearTicketComposer() {
    const descriptionEl = document.getElementById("ticketDescription");
    const priorityEl = document.getElementById("ticketPriority");
    const fileEl = document.getElementById("ticketImageInput");

    if (descriptionEl) descriptionEl.value = "";
    if (priorityEl) priorityEl.value = "media";
    if (fileEl) fileEl.value = "";
    dashboardTicketsState.imageDataUrl = "";
    renderTicketImagePreview();
  }

  async function refreshTickets({ force = false } = {}) {
    if (!force && dashboardTicketsState.refreshPromise) {
      return dashboardTicketsState.refreshPromise;
    }

    const run = (async () => {
      await loadNextActionsClickupFeed({ force });
      const doc = await loadTicketsDocument();
      const signature = getTicketsSignature(doc);
      const changed = force || dashboardTicketsState.lastSignature !== signature;
      const hadKnownTickets = dashboardTicketsState.knownIds.size > 0;
      const newTickets = detectNewTickets(doc);

      dashboardTicketsState.doc = doc;
      dashboardTicketsState.lastSignature = signature;

      if (hadKnownTickets && newTickets.length) {
        showTicketToasts(newTickets);
        notifyForNewTickets(newTickets);
      }

      if (changed) {
        renderTickets();
        renderTiTickets();
        await renderNextActions();
      } else {
        renderTiTickets();
        await renderNextActions();
      }
    })();

    dashboardTicketsState.refreshPromise = run;

    try {
      await run;
    } finally {
      if (dashboardTicketsState.refreshPromise === run) {
        dashboardTicketsState.refreshPromise = null;
      }
    }
  }

  async function createTicket() {
    const descriptionEl = document.getElementById("ticketDescription");
    const priorityEl = document.getElementById("ticketPriority");

    const descricao = String(descriptionEl?.value || "").trim().slice(0, 1000);
    if (!descricao) {
      alert("Preencha a descrição do chamado antes de abrir.");
      descriptionEl?.focus();
      return;
    }

    const ticketPayload = {
      funcao: currentTicketFunctionForCreate(),
      descricao,
      urgencia: String(priorityEl?.value || "media").trim().toLowerCase(),
      imagem: dashboardTicketsState.imageDataUrl,
    };

    try {
      const createdTicket = await createTicketViaApi(ticketPayload);
      const currentDoc = normalizeTicketsDocument(dashboardTicketsState.doc || emptyTicketsDocument());
      currentDoc.data = [
        normalizeTicketRecord(createdTicket),
        ...currentDoc.data.filter((ticket) => ticket.id !== createdTicket?.id),
      ].filter(Boolean);
      await saveTicketsMirrorSnapshot(currentDoc);
      clearTicketComposer();
      await refreshTickets({ force: true });
      return;
    } catch (err) {
      console.warn("Falha ao criar chamado via API remota, usando fallback local:", err);
    }

    const nextDoc = normalizeTicketsDocument(dashboardTicketsState.doc || emptyTicketsDocument());
    nextDoc.data.push(normalizeTicketRecord({
      id: `tk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      ...ticketPayload,
      status: "aberto",
      solicitanteNome: currentTicketAuthorName(),
      solicitanteEmail: currentTicketAuthorEmail(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    await saveTicketsDocument(nextDoc);
    dashboardTicketsState.lastSignature = getTicketsSignature(nextDoc);
    clearTicketComposer();
    renderTickets();
    renderTiTickets();
  }

  async function clearClosedTickets() {
    try {
      await clearClosedTicketsViaApi();
      const currentDoc = normalizeTicketsDocument(dashboardTicketsState.doc || emptyTicketsDocument());
      currentDoc.data = currentDoc.data.filter((ticket) => ticket.status !== "concluido");
      await saveTicketsMirrorSnapshot(currentDoc);
      await refreshTickets({ force: true });
      return;
    } catch (err) {
      console.warn("Falha ao limpar chamados concluídos via API remota, usando fallback local:", err);
    }

    const currentDoc = normalizeTicketsDocument(dashboardTicketsState.doc || emptyTicketsDocument());
    const nextItems = currentDoc.data.filter((ticket) => {
      if (ticket.status !== "concluido") return true;
      if (!isTiUser()) return ticket.funcao !== dashboardTicketsState.selectedFunction;
      return false;
    });

    currentDoc.data = nextItems;
    await saveTicketsDocument(currentDoc);
    dashboardTicketsState.lastSignature = getTicketsSignature(currentDoc);
    renderTickets();
    renderTiTickets();
  }

  async function updateTiTicketStatus(ticketId, nextStatus) {
    try {
      await updateTicketStatusViaApi(ticketId, nextStatus);
      const currentDoc = normalizeTicketsDocument(dashboardTicketsState.doc || emptyTicketsDocument());
      const target = currentDoc.data.find((ticket) => ticket.id === ticketId);
      if (target) {
        target.status = TICKET_STATUSES.includes(String(nextStatus || "").trim().toLowerCase())
          ? String(nextStatus || "").trim().toLowerCase()
          : target.status;
        target.updatedAt = new Date().toISOString();
        await saveTicketsMirrorSnapshot(currentDoc);
      }
      await refreshTickets({ force: true });
      return;
    } catch (err) {
      console.warn("Falha ao atualizar status via API remota, usando fallback local:", err);
    }

    const currentDoc = normalizeTicketsDocument(dashboardTicketsState.doc || emptyTicketsDocument());
    const target = currentDoc.data.find((ticket) => ticket.id === ticketId);
    if (!target) return;

    target.status = TICKET_STATUSES.includes(String(nextStatus || "").trim().toLowerCase())
      ? String(nextStatus || "").trim().toLowerCase()
      : target.status;
    target.updatedAt = new Date().toISOString();

    await saveTicketsDocument(currentDoc);
    dashboardTicketsState.lastSignature = getTicketsSignature(currentDoc);
    renderTickets();
    renderTiTickets();
  }

  async function deleteTiTicket(ticketId) {
    try {
      await deleteTicketViaApi(ticketId);
      const currentDoc = normalizeTicketsDocument(dashboardTicketsState.doc || emptyTicketsDocument());
      currentDoc.data = currentDoc.data.filter((ticket) => ticket.id !== ticketId);
      await saveTicketsMirrorSnapshot(currentDoc);
      await refreshTickets({ force: true });
      return;
    } catch (err) {
      console.warn("Falha ao excluir chamado via API remota, usando fallback local:", err);
    }

    const currentDoc = normalizeTicketsDocument(dashboardTicketsState.doc || emptyTicketsDocument());
    currentDoc.data = currentDoc.data.filter((ticket) => ticket.id !== ticketId);
    await saveTicketsDocument(currentDoc);
    dashboardTicketsState.lastSignature = getTicketsSignature(currentDoc);
    renderTickets();
    renderTiTickets();
  }

  function bindTicketButtons() {
    const tabsEl = document.getElementById("ticketFunctionTabs");
    const btnRefresh = document.getElementById("btnResetTickets");
    const btnCreate = document.getElementById("btnCreateTicket");
    const btnClearImage = document.getElementById("btnClearTicketImage");
    const btnClearClosed = document.getElementById("btnClearClosedTickets");
    const btnRefreshTi = document.getElementById("btnRefreshTiTickets");
    const shortcutTi = document.getElementById("shortcutTiTickets");
    const fileInput = document.getElementById("ticketImageInput");
    const btnPickImage = document.getElementById("btnPickTicketImage");
    const tiList = document.getElementById("tiTicketsList");
    const functionSelect = document.getElementById("ticketFunctionSelect");
    const searchInput = document.querySelector(".ticketSearch");

    if (tabsEl && !tabsEl.__bound) {
      tabsEl.__bound = true;
      tabsEl.addEventListener("click", (e) => {
        const tab = e.target.closest("[data-ticket-function]");
        if (!tab) return;
        dashboardTicketsState.selectedFunction = String(tab.getAttribute("data-ticket-function") || "").trim() || TICKET_FUNCTIONS[0];
        renderTickets();
      });
    }

    if (functionSelect && !functionSelect.__bound) {
      functionSelect.__bound = true;
      functionSelect.addEventListener("change", () => {
        const nextFunction = String(functionSelect.value || "").trim();
        dashboardTicketsState.selectedFunction = nextFunction || TICKET_FUNCTIONS[0];
        renderTickets();
      });
    }

    const descriptionInput = document.getElementById("ticketDescription");
    if (descriptionInput && !descriptionInput.__bound) {
      descriptionInput.__bound = true;
      descriptionInput.addEventListener("input", () => {
        renderTicketComposerMeta();
      });
    }

    if (searchInput && !searchInput.__bound) {
      searchInput.__bound = true;
      searchInput.addEventListener("input", () => {
        dashboardTicketsState.searchTerm = String(searchInput.value || "");
        renderTickets();
      });
    }

    if (btnRefresh && !btnRefresh.__bound) {
      btnRefresh.__bound = true;
      btnRefresh.addEventListener("click", async () => {
        ensureTicketNotificationPermission().catch(() => {});
        await refreshTickets({ force: true });
      });
    }

    if (btnCreate && !btnCreate.__bound) {
      btnCreate.__bound = true;
      btnCreate.addEventListener("click", async () => {
        ensureTicketNotificationPermission().catch(() => {});
        await createTicket();
      });
    }

    if (btnClearImage && !btnClearImage.__bound) {
      btnClearImage.__bound = true;
      btnClearImage.addEventListener("click", () => {
        clearTicketComposer();
      });
    }

    if (btnPickImage && !btnPickImage.__bound) {
      btnPickImage.__bound = true;
      btnPickImage.addEventListener("click", () => {
        fileInput?.click();
      });
    }

    if (btnClearClosed && !btnClearClosed.__bound) {
      btnClearClosed.__bound = true;
      btnClearClosed.addEventListener("click", async () => {
        await clearClosedTickets();
      });
    }

    if (btnRefreshTi && !btnRefreshTi.__bound) {
      btnRefreshTi.__bound = true;
      btnRefreshTi.addEventListener("click", async () => {
        ensureTicketNotificationPermission().catch(() => {});
        await refreshTickets({ force: true });
      });
    }

    if (shortcutTi && !shortcutTi.__bound) {
      shortcutTi.__bound = true;
      shortcutTi.addEventListener("click", () => {
        document.getElementById("tiTicketsPanel")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }

    if (fileInput && !fileInput.__bound) {
      fileInput.__bound = true;
      fileInput.addEventListener("change", () => {
        const file = fileInput.files?.[0];
        if (!file) {
          dashboardTicketsState.imageDataUrl = "";
          renderTicketImagePreview();
          return;
        }

        if (file.size > MAX_TICKET_IMAGE_SIZE) {
          alert("A imagem está muito grande. Use um arquivo de até 2 MB.");
          fileInput.value = "";
          dashboardTicketsState.imageDataUrl = "";
          renderTicketImagePreview();
          return;
        }

        const reader = new FileReader();
        reader.onload = () => {
          dashboardTicketsState.imageDataUrl = typeof reader.result === "string" ? reader.result : "";
          renderTicketImagePreview();
        };
        reader.readAsDataURL(file);
      });
    }

    if (tiList && !tiList.__bound) {
      tiList.__bound = true;
      tiList.addEventListener("change", async (e) => {
        const select = e.target.closest("[data-ti-ticket-status]");
        if (!select) return;
        await updateTiTicketStatus(
          String(select.getAttribute("data-ti-ticket-status") || "").trim(),
          String(select.value || "").trim().toLowerCase()
        );
      });

      tiList.addEventListener("click", async (e) => {
        const delBtn = e.target.closest("[data-ti-ticket-delete]");
        if (!delBtn) return;
        const ok = confirm("Excluir este chamado da central?");
        if (!ok) return;
        await deleteTiTicket(String(delBtn.getAttribute("data-ti-ticket-delete") || "").trim());
      });
    }
  }

  function startTicketsSyncLoop() {
    if (dashboardTicketsState.pollTimer) clearInterval(dashboardTicketsState.pollTimer);
    dashboardTicketsState.pollTimer = setInterval(() => {
      refreshTickets().catch((err) => console.warn("Falha ao sincronizar chamados:", err));
    }, TICKETS_POLL_INTERVAL_MS);

    if (!dashboardTicketsState.visibilityBound) {
      dashboardTicketsState.visibilityBound = true;
      ensureTicketNotificationPermission().catch(() => {});
      document.addEventListener("visibilitychange", () => {
        refreshTickets().catch((err) => console.warn("Falha ao sincronizar chamados:", err));
      });
    }
  }

  // ----------------------------
  // CONTFLOW SNAPSHOT/FEED (POSTGRES)
  // ----------------------------
  function contFlowSnapshotKeyLegacy() {
    return CF_SNAPSHOT_PREFIX + getUserKey();
  }

  function contFlowFeedKeyLegacy() {
    return CF_FEED_PREFIX + getUserKey();
  }

  function loadContFlowData() {
    const raw = localStorage.getItem(CONTFLOW_KEY);
    if (!raw) return [];
    const data = safeJSONParse(raw, []);
    return Array.isArray(data) ? data : [];
  }

  function getContFlowQuarterSheets() {
    return CONTFLOW_QUARTER_SHEETS.map((item) => ({ ...item }));
  }

  function findContFlowCellValue(cellsMap, rowId, keys) {
    const rowKey = String(rowId || "").trim();
    if (!rowKey || !cellsMap || !(cellsMap instanceof Map)) return "";

    const candidateKeys = Array.isArray(keys) ? keys : [keys];
    for (const candidate of candidateKeys) {
      const colKey = String(candidate || "").trim();
      if (!colKey) continue;
      const cell = cellsMap.get(`${rowKey}::${colKey}`);
      if (cell && cell.value != null) return String(cell.value);
    }

    return "";
  }

  function normalizeContFlowSheetPayload(payload, sheetKey) {
    if (
      !payload ||
      !Array.isArray(payload.columns) ||
      !Array.isArray(payload.rows) ||
      !Array.isArray(payload.cells)
    ) {
      return null;
    }

    const columns = payload.columns
      .map((col, index) => ({
        id: col?.id ?? null,
        key: String(col?.key || "").trim(),
        label: String(col?.label || "").trim(),
        order: Number.isFinite(Number(col?.order)) ? Number(col.order) : index,
      }))
      .filter((col) => col.key);

    const columnAliasMap = new Map();
    columns.forEach((col) => {
      columnAliasMap.set(col.key, col.key);

      const normalizedLabel = normalizeColumnLabel(col.label);
      if (!normalizedLabel) return;

      if (/^cod|^codigo/.test(normalizedLabel)) columnAliasMap.set("cod", col.key);
      if (/razao social/.test(normalizedLabel)) columnAliasMap.set("razao_social", col.key);
      if (/cnpj|cpf/.test(normalizedLabel)) columnAliasMap.set("cnpj_cpf", col.key);
      if (/^tipo\b/.test(normalizedLabel)) columnAliasMap.set("tipo", col.key);
      if (/quota\s*1|1 quota/.test(normalizedLabel)) columnAliasMap.set("quota1", col.key);
      if (/quota\s*2|2 quota/.test(normalizedLabel)) columnAliasMap.set("quota2", col.key);
      if (/quota\s*3|3 quota/.test(normalizedLabel)) columnAliasMap.set("quota3", col.key);
    });

    const cellsMap = new Map();
    payload.cells.forEach((cell) => {
      const rowId = String(cell?.rowId || "").trim();
      const colKey = String(cell?.colKey || "").trim();
      if (!rowId || !colKey) return;
      cellsMap.set(`${rowId}::${colKey}`, {
        value: cell?.value == null ? "" : String(cell.value),
        updatedAt: cell?.updatedAt ? String(cell.updatedAt) : "",
        updatedBy: cell?.updatedBy || null,
      });
    });

    const rows = payload.rows.map((row, index) => {
      const rowId = String(row?.id || row?.clientRowId || "").trim();
      const resolved = {
        __sheetKey: sheetKey,
        __rowId: rowId,
        __clientRowId: String(row?.clientRowId || "").trim(),
        __order: Number.isFinite(Number(row?.order)) ? Number(row.order) : index,
      };

      columns.forEach((col) => {
        resolved[col.key] = findContFlowCellValue(cellsMap, rowId, col.key);
      });

      resolved.cod = findContFlowCellValue(cellsMap, rowId, [
        columnAliasMap.get("cod"),
        "cod",
      ]);
      resolved.razao_social = findContFlowCellValue(cellsMap, rowId, [
        columnAliasMap.get("razao_social"),
        "razao_social",
      ]);
      resolved.cnpj_cpf = findContFlowCellValue(cellsMap, rowId, [
        columnAliasMap.get("cnpj_cpf"),
        "cnpj_cpf",
      ]);
      resolved.tipo = findContFlowCellValue(cellsMap, rowId, [
        columnAliasMap.get("tipo"),
        "tipo",
      ]);
      resolved.quota1 = findContFlowCellValue(cellsMap, rowId, [
        columnAliasMap.get("quota1"),
        "quota1",
      ]);
      resolved.quota2 = findContFlowCellValue(cellsMap, rowId, [
        columnAliasMap.get("quota2"),
        "quota2",
      ]);
      resolved.quota3 = findContFlowCellValue(cellsMap, rowId, [
        columnAliasMap.get("quota3"),
        "quota3",
      ]);

      resolved.__search = normalizeSearchText([
        resolved.cod,
        resolved.razao_social,
        resolved.cnpj_cpf,
        resolved.tipo,
      ].filter(Boolean).join(" "));

      return resolved;
    });

    rows.sort((a, b) => a.__order - b.__order);

    return {
      sheetKey,
      columns,
      rows,
      cellsMap,
      columnAliasMap,
      fetchedAt: new Date().toISOString(),
    };
  }

  async function loadContFlowSheetForQuotaModal(sheetKey, { force = false } = {}) {
    const safeSheetKey = String(sheetKey || "contflow").trim() || "contflow";
    if (!force && dashboardQuotaModalState.sheets.has(safeSheetKey)) {
      return dashboardQuotaModalState.sheets.get(safeSheetKey);
    }

    const resp = await apiFetch(`${API_BASE}/api/sheets/${encodeURIComponent(safeSheetKey)}`, {
      method: "GET",
    });
    const data = await resp?.json().catch(() => null);
    if (!resp || !resp.ok) {
      throw new Error(data?.error || `Falha ao carregar ${safeSheetKey}.`);
    }

    const normalized = normalizeContFlowSheetPayload(data, safeSheetKey);
    if (!normalized) {
      throw new Error("A base do ContFlow veio em formato inválido.");
    }

    dashboardQuotaModalState.sheets.set(safeSheetKey, normalized);
    return normalized;
  }

  function loadContFlowSnapshotLegacy() {
    const raw = localStorage.getItem(contFlowSnapshotKeyLegacy());
    if (!raw) return null;
    const snap = safeJSONParse(raw, null);
    return snap && typeof snap === "object" ? snap : null;
  }

  function saveContFlowSnapshotLegacy(snapshot) {
    localStorage.setItem(contFlowSnapshotKeyLegacy(), JSON.stringify(snapshot));
  }

  function loadContFlowFeedLegacy() {
    const raw = localStorage.getItem(contFlowFeedKeyLegacy());
    const arr = safeJSONParse(raw, []);
    return Array.isArray(arr) ? arr : [];
  }

  function pushContFlowFeedItemLegacy(item) {
    const feed = loadContFlowFeedLegacy();
    feed.unshift(item);
    localStorage.setItem(contFlowFeedKeyLegacy(), JSON.stringify(feed.slice(0, 12)));
  }

  async function getContFlowSnapshot({ force = false } = {}) {
    if (!force && contFlowSnapshotCache) {
      return cloneState(contFlowSnapshotCache);
    }

    try {
      const resp = await apiFetch("/api/dashboard/contflow-snapshot", { method: "GET" });
      if (!resp || !resp.ok) throw new Error("GET snapshot failed");
      const snap = await resp.json().catch(() => null);
      contFlowSnapshotCache = snap && typeof snap === "object" ? snap : null;
      return cloneState(contFlowSnapshotCache);
    } catch {
      contFlowSnapshotCache = loadContFlowSnapshotLegacy();
      return cloneState(contFlowSnapshotCache);
    }
  }

  async function saveContFlowSnapshot(snapshot) {
    contFlowSnapshotCache = snapshot && typeof snapshot === "object" ? cloneState(snapshot) : null;
    saveContFlowSnapshotLegacy(snapshot);

    try {
      const resp = await apiFetch("/api/dashboard/contflow-snapshot", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshot || {}),
      });

      if (!resp || !resp.ok) throw new Error("PUT snapshot failed");
      return true;
    } catch {
      return false;
    }
  }

  async function getContFlowFeed({ force = false } = {}) {
    if (!force && contFlowFeedCache) {
      return cloneState(contFlowFeedCache);
    }

    try {
      const resp = await apiFetch("/api/dashboard/contflow-feed", { method: "GET" });
      if (!resp || !resp.ok) throw new Error("GET feed failed");
      const feed = await resp.json().catch(() => []);
      contFlowFeedCache = Array.isArray(feed) ? feed : [];
      return cloneState(contFlowFeedCache);
    } catch {
      contFlowFeedCache = loadContFlowFeedLegacy();
      return cloneState(contFlowFeedCache);
    }
  }

  async function pushContFlowFeedItem(item) {
    const currentFeed = Array.isArray(contFlowFeedCache) ? contFlowFeedCache.slice() : loadContFlowFeedLegacy();
    currentFeed.unshift(item);
    contFlowFeedCache = currentFeed.slice(0, 12);
    pushContFlowFeedItemLegacy(item);

    try {
      const resp = await apiFetch("/api/dashboard/contflow-feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item || {}),
      });

      if (!resp || !resp.ok) throw new Error("POST feed failed");
      return true;
    } catch {
      return false;
    }
  }

  function normalizeRowForCompare(row) {
    if (!row || typeof row !== "object") return {};
    const copy = { ...row };
    delete copy._ui;
    delete copy.__temp;
    return copy;
  }

  function rowId(row, idxFallback) {
    const id =
      row?.id ??
      row?.__id ??
      row?.codigo ??
      row?.cod ??
      row?.cnpj ??
      row?.empresa ??
      row?.razao_social ??
      null;

    if (id != null && String(id).trim() !== "") return String(id).trim();
    return "idx:" + String(idxFallback);
  }

  function diffContFlow(oldArr, newArr) {
    const oldMap = new Map();
    const newMap = new Map();

    (oldArr || []).forEach((r, i) => oldMap.set(rowId(r, i), normalizeRowForCompare(r)));
    (newArr || []).forEach((r, i) => newMap.set(rowId(r, i), normalizeRowForCompare(r)));

    let added = 0;
    let removed = 0;
    let changed = 0;

    for (const [id, newRow] of newMap.entries()) {
      if (!oldMap.has(id)) added++;
      else {
        const oldRow = oldMap.get(id);
        if (JSON.stringify(oldRow) !== JSON.stringify(newRow)) changed++;
      }
    }

    for (const [id] of oldMap.entries()) {
      if (!newMap.has(id)) removed++;
    }

    return { added, removed, changed };
  }

  async function computeContFlowNewsAndSaveSnapshot() {
    const current = loadContFlowData();
    const oldSnap = await getContFlowSnapshot();
    const nowISO = new Date().toISOString();

    const newSnap = { ts: nowISO, count: current.length, data: current };

    if (!oldSnap || !Array.isArray(oldSnap.data)) {
      await saveContFlowSnapshot(newSnap);
      return null;
    }

    const d = diffContFlow(oldSnap.data, current);

    await saveContFlowSnapshot(newSnap);

    if (d.added || d.changed || d.removed) {
      const msg = `+${d.added} novo(s) · ✏️ ${d.changed} alterado(s) · 🗑️ ${d.removed} removido(s)`;
      await pushContFlowFeedItem({ ts: nowISO, title: "Atualização no ContFlow", desc: msg });
      return { ...d, msg };
    }

    return { ...d, msg: "Sem alterações detectadas." };
  }

  async function renderContFlowNewsBadge() {
    const elText = document.getElementById("contflowNewsText");
    const elFeed = document.getElementById("contflowNewsFeed");

    const [snap, feed] = await Promise.all([
      getContFlowSnapshot(),
      getContFlowFeed(),
    ]);

    if (elText) {
      if (!snap) {
        elText.textContent = "ContFlow: sem snapshot ainda.";
      } else {
        const dt = new Date(snap.ts);
        const label = isNaN(dt.getTime()) ? String(snap.ts || "") : dt.toLocaleString("pt-BR");
        elText.textContent = `ContFlow: ${snap.count || 0} linha(s) • Última atualização: ${label}`;
      }
    }

    if (elFeed) {
      if (!feed.length) {
        elFeed.innerHTML = `<div style="opacity:.7;font-size:12px;">Sem novidades registradas.</div>`;
      } else {
        elFeed.innerHTML = feed
          .slice(0, 5)
          .map((x) => {
            const dt = new Date(x.ts);
            const when = isNaN(dt.getTime())
              ? ""
              : dt.toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit" });

            return `
              <div style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,.06);">
                <div style="font-weight:700;font-size:12px;">${escapeHTML(x.title || "Atualização")}</div>
                <div style="opacity:.85;font-size:12px;">${escapeHTML(x.desc || "")}</div>
                <div style="opacity:.6;font-size:11px;margin-top:2px;">${escapeHTML(when)}</div>
              </div>
            `;
          })
          .join("");
      }
    }
  }

  function getQuotaModalElements() {
    return {
      backdrop: document.getElementById("quotaModalBackdrop"),
      openBtn: document.getElementById("btnOpenQuotaModal"),
      closeBtn: document.getElementById("btnCloseQuotaModal"),
      cancelBtn: document.getElementById("btnQuotaModalCancel"),
      saveBtn: document.getElementById("btnQuotaModalSave"),
      quarter: document.getElementById("quotaModalQuarter"),
      search: document.getElementById("quotaModalCompanySearch"),
      company: document.getElementById("quotaModalCompanySelect"),
      preview: document.getElementById("quotaModalPreview"),
      stage: document.getElementById("quotaModalQuotaStage"),
      mode: document.getElementById("quotaModalMode"),
      dateWrap: document.getElementById("quotaModalDateWrap"),
      date: document.getElementById("quotaModalDate"),
      textWrap: document.getElementById("quotaModalTextWrap"),
      text: document.getElementById("quotaModalText"),
      status: document.getElementById("quotaModalStatus"),
    };
  }

  function getQuotaStageLabel(stage) {
    if (stage === "quota2") return "2º quota";
    if (stage === "quota3") return "3º quota";
    return "1º quota";
  }

  function buildQuotaModalCompanyLabel(row) {
    const bits = [
      String(row?.cod || "").trim(),
      String(row?.razao_social || "").trim(),
      String(row?.cnpj_cpf || "").trim(),
    ].filter(Boolean);
    return bits.join(" · ") || "Empresa sem identificação";
  }

  function getQuotaModalCurrentSheet() {
    return dashboardQuotaModalState.sheets.get(dashboardQuotaModalState.sheetKey) || null;
  }

  function getQuotaModalSelectedRow() {
    const { company } = getQuotaModalElements();
    const selectedRowId = String(company?.value || "").trim();
    if (!selectedRowId) return null;
    const sheet = getQuotaModalCurrentSheet();
    return sheet?.rows.find((row) => String(row.__rowId || "") === selectedRowId) || null;
  }

  function updateQuotaModalStatus(message, tone = "") {
    const { status } = getQuotaModalElements();
    if (!status) return;
    status.textContent = String(message || "").trim();
    status.setAttribute("data-tone", tone || "");
  }

  function syncQuotaModalConditionalFields() {
    const { mode, dateWrap, textWrap, date, text } = getQuotaModalElements();
    const currentMode = String(mode?.value || "").trim();
    const showDate = currentMode === "data";
    const showText = currentMode === "outro";

    dateWrap?.classList.toggle("is-hidden", !showDate);
    textWrap?.classList.toggle("is-hidden", !showText);

    if (!showDate && date) date.value = "";
    if (!showText && text) text.value = "";
  }

  function getQuotaModalFilteredRows(sheet, query) {
    if (!sheet || !Array.isArray(sheet.rows)) return [];
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) return sheet.rows.slice(0, 200);
    return sheet.rows
      .filter((row) => String(row.__search || "").includes(normalizedQuery))
      .slice(0, 200);
  }

  function renderQuotaModalCompanies() {
    const { search, company } = getQuotaModalElements();
    const sheet = getQuotaModalCurrentSheet();
    const currentValue = String(company?.value || "").trim();
    const rows = getQuotaModalFilteredRows(sheet, search?.value || "");
    dashboardQuotaModalState.filteredRows = rows;

    if (!company) return;
    company.innerHTML = "";

    rows.forEach((row) => {
      const opt = document.createElement("option");
      opt.value = String(row.__rowId || "");
      opt.textContent = buildQuotaModalCompanyLabel(row);
      company.appendChild(opt);
    });

    if (!rows.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "Nenhuma empresa encontrada.";
      company.appendChild(opt);
      company.value = "";
      return;
    }

    const preferred =
      rows.find((row) => String(row.__rowId || "") === currentValue) ||
      rows[0];
    company.value = String(preferred?.__rowId || "");
  }

  function renderQuotaModalPreview() {
    const { preview, stage, company } = getQuotaModalElements();
    if (!preview) return;

    const row = getQuotaModalSelectedRow();
    if (!row) {
      preview.innerHTML = "Selecione uma empresa para ver as quotas atuais.";
      return;
    }

    const currentStage = String(stage?.value || "quota1").trim() || "quota1";
    const values = [
      { key: "quota1", label: "1º quota", value: String(row.quota1 || "").trim() || "—" },
      { key: "quota2", label: "2º quota", value: String(row.quota2 || "").trim() || "—" },
      { key: "quota3", label: "3º quota", value: String(row.quota3 || "").trim() || "—" },
    ];

    preview.innerHTML = `
      <strong>${escapeHTML(String(row.razao_social || buildQuotaModalCompanyLabel(row)))}</strong>
      <span>Código: ${escapeHTML(String(row.cod || "—"))} • CNPJ/CPF: ${escapeHTML(String(row.cnpj_cpf || "—"))}</span>
      <span>Tipo: ${escapeHTML(String(row.tipo || "—"))}</span>
      <div class="quotaModalPreview__list">
        ${values.map((item) => `
          <div class="quotaModalPreview__item${item.key === currentStage ? " is-active" : ""}">
            <strong>${escapeHTML(item.label)}</strong>
            <span>${escapeHTML(item.value)}</span>
          </div>
        `).join("")}
      </div>
    `;

    if (company && !company.value) {
      company.value = String(row.__rowId || "");
    }
  }

  async function populateQuotaModalForSheet(sheetKey, { force = false } = {}) {
    dashboardQuotaModalState.loading = true;
    updateQuotaModalStatus("Carregando empresas do ContFlow...", "");

    try {
      dashboardQuotaModalState.sheetKey = String(sheetKey || "contflow").trim() || "contflow";
      await loadContFlowSheetForQuotaModal(dashboardQuotaModalState.sheetKey, { force });
      renderQuotaModalCompanies();
      renderQuotaModalPreview();
      updateQuotaModalStatus("Escolha a empresa, a quota e como deseja concluir.", "");
    } catch (err) {
      console.warn("Falha ao carregar base para concluir quota:", err);
      renderQuotaModalCompanies();
      renderQuotaModalPreview();
      updateQuotaModalStatus(err?.message || "Não foi possível carregar a base do ContFlow.", "danger");
    } finally {
      dashboardQuotaModalState.loading = false;
    }
  }

  function setQuotaModalOpen(open) {
    const els = getQuotaModalElements();
    if (!els.backdrop) return;

    const shouldOpen = Boolean(open);
    dashboardQuotaModalState.open = shouldOpen;
    els.backdrop.classList.toggle("is-hidden", !shouldOpen);
    els.backdrop.setAttribute("aria-hidden", shouldOpen ? "false" : "true");

    if (shouldOpen) {
      updateQuotaModalStatus("Preparando base do trimestre...", "");
      syncQuotaModalConditionalFields();
      populateQuotaModalForSheet(els.quarter?.value || dashboardQuotaModalState.sheetKey).finally(() => {
        els.search?.focus();
      });
      return;
    }

    updateQuotaModalStatus("", "");
    if (els.date) els.date.value = "";
    if (els.text) els.text.value = "";
    if (els.search) els.search.value = "";
  }

  function getQuotaModalCompletionValue() {
    const { mode, date, text } = getQuotaModalElements();
    const currentMode = String(mode?.value || "").trim();

    if (currentMode === "compensacao") return "Compensação";
    if (currentMode === "prejuizo") return "Prejuízo";
    if (currentMode === "sm") return "S/M";
    if (currentMode === "data") {
      const formatted = formatDateInputToBR(date?.value || "");
      if (!formatted) throw new Error("Escolha uma data válida para concluir a quota.");
      return formatted;
    }

    const customValue = String(text?.value || "").trim();
    if (!customValue) {
      throw new Error("Digite como deseja concluir a quota.");
    }
    return customValue;
  }

  async function saveQuotaModalConclusion() {
    if (dashboardQuotaModalState.saving) return;

    const els = getQuotaModalElements();
    const row = getQuotaModalSelectedRow();
    const stage = String(els.stage?.value || "quota1").trim() || "quota1";

    if (!row) {
      updateQuotaModalStatus("Escolha uma empresa antes de salvar.", "danger");
      return;
    }

    let value = "";
    try {
      value = getQuotaModalCompletionValue();
    } catch (err) {
      updateQuotaModalStatus(err?.message || "Revise os dados antes de salvar.", "danger");
      return;
    }

    const sheet = getQuotaModalCurrentSheet();
    const targetColKey = sheet?.columnAliasMap?.get(stage) || stage;
    if (!sheet || !targetColKey) {
      updateQuotaModalStatus("Não encontrei a coluna da quota nessa base.", "danger");
      return;
    }

    const cellMeta = sheet.cellsMap.get(`${row.__rowId}::${targetColKey}`) || null;
    dashboardQuotaModalState.saving = true;
    if (els.saveBtn) els.saveBtn.disabled = true;
    updateQuotaModalStatus(`Salvando ${getQuotaStageLabel(stage)} de ${row.razao_social || "empresa"}...`, "");

    try {
      const resp = await apiFetch(`${API_BASE}/api/sheets/${encodeURIComponent(sheet.sheetKey)}/cells`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          changes: [
            {
              rowId: row.__rowId,
              colKey: targetColKey,
              value,
              expectedUpdatedAt: cellMeta?.updatedAt || "",
            },
          ],
        }),
      });
      const data = await resp?.json().catch(() => null);
      if (!resp || !resp.ok) {
        throw new Error(data?.error || "Não foi possível salvar a conclusão da quota.");
      }

      dashboardQuotaModalState.sheets.delete(sheet.sheetKey);
      await populateQuotaModalForSheet(sheet.sheetKey, { force: true });
      syncQuotaModalConditionalFields();
      updateQuotaModalStatus(
        `${getQuotaStageLabel(stage)} concluído como ${QUOTA_MODAL_MODE_LABELS[String(els.mode?.value || "").trim()] || "valor informado"}.`,
        "success"
      );
    } catch (err) {
      console.warn("Falha ao concluir quota pelo dashboard:", err);
      updateQuotaModalStatus(err?.message || "Não foi possível salvar a quota agora.", "danger");
    } finally {
      dashboardQuotaModalState.saving = false;
      if (els.saveBtn) els.saveBtn.disabled = false;
    }
  }

  function bindQuotaModal() {
    const els = getQuotaModalElements();
    if (!els.backdrop || !els.openBtn) return;

    if (els.quarter && !els.quarter.__quotaBound) {
      els.quarter.__quotaBound = true;
      els.quarter.innerHTML = getContFlowQuarterSheets()
        .map((item) => `<option value="${escapeHTML(item.key)}">${escapeHTML(item.label)}</option>`)
        .join("");
      els.quarter.value = dashboardQuotaModalState.sheetKey;
      els.quarter.addEventListener("change", async () => {
        await populateQuotaModalForSheet(els.quarter.value, { force: false });
      });
    }

    if (!els.openBtn.__quotaBound) {
      els.openBtn.__quotaBound = true;
      els.openBtn.addEventListener("click", () => setQuotaModalOpen(true));
    }

    [els.closeBtn, els.cancelBtn].forEach((btn) => {
      if (!btn || btn.__quotaBound) return;
      btn.__quotaBound = true;
      btn.addEventListener("click", () => setQuotaModalOpen(false));
    });

    if (!els.backdrop.__quotaBound) {
      els.backdrop.__quotaBound = true;
      els.backdrop.addEventListener("click", (event) => {
        if (event.target === els.backdrop) setQuotaModalOpen(false);
      });
    }

    if (els.search && !els.search.__quotaBound) {
      els.search.__quotaBound = true;
      els.search.addEventListener("input", () => {
        renderQuotaModalCompanies();
        renderQuotaModalPreview();
      });
    }

    if (els.company && !els.company.__quotaBound) {
      els.company.__quotaBound = true;
      els.company.addEventListener("change", () => {
        renderQuotaModalPreview();
      });
    }

    if (els.stage && !els.stage.__quotaBound) {
      els.stage.__quotaBound = true;
      els.stage.addEventListener("change", () => {
        renderQuotaModalPreview();
      });
    }

    if (els.mode && !els.mode.__quotaBound) {
      els.mode.__quotaBound = true;
      els.mode.addEventListener("change", () => {
        syncQuotaModalConditionalFields();
        updateQuotaModalStatus("Revise a forma de conclusão e salve quando estiver certo.", "");
      });
    }

    if (els.saveBtn && !els.saveBtn.__quotaBound) {
      els.saveBtn.__quotaBound = true;
      els.saveBtn.addEventListener("click", async () => {
        await saveQuotaModalConclusion();
      });
    }

    if (!document.body.__quotaModalEscBound) {
      document.body.__quotaModalEscBound = true;
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && dashboardQuotaModalState.open) {
          setQuotaModalOpen(false);
        }
      });
    }
  }

  // ----------------------------
  // NEXT ACTIONS
  // ----------------------------
  function parseBRDateMaybe(s) {
    const t = String(s || "").trim();
    const m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return null;

    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yy = Number(m[3]);

    const d = new Date(yy, mm - 1, dd);
    if (
      d &&
      d.getFullYear() === yy &&
      d.getMonth() === mm - 1 &&
      d.getDate() === dd
    ) {
      return d;
    }

    return null;
  }

  function computeAutoActionsFromContFlow() {
    const data = loadContFlowData();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let overdueQuotas = 0;
    let pendingMIT = 0;

    const isResolvedWord = (v) => {
      const t = String(v || "").trim().toLowerCase();
      if (!t) return false;

      return [
        "ok",
        "feito",
        "resolvido",
        "concluido",
        "concluído",
        "dispensada",
        "dispensado",
      ].includes(t);
    };

    data.forEach((row) => {
      if (!row || typeof row !== "object") return;

      ["quota1", "quota2", "quota3"].forEach((k) => {
        const d = parseBRDateMaybe(row[k]);
        if (!d) return;

        d.setHours(0, 0, 0, 0);
        if (d < today) overdueQuotas += 1;
      });

      const mit = String(row.mit ?? "").trim();
      const ctrl = String(row.controle_mit ?? "").trim();
      const hasMITInfo = Boolean(mit || ctrl);

      if (hasMITInfo) {
        if (!isResolvedWord(mit) && !isResolvedWord(ctrl)) pendingMIT += 1;
      }
    });

    const a1 =
      overdueQuotas > 0
        ? `SLA: ${overdueQuotas} quota(s) vencida(s) no ContFlow (ver datas em 1º/2º/3º quota).`
        : "SLA: Nenhuma quota vencida identificada no ContFlow hoje.";

    const a2 =
      pendingMIT > 0
        ? `MIT: ${pendingMIT} linha(s) com pendência (MIT/Controle de MIT) no ContFlow.`
        : "MIT: Nenhuma pendência identificada no ContFlow.";

    return [a1, a2];
  }

  // ----------------------------
  // SLA MENSAL
  // ----------------------------
  function isBusinessDay(date) {
    const day = date.getDay();
    return day !== 0 && day !== 6;
  }

  function getLastDayOfMonth(baseDate = new Date()) {
    return new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0);
  }

  function subtractBusinessDays(date, businessDays) {
    const result = new Date(date);
    let count = 0;

    while (count < businessDays) {
      result.setDate(result.getDate() - 1);
      if (isBusinessDay(result)) {
        count += 1;
      }
    }

    return result;
  }

  function countBusinessDaysBetween(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    if (start.getTime() === end.getTime()) return 0;

    const direction = start < end ? 1 : -1;
    const current = new Date(start);
    let count = 0;

    while (current.getTime() !== end.getTime()) {
      current.setDate(current.getDate() + direction);
      if (isBusinessDay(current)) {
        count += direction;
      }
    }

    return count;
  }

  function getBusinessDaysInMonthUntil(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = d.getMonth();

    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0);

    let total = 0;
    const cursor = new Date(start);

    while (cursor <= end) {
      if (isBusinessDay(cursor)) total += 1;
      cursor.setDate(cursor.getDate() + 1);
    }

    return total;
  }

  function getElapsedBusinessDaysInMonth(date) {
    const d = new Date(date);
    const start = new Date(d.getFullYear(), d.getMonth(), 1);

    let total = 0;
    const cursor = new Date(start);

    while (cursor <= d) {
      if (isBusinessDay(cursor)) total += 1;
      cursor.setDate(cursor.getDate() + 1);
    }

    return total;
  }

  function getSlaDateForMonth(baseDate = new Date()) {
    const lastDay = getLastDayOfMonth(baseDate);
    return subtractBusinessDays(lastDay, 7);
  }

  function renderMonthlySlaIndicator() {
    const statusEl = document.getElementById("slaStatusText");
    const deadlineEl = document.getElementById("slaDeadlineText");
    const lastDayEl = document.getElementById("slaLastDayText");
    const metaEl = document.getElementById("slaMetaText");
    const refEl = document.getElementById("slaMonthRef");
    const progressEl = document.getElementById("slaProgressBar");

    if (!statusEl || !deadlineEl || !lastDayEl || !metaEl || !refEl || !progressEl) {
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lastDay = getLastDayOfMonth(today);
    lastDay.setHours(0, 0, 0, 0);

    const slaDate = getSlaDateForMonth(today);
    slaDate.setHours(0, 0, 0, 0);

    const monthRef = today.toLocaleDateString("pt-BR", {
      month: "2-digit",
      year: "numeric",
    });

    const diffBusiness = countBusinessDaysBetween(today, slaDate);

    const totalBusinessDays = getBusinessDaysInMonthUntil(today);
    const elapsedBusinessDays = getElapsedBusinessDaysInMonth(today);
    const progress = totalBusinessDays > 0
      ? Math.max(0, Math.min(100, (elapsedBusinessDays / totalBusinessDays) * 100))
      : 0;

    statusEl.classList.remove("ok", "warn", "danger");

    deadlineEl.textContent = formatDateBR(slaDate);
    lastDayEl.textContent = formatDateBR(lastDay);
    refEl.textContent = monthRef;
    progressEl.style.width = `${progress.toFixed(2)}%`;

    if (today.getTime() < slaDate.getTime()) {
      statusEl.textContent = "No prazo";
      statusEl.classList.add("ok");
      metaEl.textContent = `Faltam ${diffBusiness} dia(s) úteis para o prazo do SLA deste mês.`;
      return;
    }

    if (today.getTime() === slaDate.getTime()) {
      statusEl.textContent = "Vence hoje";
      statusEl.classList.add("warn");
      metaEl.textContent = "Hoje é o último dia útil do SLA deste mês.";
      return;
    }

    statusEl.textContent = "Vencido";
    statusEl.classList.add("danger");
    metaEl.textContent = `Prazo encerrado há ${Math.abs(diffBusiness)} dia(s) úteis.`;
  }

  // ----------------------------
  // UI RENDER
  // ----------------------------
  function fillHeroUser() {
    const u = getSessionUser();
    const name = String(u?.nome || u?.name || "Usuário").trim();
    const role = String(u?.role || "user").toUpperCase();
    const initials = name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "U";

    const elName = document.getElementById("userName");
    const elRole = document.getElementById("userRole");
    const elToday = document.getElementById("todayText");
    const elYear = document.getElementById("yearText");
    const elInitials = document.getElementById("userInitials");

    if (elName) elName.textContent = name;
    if (elRole) elRole.textContent = role;
    if (elToday) elToday.textContent = fmtToday();
    if (elYear) elYear.textContent = String(new Date().getFullYear());
    if (elInitials) elInitials.textContent = initials;
  }

  function accessProfileLabel(profile) {
    switch (normalizeAccessProfile(profile)) {
      case "ti":
        return "TI";
      case "gerencial":
        return "Gerencial";
      case "coordenacao":
        return "Coordenação";
      case "consulta":
        return "Consulta";
      case "comercial":
        return "Comercial";
      default:
        return "Operacional";
    }
  }

  function applyDashboardProfileMode() {
    const profile = getAccessProfile(getSessionUser());
    const isCommercial = profile === "comercial";
    document.body.classList.toggle("dashboard--commercial", isCommercial);

    const roleEl = document.getElementById("userRole");
    if (roleEl) {
      roleEl.textContent = isCommercial ? "Comercial" : String(getSessionUser()?.role || "user").toUpperCase();
    }

    const heroTitle = document.querySelector(".exactCard--overview h1");
    const heroText = document.getElementById("heroText");
    const goContComercialBtn = document.getElementById("btnGoContComercial");
    const goChamadosBtn = document.getElementById("btnGoChamados");
    const commercialOnlyBlocks = Array.from(document.querySelectorAll("[data-commercial-only]"));

    if (goContComercialBtn) {
      goContComercialBtn.hidden = false;
    }

    commercialOnlyBlocks.forEach((block) => {
      block.hidden = !isCommercial;
    });

    if (!isCommercial) return;

    if (heroTitle) {
      heroTitle.textContent = "ContHub";
    }

    if (heroText) {
      heroText.textContent =
        "Seu dashboard ficou intencionalmente mais enxuto para a equipe comercial: entrada rápida, menos ruído e acesso direto ao módulo comercial.";
    }

    if (goContComercialBtn) {
      goContComercialBtn.textContent = "Entrar no ContComercial";
    }

    if (goChamadosBtn) {
      goChamadosBtn.hidden = true;
    }
  }

  function fillModulesStats() {
    const store = MODULES_MAP || {};
    const moduleIds = [
      "dashboard",
      "contcomercial",
      "contflow",
      "contanalytics",
      "contdocs",
      "contrelatorios",
      "contconfig",
      "contadmin",
    ];

    let online = 0;
    let dev = 0;
    let off = 0;

    moduleIds.forEach((id) => {
      const st = store[id] || (id === "contadmin" ? "admin" : "online");

      if (st === "online" || st === "admin") online += 1;
      else if (st === "dev") dev += 1;
      else if (st === "offline") off += 1;
    });

    const elOn = document.getElementById("statOnline");
    const elDev = document.getElementById("statDev");
    const elOff = document.getElementById("statOff");

    if (elOn) elOn.textContent = String(online);
    if (elDev) elDev.textContent = String(dev);
    if (elOff) elOff.textContent = String(off);
  }

  function bindGotoButtons() {
    document.querySelectorAll("[data-goto]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const disabled = btn.getAttribute("data-disabled") === "true";
        const noAccess = btn.getAttribute("data-noaccess") === "true";

        if (disabled || noAccess) return;

        const url = btn.getAttribute("data-goto");
        goto(url);
      });
    });

    getSidebarCards().forEach((button) => {
      if (button.__navBound) return;
      button.__navBound = true;

      button.addEventListener("click", (e) => {
        const disabled = button.getAttribute("data-disabled") === "true";
        const noAccess = button.getAttribute("data-noaccess") === "true";

        if (disabled || noAccess) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }

        const src = button.dataset.src;
        if (src) goto(src);
      });
    });

    const btnGoChamados = document.getElementById("btnGoChamados");
    if (btnGoChamados && !btnGoChamados.__bound) {
      btnGoChamados.__bound = true;
      btnGoChamados.addEventListener("click", () => {
        const panel = document.getElementById("dashboardChamadosPanel");
        if (!panel) return;
        panel.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }

    const btnLogout = document.querySelector("[data-logout]");
    if (btnLogout && !btnLogout.__bound) {
      btnLogout.__bound = true;
      btnLogout.addEventListener("click", async (e) => {
        e.preventDefault();
        btnLogout.disabled = true;
        btnLogout.textContent = "Saindo...";
        await logoutDashboard();
      });
    }
  }

  function openDashboardPanelFromHash() {
    const hash = String(window.location.hash || "").trim().toLowerCase();
    if (hash !== "#dashboardchamadospanel" && hash !== "#ti-tickets") return;

    const panel = document.getElementById("dashboardChamadosPanel");
    if (!panel) return;

    requestAnimationFrame(() => {
      panel.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function renderQuickAutoCard() {
    const el = document.getElementById("quickAutoList");
    if (!el) return;

    const feed = await getContFlowFeed();
    el.innerHTML = "";

    if (!Array.isArray(feed) || feed.length === 0) {
      el.innerHTML = `
        <li style="opacity:.75;">
          Sem atualizações registradas ainda. (Mudanças no ContFlow vão aparecer aqui.)
        </li>
      `;
      return;
    }

    feed.slice(0, 4).forEach((item) => {
      const dt = new Date(item.ts);
      const when = isNaN(dt.getTime())
        ? ""
        : dt.toLocaleString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          });

      const title = String(item.title || "Atualização no ContFlow");
      const desc = String(item.desc || "");

      const li = document.createElement("li");
      li.innerHTML = `
        <b>${escapeHTML(title)}</b>
        <span style="opacity:.8;"> — ${escapeHTML(desc)}</span>
        ${
          when
            ? `<div style="opacity:.6;font-size:11px;margin-top:3px;">${escapeHTML(when)}</div>`
            : ""
        }
      `;
      el.appendChild(li);
    });
  }

  async function renderNextActions() {
    const el = document.getElementById("nextActionsList");
    if (!el) return;

    const state = await getNextActionsState();
    const clickupItems = getClickupNextActionItems(NEXT_ACTIONS_CLICKUP_LIMIT);
    const allOpenTickets = (Array.isArray(dashboardTicketsState.nextActionsFeed?.data) ? dashboardTicketsState.nextActionsFeed.data : [])
      .filter((ticket) => String(ticket?.status || "").trim().toLowerCase() !== "concluido");
    const clickupDebug = dashboardTicketsState.nextActionsFeed?.debug || null;
    renderNextActionsClickupMeta(allOpenTickets.length, clickupItems.length);

    const clickupHtml = !dashboardTicketsState.nextActionsFeed
      ? `<div class="todo__empty">Sincronizando tarefas do ClickUp para montar suas próximas ações.</div>`
      : clickupItems.length
        ? `<div class="todo__autoList">
            ${clickupItems.map((ticket) => {
              const relationLabel = "Atribuído a você";
              const whenLabel = ticket?.dueAt ? `Prazo ${formatRelativeOrDate(ticket.dueAt)}` : "Sem prazo definido";
              return `
                <article class="todo__auto">
                  <div class="todo__autoHead">
                    <div class="todo__autoTitleBlock">
                      <div class="todo__autoTitle">${escapeHTML(deriveNextActionTitle(ticket))}</div>
                      <div class="todo__autoSummary">${escapeHTML(String(ticket.description || "").trim() || "Sem descrição adicional nesta ação do ClickUp.")}</div>
                    </div>
                    <span class="todo__pill" data-tone="${ticketPriorityTone(ticket.priority)}">${escapeHTML(ticketPriorityLabel(ticket.priority))}</span>
                  </div>
                  <div class="todo__autoMeta">
                    <span class="todo__pill" data-tone="${ticketStatusTone(ticket.status)}">${escapeHTML(String(ticket.status || "Sem status"))}</span>
                    <span class="todo__pill" data-tone="soft">${escapeHTML(ticket.listName || "Sem lista")}</span>
                    <span class="todo__pill" data-tone="soft">${escapeHTML(relationLabel)}</span>
                    <span class="todo__pill" data-tone="${ticket?.dueAt ? "warn" : "soft"}">${escapeHTML(whenLabel)}</span>
                    <span class="todo__pill" data-tone="soft">${escapeHTML(getNextActionAssigneeLabel(ticket))}</span>
                  </div>
                </article>
              `;
            }).join("")}
          </div>`
        : `<div class="todo__empty">Nenhuma tarefa do ClickUp está atribuída a você neste momento. As ações do painel continuam logo abaixo.</div>`;

    const clickupDebugHtml = clickupDebug
      ? `<div class="todo__sectionHint" style="margin-top:6px;opacity:.82;">Sessão: ${escapeHTML(String(clickupDebug.sessionEmail || clickupDebug.sessionName || "--"))} • ClickUp lidas: ${escapeHTML(String(clickupDebug.fetchedCount ?? 0))} • Compatíveis: ${escapeHTML(String(clickupDebug.matchedCount ?? 0))}</div>`
      : "";

    el.innerHTML = `
      <section class="todo__section">
        <div class="todo__sectionHead">
          <div class="todo__sectionTitle">ClickUp</div>
          <div class="todo__sectionHint">Somente tarefas atribuídas ao seu nome no ClickUp.</div>
        </div>
        ${clickupDebugHtml}
        ${clickupHtml}
      </section>
      <section class="todo__section">
        <div class="todo__sectionHead">
          <div class="todo__sectionTitle">Painel</div>
          <div class="todo__sectionHint">Três ações rápidas do seu painel pessoal.</div>
        </div>
        <div class="todo__list" data-manual-list></div>
      </section>
    `;

    const manualListEl = el.querySelector("[data-manual-list]");
    if (!manualListEl) return;

    for (let i = 0; i < NEXT_ACTIONS_MANUAL_LIMIT; i++) {
      const text = String(state.manual[i] || "").trim();
      const checked = Boolean(state.checks[i]);

      const row = document.createElement("div");
      row.className = "todo__row" + (checked ? " is-done" : "");
      row.dataset.index = String(i);

      row.innerHTML = `
        <input type="checkbox" data-check="${i}" ${checked ? "checked" : ""} />
        <input
          class="todo__text ${text ? "" : "is-empty"}"
          type="text"
          value="${escapeHTML(text)}"
          placeholder="Clique aqui para anotar…"
          data-edit="${i}"
          maxlength="220"
        />
        <button class="todo__del" type="button" title="Apagar" aria-label="Apagar" data-del="${i}">
          🗑
        </button>
      `;

      manualListEl.appendChild(row);
    }

    el.onclick = async (e) => {
      const delBtn = e.target.closest("[data-del]");
      if (delBtn) {
        const i = Number(delBtn.getAttribute("data-del"));
        if (!Number.isFinite(i) || i < 0 || i >= NEXT_ACTIONS_MANUAL_LIMIT) return;

        state.manual[i] = "";
        state.checks[i] = false;
        await saveNextActionsState(state);
        await renderNextActions();
        return;
      }
    };

    el.onchange = async (e) => {
      const chk = e.target.closest("[data-check]");
      if (chk) {
        const i = Number(chk.getAttribute("data-check"));
        if (!Number.isFinite(i) || i < 0 || i >= NEXT_ACTIONS_MANUAL_LIMIT) return;

        state.checks[i] = Boolean(chk.checked);
        await saveNextActionsState(state);
        const row = chk.closest(".todo__row");
        if (row) row.classList.toggle("is-done", state.checks[i]);
        return;
      }
    };

    el.querySelectorAll("[data-edit]").forEach((input) => {
      const idx = Number(input.getAttribute("data-edit"));
      if (!Number.isFinite(idx)) return;

      input.addEventListener("focus", () => {
        input.classList.remove("is-empty");
      });

      input.addEventListener("blur", async () => {
        state.manual[idx] = String(input.value || "").trim().slice(0, 220);
        await saveNextActionsState(state);
        input.value = state.manual[idx];
        input.classList.toggle("is-empty", !state.manual[idx]);
      });

      input.addEventListener("keydown", async (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          input.blur();
        }
      });

      input.classList.toggle("is-empty", !String(input.value || "").trim());
    });

    bindAddResetButtons();
    bindClearChecks();
  }

  function bindAddResetButtons() {
    const btnAdd = document.getElementById("btnAddNextAction");
    const btnReset = document.getElementById("btnResetNextActions");

    if (btnAdd && !btnAdd.__bound) {
      btnAdd.__bound = true;
      btnAdd.addEventListener("click", async () => {
        const st = await getNextActionsState();
        const idx = st.manual.findIndex((x) => !String(x || "").trim());
        const target = idx === -1 ? 0 : idx;

        const next = prompt("Digite a ação manual (até 220 caracteres):", "");
        if (next === null) return;

        st.manual[target] = String(next).trim().slice(0, 220);
        st.checks[target] = false;
        await saveNextActionsState(st);
        await renderNextActions();
      });
    }

    if (btnReset && !btnReset.__bound) {
      btnReset.__bound = true;
      btnReset.addEventListener("click", async () => {
        const ok = confirm("Resetar as 3 ações do painel e checks deste usuário?");
        if (!ok) return;

        const st = {
          manual: [...DEFAULT_MANUAL],
          checks: [...DEFAULT_CHECKS],
        };

        await saveNextActionsState(st);
        await renderNextActions();
      });
    }
  }

  function bindClearChecks() {
    const btn = document.getElementById("btnResetChecks");
    if (!btn || btn.__bound) return;

    btn.__bound = true;
    btn.addEventListener("click", async () => {
      const st = await getNextActionsState();
      st.checks = [...DEFAULT_CHECKS];
      await saveNextActionsState(st);
      await renderNextActions();
    });
  }

  function bindContFlowAutoUpdates() {
    window.addEventListener("storage", async (e) => {
      if (!e) return;
      if (e.key === CONTFLOW_KEY) {
        await computeContFlowNewsAndSaveSnapshot();
        await renderContFlowNewsBadge();
        await renderNextActions();
        await renderQuickAutoCard();
        renderMonthlySlaIndicator();
      }
    });

    document.addEventListener("visibilitychange", async () => {
      if (!document.hidden) {
        await computeContFlowNewsAndSaveSnapshot();
        await renderContFlowNewsBadge();
        await renderNextActions();
        await renderQuickAutoCard();
        renderMonthlySlaIndicator();
      }
    });
  }

  // ----------------------------
  // INIT
  // ----------------------------
  document.addEventListener("DOMContentLoaded", async () => {
    AUTH_USER = await requireAuthOrRedirect();
    if (!AUTH_USER) return;

    await loadModulesMap();

    fillHeroUser();
    applyDashboardProfileMode();
    syncSidebarFromStore();
    syncShortcutsFromStore();
    applyRoleToSidebar();
    fillModulesStats();
    bindGotoButtons();
    bindTicketButtons();
    bindQuotaModal();

    await computeContFlowNewsAndSaveSnapshot();
    await renderContFlowNewsBadge();

    await renderNextActions();
    await refreshTickets({ force: true });
    await renderQuickAutoCard();

    renderMonthlySlaIndicator();
    bindContFlowAutoUpdates();
    startTicketsSyncLoop();
    openDashboardPanelFromHash();
  });

  window.addEventListener("hashchange", openDashboardPanelFromHash);
})();
