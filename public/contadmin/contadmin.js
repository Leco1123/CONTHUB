// =======================================
// CONTADMIN • JS PRINCIPAL (API-FIRST • BANCO + SESSÃO)
// ✅ CRUD via API (/api/admin/users)
// ✅ Sessão 100% via backend (/api/auth/me)
// ✅ Logout real via backend (/api/auth/logout)
// ✅ Módulos via banco (/api/admin/modules)
// ✅ Sem localStorage para sessão
// ✅ Sem localStorage para status de módulos
// ✅ Validação: email obrigatório @franco-rnc.com.br
// ✅ Validação: senha forte
// ✅ Editar usuário NÃO exige senha
// ✅ Logs: GET /api/admin/users/:id/logs?limit=50
// ✅ Auditoria: envia headers X-User-Id / X-User-Email
// =======================================

console.log("🚀 ContAdmin JS carregando (API-FIRST • BANCO + SESSÃO)...");

document.addEventListener("DOMContentLoaded", () => {
  console.log("✅ DOM totalmente carregado");

  // =======================================
  // CONFIG
  // =======================================
  const USER_PAGE_URL = "../perfil/perfil.html";
  const LOGIN_PAGE_URL = "../login/login.html";

  const API_BASE = "";
  const API_USERS = `${API_BASE}/api/admin/users`;
  const API_MODULES = `${API_BASE}/api/admin/modules`;
  const API_USER_LOGS = (id) => `${API_USERS}/${id}/logs?limit=50`;

  const COMPANY_DOMAIN = "@franco-rnc.com.br";
  const PASSWORD_POLICY =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

  // =======================================
  // STATE
  // =======================================
  let currentUser = null;
  let moduleStatusMap = {};
  let modulesDbRows = [];

  // =======================================
  // NAV (TOP SAFE)
  // =======================================
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

  // =======================================
  // SESSION
  // =======================================
  function getSessionUser() {
    return currentUser;
  }

  async function loadSessionUser() {
    const data = await fetchJson("/api/auth/me", { method: "GET" });
    currentUser = data?.user || null;
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

  async function logout() {
    console.log("🔴 logout()");

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

  // =======================================
  // API HELPERS
  // =======================================
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
      console.error("❌ API ERROR", {
        url,
        method: opts.method || "GET",
        status: res.status,
        statusText: res.statusText,
        response: data,
      });

      if (res.status === 401) {
        currentUser = null;
        alert("Sua sessão expirou. Faça login novamente.");
        goto(LOGIN_PAGE_URL);
        return null;
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

  function normalizeUsersResponse(payload) {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;

    const cands = [
      payload.users,
      payload.data,
      payload.rows,
      payload.result,
      payload.items,
    ];

    for (const c of cands) {
      if (Array.isArray(c)) return c;
    }

    return [];
  }

  function normalizeUser(u) {
    if (!u || typeof u !== "object") return null;

    const id = Number(u.id);
    const nome = String(u.nome ?? u.name ?? "").trim();
    const email = String(u.email ?? "").trim().toLowerCase();
    const cargo = u.cargo != null ? String(u.cargo).trim() : "";
    const role = String(u.role ?? "user").toLowerCase();

    const ativo =
      typeof u.ativo === "boolean"
        ? u.ativo
        : typeof u.active === "boolean"
        ? u.active
        : true;

    return {
      id,
      nome,
      email,
      cargo,
      role,
      ativo,
      createdAt: u.createdAt ?? null,
      updatedAt: u.updatedAt ?? null,
    };
  }

  function normalizeModuleStatus(status, active) {
    const s = String(status || "").trim().toLowerCase();

    if (active === false) return "offline";
    if (s === "offline" || s === "off") return "offline";
    if (s === "dev") return "dev";
    if (s === "admin") return "admin";
    return "online";
  }

  // =======================================
  // API: MODULES
  // =======================================
  async function apiListModules() {
    const payload = await fetchJson(API_MODULES, { method: "GET" });
    return Array.isArray(payload?.modules) ? payload.modules : [];
  }

  async function apiSaveModules(rows) {
    await fetchJson(API_MODULES, {
      method: "PUT",
      body: { modules: rows },
    });
  }

  async function loadModulesFromApi() {
    const rows = await apiListModules();
    modulesDbRows = Array.isArray(rows) ? rows : [];

    const map = {};
    modulesDbRows.forEach((m) => {
      const slug = String(m.slug || "").trim().toLowerCase();
      if (!slug) return;
      map[slug] = normalizeModuleStatus(m.status, m.active);
    });

    moduleStatusMap = map;
    return map;
  }

  // =======================================
  // REGRAS: EMAIL + SENHA
  // =======================================
  function ensureCompanyEmail(raw) {
    const s = String(raw || "").trim().toLowerCase();

    if (!s) {
      return { ok: false, value: "", error: "Email é obrigatório." };
    }

    if (!s.includes("@")) {
      return { ok: true, value: `${s}${COMPANY_DOMAIN}` };
    }

    if (!s.endsWith(COMPANY_DOMAIN)) {
      return {
        ok: false,
        value: s,
        error: `Email deve ser do domínio ${COMPANY_DOMAIN}`,
      };
    }

    return { ok: true, value: s };
  }

  function validateStrongPassword(pw) {
    const s = String(pw || "");

    if (!s) {
      return { ok: false, error: "Senha é obrigatória." };
    }

    if (!PASSWORD_POLICY.test(s)) {
      return {
        ok: false,
        error:
          "Senha fraca. Use no mínimo 8 caracteres com 1 maiúscula, 1 minúscula, 1 número e 1 símbolo.",
      };
    }

    return { ok: true };
  }

  // =======================================
  // SIDEBAR • ABRIR / FECHAR
  // =======================================
  const menuBtn = document.getElementById("menuBtn");
  const overlay = document.getElementById("overlay");

  function setOverlayState() {
    if (!overlay) return;

    const open = document.body.classList.contains("sidebar-open");

    overlay.style.pointerEvents = open ? "auto" : "none";
    overlay.style.opacity = open ? "1" : "0";
    overlay.setAttribute("aria-hidden", open ? "false" : "true");
  }

  menuBtn?.addEventListener("click", () => {
    document.body.classList.toggle("sidebar-open");
    setOverlayState();
  });

  overlay?.addEventListener("click", () => {
    document.body.classList.remove("sidebar-open");
    setOverlayState();
  });

  setOverlayState();

  // =======================================
  // ABAS
  // =======================================
  const abas = document.querySelectorAll(".aba-conthub");
  const views = document.querySelectorAll(".visualizacao-conthub");

  abas.forEach((aba) => {
    aba.addEventListener("click", () => {
      const alvo = aba.dataset.visualizacao;
      if (!alvo) return;

      abas.forEach((a) => a.classList.remove("ativa"));
      views.forEach((v) => v.classList.remove("ativa"));

      aba.classList.add("ativa");
      document.getElementById(alvo)?.classList.add("ativa");

      if (alvo === "acessos") renderAdminPanel();
    });
  });

  // =======================================
  // STATUS DOS MÓDULOS
  // =======================================
  const statusLabel = {
    online: "ONLINE",
    dev: "DEV",
    offline: "OFF",
    admin: "ADMIN",
  };

  function readModuleStore() {
    return moduleStatusMap || {};
  }

  function writeModuleStore(obj) {
    moduleStatusMap = { ...obj };
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
    const store = readModuleStore();

    getSidebarCards().forEach((btn) => {
      const moduleId = btn.dataset.moduleId;
      if (!moduleId) return;

      const def = moduleId === "contadmin" ? "admin" : "online";
      applyStatusToSidebar(moduleId, store[moduleId] || def);
    });
  }

  document
    .querySelectorAll(".modulos-sidebar .cards-modulos[data-src]")
    .forEach((button) => {
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

  // =======================================
  // PAINEL "STATUS DE ACESSO"
  // =======================================
  function renderAdminPanel() {
    const grid = document.getElementById("acessosGrid");
    if (!grid) return;

    const store = readModuleStore();
    const sidebarCards = getSidebarCards();
    grid.innerHTML = "";

    sidebarCards.forEach((card) => {
      const id = card.dataset.moduleId;
      if (!id) return;

      const icon = card.querySelector(".icone-modulo")?.textContent?.trim() || "📦";
      const title =
        card.dataset.title ||
        card.querySelector(".placeholder-titulo")?.textContent?.trim() ||
        "Módulo";
      const subtitle =
        card.dataset.subtitle ||
        card.querySelector(".placeholder")?.textContent?.trim() ||
        "";

      const isAdminModule = id === "contadmin";
      const current = isAdminModule ? "admin" : store[id] || "online";

      const wrap = document.createElement("div");
      wrap.className = "cards-modulos";
      wrap.setAttribute("data-module-id", id);

      wrap.innerHTML = `
        <span class="icone-modulo">${icon}</span>
        <span class="plaquinha-de-nome">
          <span class="placeholder-titulo">${title}</span>
          <span class="placeholder">${subtitle}</span>
        </span>
        <span class="acesso-actions">
          <span class="status" data-status="${current}">${statusLabel[current] || "ONLINE"}</span>
          <button type="button" data-set="online">ON</button>
          <button type="button" data-set="dev">DEV</button>
          <button type="button" data-set="offline">OFF</button>
        </span>
      `;

      if (isAdminModule) {
        wrap
          .querySelectorAll('button[data-set]')
          .forEach((b) => (b.disabled = true));
      }

      grid.appendChild(wrap);
    });
  }

  function bindAdminPanelEvents() {
    const grid = document.getElementById("acessosGrid");
    if (!grid || grid.__bound) return;
    grid.__bound = true;

    grid.addEventListener("click", async (e) => {
      const btn = e.target.closest("button[data-set]");
      if (!btn) return;

      const card = e.target.closest(".cards-modulos[data-module-id]");
      if (!card) return;

      const moduleId = card.getAttribute("data-module-id");
      if (!moduleId || moduleId === "contadmin") return;

      const next = btn.getAttribute("data-set");
      if (!next) return;

      try {
        const storeNow = readModuleStore();
        storeNow[moduleId] = next;
        writeModuleStore(storeNow);

        const currentRows = Array.isArray(modulesDbRows) ? [...modulesDbRows] : [];
        const row = currentRows.find(
          (m) => String(m.slug || "").toLowerCase() === String(moduleId).toLowerCase()
        );

        if (!row) {
          alert(`Módulo "${moduleId}" não encontrado no banco.`);
          return;
        }

        const nextStatus =
          next === "offline"
            ? "offline"
            : next === "dev"
            ? "dev"
            : row.slug === "contadmin"
            ? "admin"
            : "online";

        row.status = nextStatus;
        row.active = next !== "offline";

        await apiSaveModules(currentRows);
        await loadModulesFromApi();

        syncSidebarFromStore();
        renderAdminPanel();
      } catch (err) {
        console.error("❌ Falha ao salvar status do módulo:", err);
        alert(`Erro ao salvar status do módulo: ${err?.message || err}`);
      }
    });
  }

  // =======================================
  // MODAL + FORM
  // =======================================
  const listaUsuarios = document.getElementById("lista-usuarios");
  const modal = document.getElementById("modalUsuario");
  const form = document.getElementById("formUsuario");
  const btnNovoUsuario = document.getElementById("btnNovoUsuario");
  const btnCancelar = document.getElementById("cancelarModal");

  let usuarios = [];
  let modoEdicao = false;
  let idEmEdicao = null;

  function openModal() {
    modal?.classList.add("ativo");
    document.body.classList.add("modal-open");
    modal?.setAttribute("aria-hidden", "false");
  }

  function closeModal({ reset = true } = {}) {
    modal?.classList.remove("ativo");
    document.body.classList.remove("modal-open");
    modal?.setAttribute("aria-hidden", "true");

    if (reset) form?.reset();

    modoEdicao = false;
    idEmEdicao = null;

    if (form?.senha) form.senha.required = true;
    if (form?.confirmarSenha) form.confirmarSenha.required = true;
  }

  modal?.addEventListener("click", (e) => {
    if (e.target === modal) closeModal({ reset: true });
  });

  // =======================================
  // ROLE SELECT (UI)
  // =======================================
  const ROLE_DEFAULT = "user";

  function ensureRoleStyle() {
    if (document.getElementById("roleMiniStyle")) return;

    const st = document.createElement("style");
    st.id = "roleMiniStyle";
    st.textContent = `
      #roleBox{
        margin-top:6px;
        padding:10px;
        border:1px solid rgba(255,255,255,0.12);
        border-radius:10px;
        background:rgba(255,255,255,0.04);
      }
      .role-select{
        width:100%;
        height:36px;
        border-radius:10px;
        border:1px solid rgba(255,255,255,0.12);
        background:rgba(255,255,255,0.06);
        color:rgba(232,237,246,0.9);
        font-weight:900;
        padding:0 10px;
        outline:none;
        cursor:pointer;
      }
    `;
    document.head.appendChild(st);
  }

  ensureRoleStyle();

  function ensureRoleBox() {
    if (!form) return null;

    let box = document.getElementById("roleBox");
    if (box) return box;

    box = document.createElement("div");
    box.id = "roleBox";

    const acoes = form.querySelector(".acoes-form");
    if (acoes) form.insertBefore(box, acoes);
    else form.appendChild(box);

    return box;
  }

  function renderRoleSelect(currentRole, usuarioRef) {
    const box = ensureRoleBox();
    if (!box) return;

    const ctxRole = String(usuarioRef?.role || ROLE_DEFAULT).toLowerCase();
    const disableTIOption = String(currentRole || "").toLowerCase() === "admin";

    box.innerHTML = `
      <div style="font-weight:900; font-size:12px; letter-spacing:.4px; text-transform:uppercase; color:rgba(232,237,246,.85); margin:6px 0 10px 0;">
        FUNÇÃO (ACESSO)
      </div>
      <select id="roleSelect" class="role-select">
        <option value="user" ${ctxRole === "user" ? "selected" : ""}>USER</option>
        <option value="admin" ${ctxRole === "admin" ? "selected" : ""}>ADMIN</option>
        <option value="ti" ${ctxRole === "ti" ? "selected" : ""} ${disableTIOption ? "disabled" : ""}>TI</option>
      </select>
    `;
  }

  // =======================================
  // SELECT CARGO (UI)
  // =======================================
  const inputCargo = document.getElementById("cargo");
  const listaCargos = document.querySelector(".lista-cargos");

  function setCargoOpen(open) {
    if (!listaCargos || !inputCargo) return;

    listaCargos.style.display = open ? "block" : "none";
    inputCargo.setAttribute("aria-expanded", open ? "true" : "false");
  }

  if (inputCargo) {
    inputCargo.setAttribute("role", "combobox");
    inputCargo.setAttribute("aria-expanded", "false");
    inputCargo.setAttribute("aria-haspopup", "listbox");
  }

  inputCargo?.addEventListener("click", () => {
    if (!listaCargos) return;
    const isOpen = listaCargos.style.display === "block";
    setCargoOpen(!isOpen);
  });

  listaCargos?.querySelectorAll("li").forEach((item) => {
    item.addEventListener("click", () => {
      if (!inputCargo) return;
      inputCargo.value = item.textContent.trim();
      setCargoOpen(false);
    });
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".select-cargo")) setCargoOpen(false);
  });

  // =======================================
  // USER CARD + LOGOUT
  // =======================================
  const userCard =
    document.querySelector("[data-usercard]") || document.querySelector(".usercard");
  const btnLogout =
    document.querySelector("[data-logout]") || document.querySelector(".btn--sair");

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

  function renderUserCard() {
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

  function goPerfil() {
    goto(USER_PAGE_URL);
  }

  function hardForceClickable() {
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

    setOverlayState();
  }

  hardForceClickable();
  setTimeout(hardForceClickable, 50);
  setTimeout(hardForceClickable, 250);
  setTimeout(hardForceClickable, 800);

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
        goPerfil();
      },
      true
    );
  });

  // =======================================
  // PERMISSÃO DE ACESSO AO CONTADMIN (UI)
  // =======================================
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

  // =======================================
  // API: USERS CRUD + LOGS
  // =======================================
  async function apiListUsers() {
    const payload = await fetchJson(API_USERS, { method: "GET" });
    return normalizeUsersResponse(payload).map(normalizeUser).filter(Boolean);
  }

  async function apiCreateUser(body) {
    const payload = await fetchJson(API_USERS, {
      method: "POST",
      body: {
        name: body.nome,
        nome: body.nome,
        email: body.email,
        cargo: body.cargo,
        role: body.role,
        active: body.ativo,
        ativo: body.ativo,
        password: body.senha,
        senha: body.senha,
      },
    });

    const u = payload?.user ? payload.user : payload;
    return normalizeUser(u);
  }

  async function apiUpdateUser(id, body) {
    const payload = await fetchJson(`${API_USERS}/${id}`, {
      method: "PUT",
      body: {
        name: body.nome,
        nome: body.nome,
        email: body.email,
        cargo: body.cargo,
        role: body.role,
        active: body.ativo,
        ativo: body.ativo,
      },
    });

    const u = payload?.user ? payload.user : payload;
    return normalizeUser(u);
  }

  async function apiToggleUser(id) {
    const payload = await fetchJson(`${API_USERS}/${id}/toggle`, { method: "PATCH" });
    const u = payload?.user ? payload.user : payload;
    return normalizeUser(u);
  }

  async function apiDeleteUser(id) {
    await fetchJson(`${API_USERS}/${id}`, { method: "DELETE" });
    return true;
  }

  async function apiUpdatePassword(id, senha) {
    await fetchJson(`${API_USERS}/${id}/password`, {
      method: "PUT",
      body: { password: senha, senha },
    });
    return true;
  }

  async function apiFetchLogs(id) {
    const payload = await fetchJson(API_USER_LOGS(id), { method: "GET" });
    const list = payload?.logs || payload?.items || payload?.data || payload;
    return Array.isArray(list) ? list : [];
  }

  // =======================================
  // LOGS MODAL
  // =======================================
  function ensureLogsModal() {
    let m = document.getElementById("modalLogs");
    if (m) return m;

    m = document.createElement("div");
    m.id = "modalLogs";
    m.style.cssText = `
      position:fixed; inset:0; display:none; place-items:center;
      background:rgba(0,0,0,0.55); z-index:10000000; padding:16px;
    `;

    m.innerHTML = `
      <div style="width:min(880px, 96vw); max-height:82vh; overflow:auto;
                  background:rgba(18,22,34,0.98); border:1px solid rgba(255,255,255,0.10);
                  border-radius:16px; padding:14px;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:10px;">
          <div>
            <div id="logsTitle" style="font-weight:900; font-size:14px; letter-spacing:.4px;">Logs</div>
            <div id="logsSub" style="opacity:.8; font-size:12px;">—</div>
          </div>
          <button id="logsClose" type="button"
            style="border-radius:10px; padding:8px 12px; border:1px solid rgba(255,255,255,0.12);
                   background:rgba(255,255,255,0.06); color:rgba(232,237,246,0.95); font-weight:900; cursor:pointer;">
            Fechar
          </button>
        </div>

        <div id="logsBody" style="font-family:ui-monospace, SFMono-Regular, Menlo, monospace;
              font-size:12px; line-height:1.45; white-space:pre-wrap; opacity:.95;"></div>
      </div>
    `;

    document.body.appendChild(m);

    m.querySelector("#logsClose")?.addEventListener("click", () => {
      m.style.display = "none";
      document.body.classList.remove("modal-open");
    });

    m.addEventListener("click", (e) => {
      if (e.target === m) {
        m.style.display = "none";
        document.body.classList.remove("modal-open");
      }
    });

    return m;
  }

  async function openLogsForUser(usuario) {
    const m = ensureLogsModal();
    const title = m.querySelector("#logsTitle");
    const sub = m.querySelector("#logsSub");
    const body = m.querySelector("#logsBody");

    title.textContent = `Logs • ${usuario.nome || "(sem nome)"}`;
    sub.textContent = `${usuario.email || ""} • ${roleLabel(usuario.role)} • ${usuario.cargo || ""}`;
    body.textContent = "Carregando logs...";

    m.style.display = "grid";
    document.body.classList.add("modal-open");

    try {
      const logs = await apiFetchLogs(usuario.id);

      if (!logs.length) {
        body.textContent = "Sem logs registrados para este usuário.";
        return;
      }

      const lines = logs.map((x) => {
        const when = x.createdAt || x.timestamp || x.at || x.date || "";
        const act = x.action || x.event || x.type || "log";
        const by = x.actorEmail || x.actor || x.by || "";
        const msg = x.message || x.detail || "";
        const meta = x.meta ? ` ${JSON.stringify(x.meta)}` : "";
        return `${when}  [${act}]  ${by}  ${msg}${meta}`.trim();
      });

      body.textContent = lines.join("\n");
    } catch (err) {
      body.textContent =
        "Não foi possível carregar logs.\n\n" +
        `Erro: ${err?.message || err}\n\n` +
        "Confere se você criou a rota no backend:\nGET /api/admin/users/:id/logs";
    }
  }

  // =======================================
  // RENDER USERS TABLE
  // =======================================
  function renderizarUsuarios() {
    if (!listaUsuarios) return;
    listaUsuarios.innerHTML = "";

    if (!usuarios.length) {
      listaUsuarios.innerHTML = `
        <tr>
          <td colspan="5" class="muted" style="text-align:center;">
            Nenhum usuário encontrado
          </td>
        </tr>
      `;
      return;
    }

    const current = getSessionUser();
    const currentRole = (current?.role || "user").toLowerCase();

    usuarios.forEach((usuario) => {
      const protegido =
        currentRole === "admin" && (usuario.role || "").toLowerCase() === "ti";
      const funcao = roleLabel(usuario.role);

      listaUsuarios.innerHTML += `
        <tr>
          <td>${usuario.nome || ""}</td>
          <td>${usuario.email || ""}</td>
          <td>
            ${usuario.cargo || ""}
            <span class="muted" style="font-size:11px;">(${funcao})</span>
          </td>
          <td>
            <span class="status ${usuario.ativo ? "ativo" : "inativo"}">
              ${usuario.ativo ? "Ativo" : "Inativo"}
            </span>
          </td>
          <td>
            ${
              protegido
                ? `<span class="muted">Protegido</span>`
                : `
                  <button class="btn-acao btn-editar" data-id="${usuario.id}">Editar</button>
                  <button class="btn-acao btn-toggle" data-id="${usuario.id}">
                    ${usuario.ativo ? "Desativar" : "Ativar"}
                  </button>
                  <button class="btn-acao btn-logs" data-id="${usuario.id}">Logs</button>
                  <button class="btn-acao btn-excluir" data-id="${usuario.id}">Excluir</button>
                `
            }
          </td>
        </tr>
      `;
    });
  }

  // =======================================
  // LOAD USERS (API)
  // =======================================
  async function carregarUsuariosDaAPI() {
    try {
      usuarios = await apiListUsers();
      renderizarUsuarios();
    } catch (err) {
      console.error("❌ Falha ao listar usuários (API):", err);
      alert("Erro ao listar usuários. Veja o console (F12) para o detalhe.");
      usuarios = [];
      renderizarUsuarios();
    }
  }

  // =======================================
  // NOVO / EDITAR
  // =======================================
  btnNovoUsuario?.addEventListener("click", () => {
    modoEdicao = false;
    idEmEdicao = null;
    form?.reset();

    if (form?.senha) form.senha.required = true;
    if (form?.confirmarSenha) form.confirmarSenha.required = true;

    const current = getSessionUser();
    renderRoleSelect((current?.role || "user").toLowerCase(), {
      role: ROLE_DEFAULT,
    });

    const h3 = form?.querySelector("h3");
    if (h3) h3.textContent = "Novo Usuário";

    openModal();
  });

  btnCancelar?.addEventListener("click", () => closeModal({ reset: true }));

  function editarUsuario(id) {
    const usuario = usuarios.find((u) => Number(u.id) === Number(id));
    if (!usuario) return;

    const current = getSessionUser();
    const currentRole = (current?.role || "user").toLowerCase();

    if (currentRole === "admin" && (usuario.role || "").toLowerCase() === "ti") {
      alert("ADMIN não pode alterar usuários TI.");
      return;
    }

    modoEdicao = true;
    idEmEdicao = id;

    form.nome.value = usuario.nome || "";
    form.email.value = usuario.email || "";
    form.cargo.value = usuario.cargo || "";

    if (form?.senha) {
      form.senha.value = "";
      form.senha.required = false;
    }

    if (form?.confirmarSenha) {
      form.confirmarSenha.value = "";
      form.confirmarSenha.required = false;
    }

    const h3 = form?.querySelector("h3");
    if (h3) h3.textContent = "Editar Usuário";

    renderRoleSelect(currentRole, usuario);
    openModal();
  }

  async function toggleStatusUsuario(id) {
    const usuario = usuarios.find((u) => Number(u.id) === Number(id));
    if (!usuario) return;

    const current = getSessionUser();
    const currentRole = (current?.role || "user").toLowerCase();

    if (currentRole === "admin" && (usuario.role || "").toLowerCase() === "ti") {
      alert("ADMIN não pode alterar usuários TI.");
      return;
    }

    try {
      const updated = await apiToggleUser(id);
      usuarios = usuarios.map((u) => (Number(u.id) === Number(id) ? updated : u));
      renderizarUsuarios();
    } catch (err) {
      console.error("❌ Falha ao alternar status:", err);
      alert("Erro ao alterar status. Veja o console (F12).");
    }
  }

  async function excluirUsuario(id) {
    const usuario = usuarios.find((u) => Number(u.id) === Number(id));
    if (!usuario) return;

    const current = getSessionUser();
    const currentRole = (current?.role || "user").toLowerCase();

    if (currentRole === "admin" && (usuario.role || "").toLowerCase() === "ti") {
      alert("ADMIN não pode excluir usuário TI.");
      return;
    }

    const ok = confirm(`Excluir o usuário "${usuario.nome}"?`);
    if (!ok) return;

    try {
      await apiDeleteUser(id);
      usuarios = usuarios.filter((u) => Number(u.id) !== Number(id));
      renderizarUsuarios();
    } catch (err) {
      console.error("❌ Falha ao excluir:", err);
      alert("Erro ao excluir. Veja o console (F12).");
    }
  }

  async function abrirLogsUsuario(id) {
    const usuario = usuarios.find((u) => Number(u.id) === Number(id));
    if (!usuario) return;
    await openLogsForUser(usuario);
  }

  // =======================================
  // SUBMIT (CREATE / EDIT)
  // =======================================
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const nome = String(form.nome?.value || "").trim();
    const emailRaw = String(form.email?.value || "").trim();
    const cargo = String(form.cargo?.value || "").trim();
    const senha = String(form.senha?.value || "");
    const confirmarSenha = form.confirmarSenha
      ? String(form.confirmarSenha.value || "")
      : "";

    if (!nome || !emailRaw || !cargo) {
      alert("Preencha todos os campos obrigatórios");
      return;
    }

    const emailCheck = ensureCompanyEmail(emailRaw);
    if (!emailCheck.ok) return alert(emailCheck.error);
    const email = emailCheck.value;

    const roleSel = document.getElementById("roleSelect");
    const selectedRole = String(roleSel?.value || ROLE_DEFAULT).toLowerCase();

    const current = getSessionUser();
    const creatorRole = (current?.role || "user").toLowerCase();

    if (creatorRole === "admin" && selectedRole === "ti") {
      alert("ADMIN não pode criar/alterar usuário TI.");
      return;
    }

    if (!modoEdicao) {
      const pw = validateStrongPassword(senha);
      if (!pw.ok) return alert(pw.error);
      if (senha !== confirmarSenha) return alert("As senhas não conferem.");
    } else if (senha) {
      const pw = validateStrongPassword(senha);
      if (!pw.ok) return alert(pw.error);
      if (senha !== confirmarSenha) return alert("As senhas não conferem.");
    }

    try {
      if (modoEdicao) {
        const id = idEmEdicao;
        if (!id) return;

        const updated = await apiUpdateUser(id, {
          id,
          nome,
          email,
          cargo,
          role: selectedRole,
          ativo: true,
        });

        if (senha) {
          await apiUpdatePassword(id, senha);
        }

        usuarios = usuarios.map((u) =>
          Number(u.id) === Number(id) ? updated : u
        );
      } else {
        const created = await apiCreateUser({
          nome,
          email,
          cargo,
          role: selectedRole,
          ativo: true,
          senha,
        });

        if (!created || !created.id) {
          await carregarUsuariosDaAPI();
        } else {
          usuarios = [created, ...usuarios];
        }
      }

      renderizarUsuarios();
      closeModal({ reset: true });
    } catch (err) {
      console.error("❌ Falha ao salvar usuário:", err);
      alert(`Erro ao salvar usuário: ${err.message || "ver console (F12)"}`);
    }
  });

  // =======================================
  // TABELA: AÇÕES
  // =======================================
  listaUsuarios?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-id]");
    if (!btn) return;

    const id = Number(btn.dataset.id);
    if (!id) return;

    if (btn.classList.contains("btn-editar")) return editarUsuario(id);
    if (btn.classList.contains("btn-toggle")) return toggleStatusUsuario(id);
    if (btn.classList.contains("btn-excluir")) return excluirUsuario(id);
    if (btn.classList.contains("btn-logs")) return abrirLogsUsuario(id);
  });

  // =======================================
  // INIT
  // =======================================
  async function init() {
    try {
      await loadSessionUser();

      if (!currentUser) {
        goto(LOGIN_PAGE_URL);
        return;
      }

      await loadModulesFromApi();

      syncSidebarFromStore();
      renderAdminPanel();
      bindAdminPanelEvents();
      applyRoleToSidebar();
      renderUserCard();

      await carregarUsuariosDaAPI();

      console.log("🎉 ContAdmin JS inicializado!");
    } catch (err) {
      console.error("❌ Falha ao inicializar ContAdmin:", err);
      alert("Sessão inválida ou expirada. Faça login novamente.");
      goto(LOGIN_PAGE_URL);
    }
  }

  init();
});