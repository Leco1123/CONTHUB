// public/perfil/perfil.js
// PERFIL • JS (100% SESSION + API)
// ✅ Sessão real via /api/auth/me
// ✅ Perfil atualizado via /api/auth/profile
// ✅ Logs do backend via /api/admin/users/:id/logs
// ✅ Módulos do backend via /api/admin/modules

(function () {
  const LOGIN_PAGE_URL = "../login/login.html";
  const API_BASE = "";
  const API_MODULES = `${API_BASE}/api/admin/modules`;
  const API_USER_LOGS = (id) => `${API_BASE}/api/admin/users/${id}/logs?limit=50`;

  let AUTH_USER = null;
  let MODULES_ROWS = [];

  const elAvatar = document.getElementById("avatar");
  const elNome = document.getElementById("nome");
  const elEmail = document.getElementById("email");
  const elNivelAcesso = document.getElementById("nivelAcesso");
  const elPerfilAcesso = document.getElementById("perfilAcesso");
  const elCargo = document.getElementById("cargo");
  const elStatus = document.getElementById("status");
  const elCoordenador = document.getElementById("coordenador");
  const elEquipe = document.getElementById("equipe");
  const elUpdatedAt = document.getElementById("updatedAt");

  const elRoleBadge = document.getElementById("roleBadge");
  const elCargoBadge = document.getElementById("cargoBadge");
  const elStatusBadge = document.getElementById("statusBadge");

  const elModulesList = document.getElementById("modulesList");
  const elLogsList = document.getElementById("logsList");

  const btnVoltar = document.getElementById("btnVoltar");
  const btnSair = document.getElementById("btnSair");

  const MODULE_CATALOG = [
    { id: "dashboard", name: "Dashboard", desc: "Visão geral do ContHub.", icon: "🏠" },
    { id: "contflow", name: "ContFlow", desc: "Controle de rotinas e fluxo contábil.", icon: "⚡" },
    { id: "contanalytics", name: "ContAnalytics", desc: "KPIs, indicadores e painéis.", icon: "📊" },
    { id: "contdocs", name: "ContDocs", desc: "Centralização e gestão de documentos.", icon: "📁" },
    { id: "contrelatorios", name: "ContRelatórios", desc: "Geração de relatórios e exportações.", icon: "📈" },
    { id: "contconfig", name: "ContConfig", desc: "Parâmetros e configurações gerais.", icon: "⚙️" },
    { id: "contadmin", name: "ContAdmin Hub", desc: "Área administrativa e controle total.", icon: "🛡️" },
  ];

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
    const normalized = String(role || "user").trim().toLowerCase();
    if (normalized === "ti") return "TI";
    if (normalized === "admin") return "ADMIN";
    return "USER";
  }

  function accessProfileLabel(profile) {
    const normalized = String(profile || "").trim().toLowerCase();
    if (normalized === "ti") return "TI";
    if (normalized === "gerencial") return "Gerencial";
    if (normalized === "coordenacao") return "Coordenação";
    if (normalized === "consulta") return "Consulta";
    return "Operacional";
  }

  function normalizeName(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();
  }

  function avatarFromName(name) {
    const text = String(name || "").trim();
    return text ? text[0].toUpperCase() : "U";
  }

  function fmtTime(iso) {
    try {
      const date = new Date(iso);
      return date.toLocaleString("pt-BR");
    } catch {
      return "—";
    }
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function cleanText(value) {
    return String(value ?? "").trim();
  }

  function getDisplayValue(value, fallback = "—") {
    const text = cleanText(value);
    return text || fallback;
  }

  function normalizeModuleStatus(status, active) {
    const normalized = String(status || "").trim().toLowerCase();

    if (active === false) return "offline";
    if (normalized === "offline" || normalized === "off") return "offline";
    if (normalized === "dev") return "dev";
    if (normalized === "admin") return "admin";
    return "online";
  }

  function getSessionUserId(user) {
    if (!user || typeof user !== "object") return null;
    if (user.id == null || String(user.id).trim() === "") return null;

    const numeric = Number(user.id);
    return Number.isFinite(numeric) ? numeric : null;
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

      const message = (data && (data.error || data.message)) || `HTTP ${res.status}`;
      const err = new Error(message);
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

  async function loadProfileFromApi() {
    const payload = await fetchJson("/api/auth/me", { method: "GET" });
    return payload && typeof payload === "object" ? payload.user || payload : null;
  }

  async function loadModulesFromApi() {
    try {
      const payload = await fetchJson(API_MODULES, { method: "GET" });
      MODULES_ROWS = Array.isArray(payload?.modules) ? payload.modules : [];
      return MODULES_ROWS;
    } catch (err) {
      console.warn("Falha ao carregar módulos:", err?.message || err);
      MODULES_ROWS = [];
      return MODULES_ROWS;
    }
  }

  async function loadLogsFromApi(userId) {
    const payload = await fetchJson(API_USER_LOGS(userId), { method: "GET" });
    const list = payload?.logs || payload?.items || payload?.data || payload;
    return Array.isArray(list) ? list : [];
  }

  function normalizeLogLine(log) {
    const when = log.createdAt || log.timestamp || log.at || log.date || null;
    const action = log.action || log.event || log.type || "LOG";
    const by = log.actorEmail || log.actor || log.by || "";
    const msg = log.message || log.detail || "";

    return {
      when: when ? fmtTime(when) : "—",
      action: String(action),
      by: String(by || ""),
      msg: String(msg || ""),
    };
  }

  function renderLogsMessage(message) {
    if (!elLogsList) return;
    elLogsList.innerHTML = `<div class="muted" style="font-size:12px;">${escapeHtml(message)}</div>`;
  }

  async function renderLogs(userId) {
    if (!elLogsList) return;

    if (!userId) {
      renderLogsMessage("Sem identificação de usuário para carregar atividade.");
      return;
    }

    renderLogsMessage("Carregando atividade…");

    try {
      const logs = await loadLogsFromApi(userId);

      if (!logs.length) {
        renderLogsMessage("Sem logs no servidor ainda.");
        return;
      }

      elLogsList.innerHTML = logs
        .map(normalizeLogLine)
        .map(
          (line) => `
            <div class="log">
              <div class="log__msg">
                <strong>${escapeHtml(line.action)}</strong>
                ${line.msg ? " - " + escapeHtml(line.msg) : ""}
                ${line.by ? `<span class="muted" style="margin-left:8px;">(${escapeHtml(line.by)})</span>` : ""}
              </div>
              <div class="log__time">${escapeHtml(line.when)}</div>
            </div>
          `
        )
        .join("");
    } catch (err) {
      console.warn("Falha ao carregar logs do perfil:", err?.message || err);
      renderLogsMessage("Não foi possível carregar a atividade agora.");
    }
  }

  function getModuleCatalogMap() {
    return Object.fromEntries(MODULE_CATALOG.map((module) => [module.id, module]));
  }

  function getRenderableModules() {
    const catalogMap = getModuleCatalogMap();
    const rows = MODULES_ROWS.map((row) => {
      const id = cleanText(row.slug).toLowerCase();
      return {
        id,
        slug: id,
        name: cleanText(row.name) || catalogMap[id]?.name || id,
        desc: catalogMap[id]?.desc || "Módulo do ecossistema ContHub.",
        icon: catalogMap[id]?.icon || "•",
        status: row.status,
        active: row.active,
        access: row.access,
        order: row.order,
      };
    });

    const merged = new Map(rows.map((row) => [row.id, row]));
    MODULE_CATALOG.forEach((module, index) => {
      if (!merged.has(module.id)) {
        merged.set(module.id, {
          ...module,
          slug: module.id,
          status: "online",
          active: true,
          access: "user+admin",
          order: index + 1,
        });
      }
    });

    return Array.from(merged.values()).sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  }

  function normalizeModuleAccess(access) {
    return String(access || "")
      .split("+")
      .map((item) => cleanText(item).toLowerCase())
      .filter(Boolean);
  }

  function canAccessModule(user, module) {
    const role = cleanText(user?.role).toLowerCase();
    const accessProfile = cleanText(user?.accessProfile).toLowerCase();
    const moduleId = cleanText(module?.id || module?.slug).toLowerCase();
    const rules = normalizeModuleAccess(module?.access);

    if (role === "ti" || accessProfile === "ti") return true;
    if (!rules.length || rules.includes("user+admin")) return moduleId !== "contadmin";
    if (rules.includes("all") || rules.includes("*") || rules.includes("auth")) return true;
    if (rules.includes(role) || rules.includes(accessProfile)) return true;
    if (rules.includes("admin") && role === "admin") return true;
    return false;
  }

  function roleDescription(user) {
    const role = cleanText(user?.role).toLowerCase();
    const accessProfile = cleanText(user?.accessProfile).toLowerCase();

    if (role === "ti" || accessProfile === "ti") return "Acesso técnico total";
    if (role === "admin" || accessProfile === "gerencial") return "Acesso gerencial";
    if (accessProfile === "coordenacao") return "Acesso de coordenação";
    if (accessProfile === "consulta") return "Acesso somente leitura";
    return "Acesso operacional";
  }

  function renderProfile(user) {
    const nome = getDisplayValue(user?.nome || user?.name, "Usuário");
    const email = getDisplayValue(user?.email);
    const cargo = getDisplayValue(user?.cargo);
    const active =
      typeof user?.active === "boolean"
        ? user.active
        : typeof user?.ativo === "boolean"
        ? user.ativo
        : true;

    if (elAvatar) elAvatar.textContent = avatarFromName(nome);
    if (elNome) elNome.textContent = nome;
    if (elEmail) elEmail.textContent = email;
    if (elPerfilAcesso) elPerfilAcesso.textContent = accessProfileLabel(user?.accessProfile);
    if (elNivelAcesso) elNivelAcesso.textContent = roleDescription(user);
    if (elCargo) elCargo.textContent = cargo;
    if (elStatus) elStatus.textContent = active ? "Ativo" : "Inativo";
    if (elCoordenador) elCoordenador.textContent = getDisplayValue(user?.coordenador);
    if (elEquipe) elEquipe.textContent = getDisplayValue(user?.equipe);
    if (elUpdatedAt) elUpdatedAt.textContent = user?.updatedAt ? fmtTime(user.updatedAt) : "—";

    if (elRoleBadge) elRoleBadge.textContent = roleLabel(user?.role);
    if (elCargoBadge) elCargoBadge.textContent = cargo;
    if (elStatusBadge) {
      elStatusBadge.textContent = active ? "ATIVO" : "INATIVO";
      elStatusBadge.classList.toggle("badge--off", !active);
    }
  }

  function renderModules(user) {
    if (!elModulesList) return;

    const modules = getRenderableModules();
    elModulesList.innerHTML = modules
      .map((module) => {
        const allowed = canAccessModule(user, module);
        const status = normalizeModuleStatus(module.status, module.active);

        const pillClass =
          status === "dev" ? "pill--dev" : status === "offline" ? "pill--off" : "pill--online";

        const pillText =
          status === "dev"
            ? "DEV"
            : status === "offline"
            ? "OFF"
            : status === "admin"
            ? "ADMIN"
            : "ONLINE";

        return `
          <div class="module ${allowed ? "" : "module--blocked"}">
            <div class="module__left">
              <div class="module__icon">${escapeHtml(module.icon)}</div>
              <div class="module__text">
                <div class="module__name">${escapeHtml(module.name)}</div>
                <div class="module__desc">${escapeHtml(module.desc)}</div>
              </div>
            </div>

            <div class="module__right">
              <span class="pill ${pillClass}">${escapeHtml(pillText)}</span>
              <span class="lock">${allowed ? "Liberado" : "Bloqueado"}</span>
            </div>
          </div>
        `;
      })
      .join("");
  }

  async function init() {
    const session = await requireAuthOrRedirect();
    if (!session) return;

    renderProfile(session);
    await loadModulesFromApi();
    renderModules(session);
    await renderLogs(getSessionUserId(session));

    try {
      const profile = await loadProfileFromApi();
      if (profile) {
        AUTH_USER = { ...session, ...profile };
        renderProfile(AUTH_USER);
        renderModules(AUTH_USER);
        await renderLogs(getSessionUserId(AUTH_USER));
      }
    } catch (err) {
      console.warn("Falha ao carregar perfil atualizado:", err?.message || err);
    }
  }

  btnVoltar?.addEventListener("click", () => history.back());
  btnSair?.addEventListener("click", async () => {
    await logout();
  });

  init();
})();
