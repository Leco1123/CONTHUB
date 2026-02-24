// public/perfil/perfil.js
// PERFIL • JS (API-FIRST • ROBUSTO)
// ✅ Usa sessão via localStorage "conthub_user" (compatível com login.js novo)
// ✅ Busca dados atualizados do usuário via API (/api/admin/users) para trazer cargo/role/active corretos
// ✅ Busca logs do backend (GET /api/admin/users/:id/logs) e faz fallback p/ logs locais (localStorage)
// ✅ Renderiza módulos usando status local (MODULES_KEY) + regra de acesso por role
// ✅ Voltar + Sair (limpa sessão)
// ---------------------------------------------------------

(function () {
  // ==============================
  // CONFIG
  // ==============================
  const LOGIN_PAGE_URL = "../login/login.html";
  const API_BASE = ""; // same-origin
  const API_USERS = `${API_BASE}/api/admin/users`;
  const API_USER_LOGS = (id) => `${API_USERS}/${id}/logs?limit=50`;

  // ==============================
  // STORAGE KEYS (compat)
  // ==============================
  const SESSION_USER_KEY = "conthub_user"; // ✅ novo padrão
  const CURRENT_USER_KEY = "conthub_current_user_id"; // legado (mantém, mas não depende)
  const MODULES_KEY = "conthub_module_status";

  // logs locais (fallback)
  const LOGS_KEY = "conthub_user_logs";

  // ==============================
  // DOM
  // ==============================
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

  // ==============================
  // Helpers (storage)
  // ==============================
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

  // ==============================
  // Session
  // ==============================
  function getSessionUser() {
    try {
      const raw = localStorage.getItem(SESSION_USER_KEY);
      if (!raw) return null;
      const u = JSON.parse(raw);
      return u && typeof u === "object" ? u : null;
    } catch {
      return null;
    }
  }

  function getLegacyCurrentUserId() {
    const v = localStorage.getItem(CURRENT_USER_KEY);
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function logout() {
    localStorage.removeItem(SESSION_USER_KEY);
    localStorage.removeItem(CURRENT_USER_KEY);
    window.location.href = LOGIN_PAGE_URL;
  }

  // ==============================
  // Helpers (ui)
  // ==============================
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

  // ==============================
  // API helper
  // ==============================
  async function fetchJson(url, opts = {}) {
    const session = getSessionUser();

    const res = await fetch(url, {
      method: opts.method || "GET",
      headers: {
        "Content-Type": "application/json",
        // ✅ ADICIONADO: manda ator p/ auditoria (opcional)
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
      const msg = (data && (data.error || data.message)) || `HTTP ${res.status}`;
      const err = new Error(msg);
      err.status = res.status;
      err.payload = data;
      throw err;
    }

    return data;
  }

  async function loadUserFromApi(userId) {
    const payload = await fetchJson(API_USERS, { method: "GET" });
    const list = Array.isArray(payload?.users) ? payload.users : Array.isArray(payload) ? payload : [];
    const u = list.find((x) => Number(x.id) === Number(userId));
    return u || null;
  }

  async function loadLogsFromApi(userId) {
    const payload = await fetchJson(API_USER_LOGS(userId), { method: "GET" });
    const list = payload?.logs || payload?.items || payload?.data || payload;
    return Array.isArray(list) ? list : [];
  }

  // ==============================
  // Modules (catálogo + status)
  // ==============================
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
    const store = readJSON(MODULES_KEY, {});
    if (id === "contadmin") return "admin";
    return store[id] || "online";
  }

  // regra simples de acesso:
  // - TI: tudo
  // - ADMIN: tudo
  // - USER: tudo menos contadmin
  function canAccessModule(role, moduleId) {
    const r = String(role || "user").toLowerCase();
    if (r === "ti") return true;
    if (r === "admin") return true;
    return moduleId !== "contadmin";
  }

  // ==============================
  // Logs (LOCAL fallback)
  // ==============================
  function pushLocalLog(userId, message) {
    const logsAll = readJSON(LOGS_KEY, {});
    if (!Array.isArray(logsAll[userId])) logsAll[userId] = [];

    logsAll[userId].unshift({ message, at: nowISO() });
    logsAll[userId] = logsAll[userId].slice(0, 15);

    writeJSON(LOGS_KEY, logsAll);
  }

  function renderLogsLocal(userId) {
    if (!elLogsList) return;

    const logsAll = readJSON(LOGS_KEY, {});
    const list = Array.isArray(logsAll[userId]) ? logsAll[userId] : [];

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

  // ==============================
  // Logs (BACKEND)
  // ==============================
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
    if (!elLogsList) return;

    // mostra um "carregando" leve sem apagar o local
    const old = elLogsList.innerHTML;
    elLogsList.innerHTML =
      old ||
      `<div class="muted" style="font-size:12px;">Carregando atividade…</div>`;

    try {
      const logs = await loadLogsFromApi(userId);

      if (!logs.length) {
        // mantém local fallback
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
      // se endpoint não existe, não “estraga” a UI
      console.warn("Logs backend indisponíveis:", err?.message || err);
      // mantém fallback local, não sobrescreve se já tinha conteúdo
      if (!old) renderLogsLocal(String(userId));
    }
  }

  // ==============================
  // Render Profile
  // ==============================
  function renderProfile(user) {
    const nome = String(user?.name ?? user?.nome ?? "Usuário").trim();
    const email = String(user?.email ?? "—").trim();

    // ✅ IMPORTANTE: backend usa "cargo" e "active". (não usa "ativo")
    const cargo = user?.cargo != null && String(user.cargo).trim() !== "" ? String(user.cargo).trim() : "—";
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

  // ==============================
  // Render Modules
  // ==============================
  function renderModules(user) {
    if (!elModulesList) return;

    const role = String(user?.role ?? "user").toLowerCase();

    elModulesList.innerHTML = MODULE_CATALOG.map((m) => {
      const allowed = canAccessModule(role, m.id);
      const st = getModuleStatus(m.id);

      const pillClass =
        st === "dev" ? "pill--dev" : st === "offline" ? "pill--off" : "pill--online";

      const pillText =
        st === "dev" ? "DEV" : st === "offline" ? "OFF" : st === "admin" ? "ADMIN" : "ONLINE";

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

  // ==============================
  // BOOT
  // ==============================
  const session = getSessionUser();

  // Se não tiver sessão, manda pro login
  if (!session) {
    logout();
    return;
  }

  // resolve userId
  const userId =
    session?.id != null
      ? Number(session.id)
      : getLegacyCurrentUserId();

  if (!userId) {
    logout();
    return;
  }

  // Render rápido com sessão (pode vir sem cargo)
  renderProfile(session);
  renderModules(session);

  // Logs: sempre salva local
  pushLocalLog(String(userId), "Acessou a página de perfil");
  renderLogsLocal(String(userId));

  // Depois, tenta atualizar dados e logs do backend
  (async () => {
    try {
      const apiUser = await loadUserFromApi(userId);
      if (apiUser) {
        renderProfile(apiUser);
        renderModules(apiUser);

        // ✅ opcional: atualiza sessão com dados mais completos (inclui cargo)
        // Isso evita “cargo —” em outras telas
        localStorage.setItem(SESSION_USER_KEY, JSON.stringify({ ...session, ...apiUser }));
      }
    } catch (err) {
      console.warn("Perfil: falha ao atualizar dados via API:", err?.message || err);
    }

    // logs backend (se existir endpoint)
    await loadLogsBackend(userId);
  })();

  // ==============================
  // Events
  // ==============================
  btnVoltar?.addEventListener("click", () => history.back());

  btnSair?.addEventListener("click", () => {
    pushLocalLog(String(userId), "Saiu (logout)");
    logout();
  });
})();
