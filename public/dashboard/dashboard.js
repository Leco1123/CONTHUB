// ============================
// DASHBOARD • JS (MIGRAÇÃO POSTGRES)
// - Auth real via /api/auth/me (cookie conthub.sid)
// - ✅ Next Actions: Postgres (/api/dashboard/next-actions)
// - ✅ ContFlow Feed/Snapshot: Postgres (/api/dashboard/contflow-feed | /contflow-snapshot)
// - ContFlow base ainda localStorage (por enquanto)
// - Fallback local se API estiver offline
// ============================

(function () {
  let AUTH_USER = null;

  // ----------------------------
  // CONFIG
  // ----------------------------
  const SESSION_USER_KEY = "conthub_user"; // cache UI
  const LEGACY_USER_ID_KEY = "conthub_current_user_id";
  const LEGACY_USERS_KEY = "conthub_usuarios";

  const MODULES_KEY = "conthub_module_status"; // status módulos (ainda local)
  const CONTFLOW_KEY = "conthub:contflow:data"; // base do ContFlow (ainda local)

  // LEGADO (fallback apenas)
  const CF_SNAPSHOT_PREFIX = "conthub:dashboard:contflow_snapshot:";
  const CF_FEED_PREFIX = "conthub:dashboard:contflow_feed:";
  const NEXT_ACTIONS_PREFIX = "conthub:dashboard:nextActions:";

  const DEFAULT_MANUAL = ["", "", "", ""];
  const DEFAULT_CHECKS = [false, false, false, false];

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

  function clearLocalSession() {
    localStorage.removeItem(SESSION_USER_KEY);
    localStorage.removeItem(LEGACY_USER_ID_KEY);
  }

  function setSessionUserLocal(u) {
    if (!u || typeof u !== "object") return;
    localStorage.setItem(SESSION_USER_KEY, JSON.stringify(u));
    if (u.id != null) localStorage.setItem(LEGACY_USER_ID_KEY, String(u.id));
  }

  function getLegacyUsers() {
    const raw = localStorage.getItem(LEGACY_USERS_KEY) || "[]";
    const arr = safeJSONParse(raw, []);
    return Array.isArray(arr) ? arr : [];
  }

  // ✅ usa AUTH_USER como fonte de verdade
  function getSessionUser() {
    if (AUTH_USER && typeof AUTH_USER === "object") return AUTH_USER;

    // cache UI
    const raw = localStorage.getItem(SESSION_USER_KEY);
    if (raw) {
      const u = safeJSONParse(raw, null);
      if (u && typeof u === "object") return u;
    }

    // legado
    const idRaw = localStorage.getItem(LEGACY_USER_ID_KEY);
    const id = Number(idRaw);
    if (!Number.isFinite(id) || id <= 0) return null;
    const users = getLegacyUsers();
    return users.find((x) => Number(x.id) === Number(id)) || null;
  }

  function getUserKey() {
    const u = getSessionUser();
    if (!u) return "anon";
    const email = (u.email || "").toLowerCase().trim();
    const id = u.id != null ? String(u.id) : "";
    const name = (u.nome || u.name || "").trim();
    return email || id || name || "anon";
  }

  function readModuleStore() {
    const raw = localStorage.getItem(MODULES_KEY) || "{}";
    const obj = safeJSONParse(raw, {});
    return obj && typeof obj === "object" ? obj : {};
  }

  async function apiFetch(path, options = {}) {
    const resp = await fetch(path, {
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(options.headers || {}),
      },
      ...options,
    });
    return resp;
  }

  // ----------------------------
  // AUTH
  // ----------------------------
  async function requireAuthOrRedirect() {
    try {
      const resp = await apiFetch("/api/auth/me", { method: "GET" });
      if (!resp.ok) {
        clearLocalSession();
        goto("../login/login.html");
        return null;
      }

      const data = await resp.json().catch(() => null);
      const me = data && typeof data === "object" ? data.user || data : null;
      if (!me || typeof me !== "object") {
        clearLocalSession();
        goto("../login/login.html");
        return null;
      }

      setSessionUserLocal(me);
      return me;
    } catch (err) {
      console.warn("Falha ao validar /api/auth/me:", err);
      clearLocalSession();
      goto("../login/login.html");
      return null;
    }
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
    if (!data || typeof data !== "object") return { manual: [...DEFAULT_MANUAL], checks: [...DEFAULT_CHECKS] };

    const manual = Array.isArray(data.manual) ? data.manual.slice(0, 4) : [...DEFAULT_MANUAL];
    while (manual.length < 4) manual.push("");

    const checks = Array.isArray(data.checks) ? data.checks.slice(0, 4) : [...DEFAULT_CHECKS];
    while (checks.length < 4) checks.push(false);

    return { manual, checks };
  }

  function saveNextActionsStateLegacy(state) {
    localStorage.setItem(nextActionsStorageKeyLegacy(), JSON.stringify(state));
  }

  async function getNextActionsState() {
    try {
      const resp = await apiFetch("/api/dashboard/next-actions", { method: "GET" });
      if (!resp.ok) throw new Error("GET next-actions failed");
      const data = await resp.json().catch(() => null);

      const manual = Array.isArray(data?.manual) ? data.manual.slice(0, 4) : [...DEFAULT_MANUAL];
      while (manual.length < 4) manual.push("");

      const checks = Array.isArray(data?.checks) ? data.checks.slice(0, 4) : [...DEFAULT_CHECKS];
      while (checks.length < 4) checks.push(false);

      return { manual, checks };
    } catch (e) {
      // fallback legado
      return loadNextActionsStateLegacy();
    }
  }

  async function saveNextActionsState(state) {
    // salva no banco
    try {
      const resp = await apiFetch("/api/dashboard/next-actions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          manual: (state.manual || []).slice(0, 4),
          checks: (state.checks || []).slice(0, 4),
        }),
      });
      if (!resp.ok) throw new Error("PUT next-actions failed");
      return true;
    } catch (e) {
      // fallback local (pra não quebrar UI durante migração)
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
      if (!resp.ok) throw new Error("GET snapshot failed");
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
      if (!resp.ok) throw new Error("PUT snapshot failed");
      return true;
    } catch {
      saveContFlowSnapshotLegacy(snapshot);
      return false;
    }
  }

  async function getContFlowFeed() {
    try {
      const resp = await apiFetch("/api/dashboard/contflow-feed", { method: "GET" });
      if (!resp.ok) throw new Error("GET feed failed");
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
      if (!resp.ok) throw new Error("POST feed failed");
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
      if (!snap) elText.textContent = "ContFlow: sem snapshot ainda.";
      else {
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
            const when = isNaN(dt.getTime()) ? "" : dt.toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit" });
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
  // NEXT ACTIONS (auto from ContFlow) — continua local enquanto ContFlow não migra
  // ----------------------------
  function parseBRDateMaybe(s) {
    const t = String(s || "").trim();
    const m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return null;
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yy = Number(m[3]);
    const d = new Date(yy, mm - 1, dd);
    if (d && d.getFullYear() === yy && d.getMonth() === mm - 1 && d.getDate() === dd) return d;
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
      return ["ok", "feito", "resolvido", "concluido", "concluído", "dispensada", "dispensado"].includes(t);
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
  // UI RENDER
  // ----------------------------
  function fillHeroUser() {
    const u = getSessionUser();
    const name = (u?.nome || u?.name || "Usuário").trim();
    const role = (u?.role || "user").toUpperCase();

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
    const store = readModuleStore();
    const moduleIds = ["contflow", "contanalytics", "contdocs", "contrels", "contconfig", "contadmin"];

    let online = 0,
      dev = 0,
      off = 0;

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
        const url = btn.getAttribute("data-goto");
        goto(url);
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
        : dt.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

      const title = String(item.title || "Atualização no ContFlow");
      const desc = String(item.desc || "");

      const li = document.createElement("li");
      li.innerHTML = `
        <b>${escapeHTML(title)}</b>
        <span style="opacity:.8;"> — ${escapeHTML(desc)}</span>
        ${when ? `<div style="opacity:.6;font-size:11px;margin-top:3px;">${escapeHTML(when)}</div>` : ""}
      `;
      el.appendChild(li);
    });
  }

  async function renderNextActions() {
    const el = document.getElementById("nextActionsList");
    if (!el) return;

    const state = await getNextActionsState();
    const auto = computeAutoActionsFromContFlow();

    el.innerHTML = "";

    for (let i = 0; i < 4; i++) {
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
          readonly
          value="${text ? escapeHTML(text) : "Clique em “Adicionar ação” ou clique aqui para escrever…"}"
          data-edit="${i}"
        />
        <button class="todo__del" type="button" title="Apagar" aria-label="Apagar" data-del="${i}">
          🗑
        </button>
      `;

      el.appendChild(row);
    }

    auto.forEach((t) => {
      const row = document.createElement("div");
      row.className = "todo__auto";
      row.innerHTML = `
        <span class="todo__tag">AUTO</span>
        <span class="todo__autoText">${escapeHTML(String(t || ""))}</span>
      `;
      el.appendChild(row);
    });

    el.onclick = async (e) => {
      const delBtn = e.target.closest("[data-del]");
      if (delBtn) {
        const i = Number(delBtn.getAttribute("data-del"));
        if (!Number.isFinite(i) || i < 0 || i > 3) return;
        const st = await getNextActionsState();
        st.manual[i] = "";
        st.checks[i] = false;
        await saveNextActionsState(st);
        await renderNextActions();
        return;
      }

      const edit = e.target.closest("[data-edit]");
      if (edit) {
        const i = Number(edit.getAttribute("data-edit"));
        if (!Number.isFinite(i) || i < 0 || i > 3) return;

        const st = await getNextActionsState();
        const current = String(st.manual[i] || "").trim();
        const next = prompt("Editar ação:", current);
        if (next === null) return;

        st.manual[i] = String(next).trim().slice(0, 220);
        await saveNextActionsState(st);
        await renderNextActions();
        return;
      }
    };

    el.onchange = async (e) => {
      const chk = e.target.closest("[data-check]");
      if (!chk) return;
      const i = Number(chk.getAttribute("data-check"));
      if (!Number.isFinite(i) || i < 0 || i > 3) return;

      const st = await getNextActionsState();
      st.checks[i] = Boolean(chk.checked);
      await saveNextActionsState(st);
      await renderNextActions();
    };

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
        const ok = confirm("Resetar as 4 ações manuais e checks deste usuário?");
        if (!ok) return;
        const st = { manual: [...DEFAULT_MANUAL], checks: [...DEFAULT_CHECKS] };
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
      }
    });

    document.addEventListener("visibilitychange", async () => {
      if (!document.hidden) {
        await computeContFlowNewsAndSaveSnapshot();
        await renderContFlowNewsBadge();
        await renderNextActions();
        await renderQuickAutoCard();
      }
    });
  }

  // ----------------------------
  // INIT
  // ----------------------------
  document.addEventListener("DOMContentLoaded", async () => {
    AUTH_USER = await requireAuthOrRedirect();
    if (!AUTH_USER) return;

    fillHeroUser();
    fillModulesStats();
    bindGotoButtons();

    await computeContFlowNewsAndSaveSnapshot();
    await renderContFlowNewsBadge();

    await renderNextActions();
    await renderQuickAutoCard();

    bindContFlowAutoUpdates();
  });
})();

