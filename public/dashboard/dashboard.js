// ============================
// DASHBOARD • JS (POSTGRES + SESSION COOKIE)
// ============================

(function () {
  let AUTH_USER = null;
  let MODULES_MAP = {};

  // ----------------------------
  // CONFIG
  // ----------------------------
  const API_BASE = "";
  const API_MODULES = `${API_BASE}/api/admin/modules`;

  const CONTFLOW_KEY = "conthub:contflow:data";

  // LEGADO (fallback apenas)
  const CF_SNAPSHOT_PREFIX = "conthub:dashboard:contflow_snapshot:";
  const CF_FEED_PREFIX = "conthub:dashboard:contflow_feed:";
  const NEXT_ACTIONS_PREFIX = "conthub:dashboard:nextActions:";

  const DEFAULT_MANUAL = ["", "", "", ""];
  const DEFAULT_CHECKS = [false, false, false, false, false, false];

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
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
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
      rows.forEach((m) => {
        const slug = String(m.slug || "").trim().toLowerCase();
        if (!slug) return;
        map[slug] = normalizeModuleStatus(m.status, m.active);
      });

      MODULES_MAP = map;
      return map;
    } catch (err) {
      console.warn("Falha ao carregar módulos do banco:", err);
      MODULES_MAP = {};
      return MODULES_MAP;
    }
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

    const manual = Array.isArray(data.manual) ? data.manual.slice(0, 6) : [...DEFAULT_MANUAL];
    while (manual.length < 6) manual.push("");

    const checks = Array.isArray(data.checks) ? data.checks.slice(0, 6) : [...DEFAULT_CHECKS];
    while (checks.length < 6) checks.push(false);

    return { manual, checks };
  }

  function saveNextActionsStateLegacy(state) {
    localStorage.setItem(nextActionsStorageKeyLegacy(), JSON.stringify(state));
  }

  async function getNextActionsState() {
    try {
      const resp = await apiFetch("/api/dashboard/next-actions", { method: "GET" });
      if (!resp || !resp.ok) throw new Error("GET next-actions failed");

      const data = await resp.json().catch(() => null);

      const manual = Array.isArray(data?.manual) ? data.manual.slice(0, 6) : [...DEFAULT_MANUAL];
      while (manual.length < 6) manual.push("");

      const checks = Array.isArray(data?.checks) ? data.checks.slice(0, 6) : [...DEFAULT_CHECKS];
      while (checks.length < 6) checks.push(false);

      return { manual, checks };
    } catch (e) {
      return loadNextActionsStateLegacy();
    }
  }

  async function saveNextActionsState(state) {
    try {
      const resp = await apiFetch("/api/dashboard/next-actions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          manual: (state.manual || []).slice(0, 6),
          checks: (state.checks || []).slice(0, 6),
        }),
      });

      if (!resp || !resp.ok) throw new Error("PUT next-actions failed");
      return true;
    } catch (e) {
      saveNextActionsStateLegacy(state);
      return false;
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

  async function getContFlowSnapshot() {
    try {
      const resp = await apiFetch("/api/dashboard/contflow-snapshot", { method: "GET" });
      if (!resp || !resp.ok) throw new Error("GET snapshot failed");
      const snap = await resp.json().catch(() => null);
      return snap && typeof snap === "object" ? snap : null;
    } catch {
      return loadContFlowSnapshotLegacy();
    }
  }

  async function saveContFlowSnapshot(snapshot) {
    try {
      const resp = await apiFetch("/api/dashboard/contflow-snapshot", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshot || {}),
      });

      if (!resp || !resp.ok) throw new Error("PUT snapshot failed");
      return true;
    } catch {
      saveContFlowSnapshotLegacy(snapshot);
      return false;
    }
  }

  async function getContFlowFeed() {
    try {
      const resp = await apiFetch("/api/dashboard/contflow-feed", { method: "GET" });
      if (!resp || !resp.ok) throw new Error("GET feed failed");
      const feed = await resp.json().catch(() => []);
      return Array.isArray(feed) ? feed : [];
    } catch {
      return loadContFlowFeedLegacy();
    }
  }

  async function pushContFlowFeedItem(item) {
    try {
      const resp = await apiFetch("/api/dashboard/contflow-feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item || {}),
      });

      if (!resp || !resp.ok) throw new Error("POST feed failed");
      return true;
    } catch {
      pushContFlowFeedItemLegacy(item);
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

    const snap = await getContFlowSnapshot();
    const feed = await getContFlowFeed();

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

    const elName = document.getElementById("userName");
    const elRole = document.getElementById("userRole");
    const elToday = document.getElementById("todayText");
    const elYear = document.getElementById("yearText");

    if (elName) elName.textContent = name;
    if (elRole) elRole.textContent = role;
    if (elToday) elToday.textContent = fmtToday();
    if (elYear) elYear.textContent = String(new Date().getFullYear());
  }

  function fillModulesStats() {
    const store = MODULES_MAP || {};
    const moduleIds = [
      "dashboard",
      "contflow",
      "contanalytics",
      "contdocs",
      "contrels",
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

    el.innerHTML = "";

    for (let i = 0; i < 6; i++) {
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

      el.appendChild(row);
    }

    el.onclick = async (e) => {
      const delBtn = e.target.closest("[data-del]");
      if (delBtn) {
        const i = Number(delBtn.getAttribute("data-del"));
        if (!Number.isFinite(i) || i < 0 || i > 5) return;

        const st = await getNextActionsState();
        st.manual[i] = "";
        st.checks[i] = false;
        await saveNextActionsState(st);
        await renderNextActions();
        return;
      }
    };

    el.onchange = async (e) => {
      const chk = e.target.closest("[data-check]");
      if (chk) {
        const i = Number(chk.getAttribute("data-check"));
        if (!Number.isFinite(i) || i < 0 || i > 5) return;

        const st = await getNextActionsState();
        st.checks[i] = Boolean(chk.checked);
        await saveNextActionsState(st);
        await renderNextActions();
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
        const st = await getNextActionsState();
        st.manual[idx] = String(input.value || "").trim().slice(0, 220);
        await saveNextActionsState(st);
        input.classList.toggle("is-empty", !st.manual[idx]);
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
        const ok = confirm("Resetar as 6 ações manuais e checks deste usuário?");
        if (!ok) return;

        const st = {
          manual: ["", "", "", "", "", ""],
          checks: [false, false, false, false, false, false],
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
      st.checks = [false, false, false, false, false, false];
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
    syncSidebarFromStore();
    syncShortcutsFromStore();
    applyRoleToSidebar();
    fillModulesStats();
    bindGotoButtons();

    await computeContFlowNewsAndSaveSnapshot();
    await renderContFlowNewsBadge();

    await renderNextActions();
    await renderQuickAutoCard();

    renderMonthlySlaIndicator();
    bindContFlowAutoUpdates();
  });
})();