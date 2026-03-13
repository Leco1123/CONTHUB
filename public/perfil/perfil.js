// public/perfil/perfil.js
// PERFIL • JS (100% SESSION + API)
// ✅ Sessão real via /api/auth/me
// ✅ Logout real via /api/auth/logout
// ✅ Busca dados atualizados do usuário via API (/api/admin/users)
// ✅ Busca logs do backend (GET /api/admin/users/:id/logs)
// ✅ Fallback de logs locais apenas para visualização
// ✅ Renderiza módulos usando status do banco (/api/admin/modules)

(function () {
  const LOGIN_PAGE_URL = "../login/login.html";
  const API_BASE = "";
  const API_USERS = `${API_BASE}/api/admin/users`;
  const API_MODULES = `${API_BASE}/api/admin/modules`;
  const API_USER_LOGS = (id) => `${API_USERS}/${id}/logs?limit=50`;

  const LOGS_KEY = "conthub_user_logs";

  let AUTH_USER = null;
  let MODULES_MAP = {};

  const elAvatar = document.getElementById("avatar");
  const elNome = document.getElementById("nome");
  const elEmail = document.getElementById("email");
  const elNivelAcesso = document.getElementById("nivelAcesso");
  const elCargo = document.getElementById("cargo");
  const elStatus = document.getElementById("status");

  const elRoleBadge = document.getElementById("roleBadge");
  const elCargoBadge = document.getElementById("cargoBadge");
  const elStatusBadge = document.getElementById("statusBadge");

  const elModulesList = document.getElementById("modulesList");
  const elLogsList = document.getElementById("logsList");

  const btnVoltar = document.getElementById("btnVoltar");
  const btnSair = document.getElementById("btnSair");

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
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

  function getSessionUser() {
    return AUTH_USER;
  }

  async function logout() {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch (err) {
      console.warn("Falha ao encerrar sessão:", err);
    }

    AUTH_USER = null;
    goto(LOGIN_PAGE_URL);
  }

  function roleLabel(role) {
    const r = String(role || "user").toLowerCase();
    if (r === "ti") return "TI";
    if (r === "admin") return "ADMIN";
    return "USER";
  }

  function avatarFromName(name) {
    const t = String(name || "").trim();
    return t ? t[0].toUpperCase() : "U";
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function fmtTime(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleString("pt-BR");
    } catch {
      return "—";
    }
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalizeModuleStatus(status, active) {
    const s = String(status || "").trim().toLowerCase();

    if (active === false) return "offline";
    if (s === "offline" || s === "off") return "offline";
    if (s === "dev") return "dev";
    if (s === "admin") return "admin";
    return "online";
  }

  function getSessionUserId(user) {
    if (!user || typeof user !== "object") return null;

    if (user.id != null && String(user.id).trim() !== "") {
      const n = Number(user.id);
      if (Number.isFinite(n) && n > 0) return n;
    }

    return null;
  }

  async function fetchJson(url, opts = {}) {
    const session = getSessionUser();

    const res = await fetch(url, {
      method: opts.method || "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(session?.id != null ? { "x-user-id": String(session.id) } : {}),
        ...(session?.email ? { "x-user-email": String(session.email) } : {}),
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
        AUTH_USER = null;
        goto(LOGIN_PAGE_URL);
        return null;
      }

      const msg = (data && (data.error || data.message)) || `HTTP ${res.status}`;
      const err = new Error(msg);
      err.status = res.status;
      err.payload = data;
      throw err;
    }

    return data;
  }

  async function requireAuthOrRedirect() {
    try {
      const data = await fetchJson("/api/auth/me", { method: "GET" });
      const me = data && typeof data === "object" ? data.user || data : null;

      if (!me || typeof me !== "object") {
        goto(LOGIN_PAGE_URL);
        return null;
      }

      AUTH_USER = me;
      return me;
    } catch (err) {
      console.warn("Falha ao validar sessão:", err?.message || err);
      goto(LOGIN_PAGE_URL);
      return null;
    }
  }

  async function loadUserFromApi(userId) {
    const payload = await fetchJson(API_USERS, { method: "GET" });
    const list = Array.isArray(payload?.users)
      ? payload.users
      : Array.isArray(payload)
      ? payload
      : [];

    return list.find((x) => Number(x.id) === Number(userId)) || null;
  }

  async function loadLogsFromApi(userId) {
    const payload = await fetchJson(API_USER_LOGS(userId), { method: "GET" });
    const list = payload?.logs || payload?.items || payload?.data || payload;
    return Array.isArray(list) ? list : [];
  }

  async function loadModulesFromApi() {
    try {
      const payload = await fetchJson(API_MODULES, { method: "GET" });
      const rows = Array.isArray(payload?.modules) ? payload.modules : [];

      const map = {};
      rows.forEach((m) => {
        const slug = String(m.slug || "").trim().toLowerCase();
        if (!slug) return;
        map[slug] = normalizeModuleStatus(m.status, m.active);
      });

      MODULES_MAP = map;
      return map;
    } catch (err) {
      console.warn("Falha ao carregar módulos:", err?.message || err);
      MODULES_MAP = {};
      return MODULES_MAP;
    }
  }

  const MODULE_CATALOG = [
    { id: "dashboard", name: "Dashboard", desc: "Visão geral do ContHub.", icon: "🏠" },
    { id: "contflow", name: "ContFlow", desc: "Controle de rotinas e fluxo contábil.", icon: "⚡" },
    { id: "contanalytics", name: "ContAnalytics", desc: "KPIs, indicadores e painéis.", icon: "📊" },
    { id: "contdocs", name: "ContDocs", desc: "Centralização e gestão de documentos.", icon: "📁" },
    { id: "contmit", name: "ContMIT", desc: "MIT, apurações e cálculos periódicos.", icon: "🧾" },
    { id: "contrels", name: "ContRelatórios", desc: "Geração de relatórios e exportações.", icon: "📈" },
    { id: "contconfig", name: "ContConfig", desc: "Parâmetros e configurações gerais.", icon: "⚙️" },
    { id: "contadmin", name: "ContAdmin Hub", desc: "Área administrativa e controle total.", icon: "🛡️" },
  ];

  function getModuleStatus(id) {
    if (id === "contadmin") return "admin";
    return MODULES_MAP[id] || "online";
  }

  function canAccessModule(role, moduleId) {
    const r = String(role || "user").toLowerCase();
    if (r === "ti") return true;
    if (r === "admin") return true;
    return moduleId !== "contadmin";
  }

  function pushLocalLog(userId, message) {
    const safeKey = String(userId || "anon");
    const logsAll = readJSON(LOGS_KEY, {});

    if (!Array.isArray(logsAll[safeKey])) logsAll[safeKey] = [];

    logsAll[safeKey].unshift({ message, at: nowISO() });
    logsAll[safeKey] = logsAll[safeKey].slice(0, 15);

    writeJSON(LOGS_KEY, logsAll);
  }

  function renderLogsLocal(userId) {
    if (!elLogsList) return;

    const safeKey = String(userId || "anon");
    const logsAll = readJSON(LOGS_KEY, {});
    const list = Array.isArray(logsAll[safeKey]) ? logsAll[safeKey] : [];

    if (!list.length) {
      elLogsList.innerHTML = `<div class="muted" style="font-size:12px;">Sem atividade registrada ainda.</div>`;
      return;
    }

    elLogsList.innerHTML = list
      .map(
        (l) => `
          <div class="log">
            <div class="log__msg">${escapeHtml(l.message)}</div>
            <div class="log__time">${escapeHtml(fmtTime(l.at))}</div>
          </div>
        `
      )
      .join("");
  }

  function normalizeLogLine(x) {
    const when = x.createdAt || x.timestamp || x.at || x.date || null;
    const action = x.action || x.event || x.type || "LOG";
    const by = x.actorEmail || x.actor || x.by || "";
    const msg = x.message || x.detail || "";

    return {
      when: when ? fmtTime(when) : "—",
      action: String(action),
      by: String(by || ""),
      msg: String(msg || ""),
      meta: x.meta ?? null,
    };
  }

  async function loadLogsBackend(userId) {
    if (!elLogsList || !userId) return;

    const old = elLogsList.innerHTML;
    elLogsList.innerHTML =
      old || `<div class="muted" style="font-size:12px;">Carregando atividade…</div>`;

    try {
      const logs = await loadLogsFromApi(userId);

      if (!logs.length) {
        if (!old) {
          elLogsList.innerHTML = `<div class="muted" style="font-size:12px;">Sem logs no servidor ainda.</div>`;
        }
        return;
      }

      const lines = logs.map(normalizeLogLine);

      elLogsList.innerHTML = lines
        .map(
          (l) => `
            <div class="log">
              <div class="log__msg">
                <strong>${escapeHtml(l.action)}</strong>
                ${l.msg ? " — " + escapeHtml(l.msg) : ""}
                ${l.by ? `<span class="muted" style="margin-left:8px;">(${escapeHtml(l.by)})</span>` : ""}
              </div>
              <div class="log__time">${escapeHtml(l.when)}</div>
            </div>
          `
        )
        .join("");
    } catch (err) {
      console.warn("Logs backend indisponíveis:", err?.message || err);
      if (!old) renderLogsLocal(String(userId || "anon"));
    }
  }

  function renderProfile(user) {
    const nome = String(user?.name ?? user?.nome ?? "Usuário").trim();
    const email = String(user?.email ?? "—").trim();
    const cargo =
      user?.cargo != null && String(user.cargo).trim() !== ""
        ? String(user.cargo).trim()
        : "—";

    const roleRaw = String(user?.role ?? "user").toLowerCase();

    const active =
      typeof user?.active === "boolean"
        ? user.active
        : typeof user?.ativo === "boolean"
        ? user.ativo
        : true;

    const role = roleLabel(roleRaw);

    if (elAvatar) elAvatar.textContent = avatarFromName(nome);
    if (elNome) elNome.textContent = nome;
    if (elEmail) elEmail.textContent = email;

    if (elNivelAcesso) elNivelAcesso.textContent = role;
    if (elCargo) elCargo.textContent = cargo;
    if (elStatus) elStatus.textContent = active ? "ATIVO" : "INATIVO";

    if (elRoleBadge) elRoleBadge.textContent = role;
    if (elCargoBadge) elCargoBadge.textContent = cargo;

    if (elStatusBadge) {
      elStatusBadge.textContent = active ? "ATIVO" : "INATIVO";
      elStatusBadge.classList.toggle("badge--off", !active);
    }
  }

  function renderModules(user) {
    if (!elModulesList) return;

    const role = String(user?.role ?? "user").toLowerCase();

    elModulesList.innerHTML = MODULE_CATALOG.map((m) => {
      const allowed = canAccessModule(role, m.id);
      const st = getModuleStatus(m.id);

      const pillClass =
        st === "dev" ? "pill--dev" : st === "offline" ? "pill--off" : "pill--online";

      const pillText =
        st === "dev"
          ? "DEV"
          : st === "offline"
          ? "OFF"
          : st === "admin"
          ? "ADMIN"
          : "ONLINE";

      return `
        <div class="module">
          <div class="module__left">
            <div class="module__icon">${escapeHtml(m.icon)}</div>
            <div class="module__text">
              <div class="module__name">${escapeHtml(m.name)}</div>
              <div class="module__desc">${escapeHtml(m.desc)}</div>
            </div>
          </div>

          <div class="module__right">
            <span class="pill ${pillClass}">${escapeHtml(pillText)}</span>
            <span class="lock">${allowed ? "Liberado" : "Bloqueado"}</span>
          </div>
        </div>
      `;
    }).join("");
  }

  async function init() {
    const session = await requireAuthOrRedirect();
    if (!session) return;

    const userId = getSessionUserId(session);

    await loadModulesFromApi();

    renderProfile(session);
    renderModules(session);

    pushLocalLog(String(userId || "anon"), "Acessou a página de perfil");
    renderLogsLocal(String(userId || "anon"));

    if (!userId) {
      console.warn("Perfil carregado sem id na sessão. Mantendo página aberta sem redirecionar.");
      return;
    }

    try {
      const apiUser = await loadUserFromApi(userId);
      if (apiUser) {
        AUTH_USER = { ...session, ...apiUser };
        renderProfile(AUTH_USER);
        renderModules(AUTH_USER);
      }
    } catch (err) {
      console.warn("Perfil: falha ao atualizar dados via API:", err?.message || err);
    }

    await loadLogsBackend(userId);
  }

  btnVoltar?.addEventListener("click", () => history.back());

  btnSair?.addEventListener("click", async () => {
    const userId = getSessionUserId(AUTH_USER);
    pushLocalLog(String(userId || "anon"), "Saiu (logout)");
    await logout();
  });

  init();
})();