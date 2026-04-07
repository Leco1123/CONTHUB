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
  const API_TEAM_CONFIG = `${API_BASE}/api/admin/team-config`;
  const API_USER_LOGS = (id) => `${API_USERS}/${id}/logs?limit=50`;

  const COMPANY_DOMAIN = "@franco-rnc.com.br";
  const PASSWORD_POLICY =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
  const TEAM_EDITORS = ["leandro", "gabriella"];
  const ACCESS_PROFILES = [
    { value: "ti", label: "TI", description: "Controle total do sistema, usuários, módulos e configurações." },
    { value: "gerencial", label: "Gerencial", description: "Visão ampla, relatórios e gestão global." },
    { value: "coordenacao", label: "Coordenação", description: "Gestão da própria equipe e acompanhamento operacional." },
    { value: "operacional", label: "Operacional", description: "Rotina diária e execução dos módulos de trabalho." },
    { value: "consulta", label: "Consulta", description: "Acompanhamento somente leitura." },
  ];

  // =======================================
  // STATE
  // =======================================
  let currentUser = null;
  let moduleStatusMap = {};
  let modulesDbRows = [];
  let teamConfig = {};
  let userTeamMap = {};
  let userAccessMap = {};

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

  function accessProfileLabel(profile) {
    const normalized = String(profile || "").trim().toLowerCase();
    return ACCESS_PROFILES.find((item) => item.value === normalized)?.label || "Operacional";
  }

  function legacyRoleToAccessProfile(role) {
    const normalized = String(role || "").trim().toLowerCase();
    if (normalized === "ti") return "ti";
    if (normalized === "admin") return "gerencial";
    return "operacional";
  }

  function accessProfileToLegacyRole(profile) {
    const normalized = String(profile || "").trim().toLowerCase();
    if (normalized === "ti") return "ti";
    if (normalized === "gerencial") return "admin";
    return "user";
  }

  function normalizeAccessProfile(value) {
    const normalized = String(value || "").trim().toLowerCase();
    return ACCESS_PROFILES.some((item) => item.value === normalized) ? normalized : "operacional";
  }

  function avatarFromName(name) {
    const t = String(name || "").trim();
    return t ? t[0].toUpperCase() : "U";
  }

  function normalizeName(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();
  }

  function matchConfiguredValue(options, value) {
    const target = normalizeName(value);
    if (!target) return "";
    return options.find((option) => normalizeName(option) === target) || "";
  }

  function sortDisplayNames(values) {
    return [...values].sort((a, b) =>
      String(a || "").localeCompare(String(b || ""), "pt-BR", { sensitivity: "base" })
    );
  }

  function getConfiguredCoordinatorList() {
    return sortDisplayNames(
      Object.keys(teamConfig || {})
        .map((value) => cleanText(value))
        .filter(Boolean)
    );
  }

  function getAssignedCoordinatorList() {
    return sortDisplayNames(
      usuarios
        .map((user) => cleanText(user?.coordenador))
        .filter(Boolean)
    );
  }

  function getCoordinatorList() {
    return sortDisplayNames(
      Array.from(new Set([...getConfiguredCoordinatorList(), ...getAssignedCoordinatorList()]))
    );
  }

  function getTeamsForCoordinator(coordinator) {
    const safeCoordinator = cleanText(coordinator);
    if (!safeCoordinator) return [];

    const configuredCoordinator = matchConfiguredValue(getConfiguredCoordinatorList(), safeCoordinator);
    const resolvedCoordinator = configuredCoordinator || safeCoordinator;

    const configuredTeams = Object.entries(teamConfig || {})
      .filter(([name]) => normalizeName(name) === normalizeName(resolvedCoordinator))
      .flatMap(([, teams]) => (Array.isArray(teams) ? teams : []))
      .map((team) => cleanText(team))
      .filter(Boolean);

    const assignedTeams = usuarios
      .filter((user) => normalizeName(user?.coordenador) === normalizeName(resolvedCoordinator))
      .map((user) => cleanText(user?.equipe))
      .filter(Boolean);

    return sortDisplayNames(Array.from(new Set([...configuredTeams, ...assignedTeams])));
  }

  function getDefaultCoordinator(preferred = "") {
    const coordinators = getCoordinatorList();
    const resolvedPreferred = resolveCoordinatorName(preferred);
    if (resolvedPreferred) return resolvedPreferred;
    return coordinators[0] || "";
  }

  function resolveCoordinatorName(value) {
    const cleaned = cleanText(value);
    if (!cleaned) return "";
    return matchConfiguredValue(getCoordinatorList(), cleaned) || cleaned;
  }

  function resolveTeamName(coordinator, value) {
    const safeCoordinator = resolveCoordinatorName(coordinator);
    const cleaned = cleanText(value);
    if (!cleaned) return "";
    if (!safeCoordinator) return "";
    return matchConfiguredValue(getTeamsForCoordinator(safeCoordinator), cleaned) || cleaned;
  }

  function teamKey(value) {
    return normalizeName(value);
  }

  function findCoordinatorByTeamName(value) {
    const target = normalizeName(value);
    if (!target) return "";

    for (const coordinator of getCoordinatorList()) {
      const match = getTeamsForCoordinator(coordinator).some(
        (team) => normalizeName(team) === target
      );
      if (match) return coordinator;
    }

    return "";
  }

  function normalizeAssignment(assignment) {
    const rawCoordinator = cleanText(assignment?.coordenador);
    const rawTeam = cleanText(assignment?.equipe);
    const coordinator =
      resolveCoordinatorName(rawCoordinator) ||
      findCoordinatorByTeamName(rawTeam) ||
      rawCoordinator;
    const equipe = rawTeam ? resolveTeamName(coordinator || rawCoordinator, rawTeam) : "";

    return { coordenador: coordinator, equipe };
  }

  function normalizeTeamConfig(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const normalized = {};

    Object.entries(source).forEach(([coordinator, teams]) => {
      const safeCoordinator = cleanText(coordinator);
      if (!safeCoordinator) return;

      const cleanedTeams = (Array.isArray(teams) ? teams : [])
        .map((item) => cleanText(item))
        .filter(Boolean);

      normalized[safeCoordinator] = sortDisplayNames(Array.from(new Set(cleanedTeams)));
    });

    return normalized;
  }

  function readTeamConfigStore() {
    return normalizeTeamConfig(teamConfig);
  }

  function writeTeamConfigStore() {
    return saveTeamConfigToApi(teamConfig);
  }

  function readUserTeamStore() {
    return {};
  }

  function writeUserTeamStore() {}

  function readUserAccessStore() {
    return {};
  }

  function writeUserAccessStore() {}

  function canEditTeams(user) {
    if (!user) return false;
    if (getAccessProfile(user) === "ti") return true;
    const name = normalizeName(user.nome);
    const email = normalizeName(user.email);
    return TEAM_EDITORS.some((entry) => name.includes(entry) || email.includes(entry));
  }

  function canManageUsers(user) {
    const profile = getAccessProfile(user);
    return profile === "ti" || profile === "gerencial" || profile === "coordenacao";
  }

  function canViewAdmin(user) {
    const profile = getAccessProfile(user);
    return profile === "ti" || profile === "gerencial" || profile === "coordenacao";
  }

  function sameUserId(a, b) {
    return String(a ?? "").trim() === String(b ?? "").trim();
  }

  function normalizeEntityId(value) {
    return String(value ?? "").trim();
  }

  function resolveUserId(user) {
    if (!user || typeof user !== "object") return "";

    const candidates = [
      user.id,
      user.userId,
      user.user_id,
      user._id,
      user.uuid,
      user.email,
    ];

    for (const candidate of candidates) {
      const normalized = normalizeEntityId(candidate);
      if (normalized) return normalized;
    }

    return "";
  }

  function getUserTeamKeys(user) {
    if (!user || typeof user !== "object") return [];

    const keys = [
      user.id,
      user.userId,
      user.user_id,
      user._id,
      user.uuid,
      user.email,
    ]
      .map((value) => normalizeEntityId(value).toLowerCase())
      .filter(Boolean);

    return Array.from(new Set(keys));
  }

  function getUserActionId(user) {
    return resolveUserId(user) || cleanText(user?.email).toLowerCase();
  }

  function findUserByEntityId(entityId) {
    const target = normalizeEntityId(entityId).toLowerCase();
    if (!target) return null;

    return (
      usuarios.find((user) =>
        getUserTeamKeys(user).some((key) => normalizeEntityId(key).toLowerCase() === target)
      ) || null
    );
  }

  function hasUserTeamAssignment(user) {
    const assignment = normalizeAssignment(user || {});
    return !!(assignment.coordenador && assignment.equipe);
  }

  function isUserInTeam(user, coordinator, equipe) {
    const assignment = normalizeAssignment(user || {});
    return (
      normalizeName(assignment.coordenador) === normalizeName(coordinator) &&
      normalizeName(assignment.equipe) === normalizeName(equipe)
    );
  }

  function getStoredAssignment(user) {
    const keys = getUserTeamKeys(user);
    for (const key of keys) {
      const assignment = userTeamMap[key];
      if (assignment && typeof assignment === "object") return assignment;
    }
    return {};
  }

  function getStoredAccessProfile(user) {
    const keys = getUserTeamKeys(user);
    for (const key of keys) {
      const profile = userAccessMap[key];
      if (profile) return normalizeAccessProfile(profile);
    }
    return "";
  }

  function setStoredAssignment(user, assignment) {
    const keys = getUserTeamKeys(user);
    keys.forEach((key) => {
      userTeamMap[key] = { ...assignment };
    });
  }

  function setStoredAccessProfile(user, profile) {
    const normalized = normalizeAccessProfile(profile);
    const keys = getUserTeamKeys(user);
    keys.forEach((key) => {
      userAccessMap[key] = normalized;
    });
  }

  function getAccessProfile(user) {
    if (!user || typeof user !== "object") return "operacional";

    return normalizeAccessProfile(
      user.accessProfile ||
        user.access_profile ||
        getStoredAccessProfile(user) ||
        legacyRoleToAccessProfile(user.role)
    );
  }

  function applyUserMetaToState(userRef, assignment, accessProfile) {
    const target = userRef || {};
    const nextAssignment = normalizeAssignment(assignment);
    const nextAccessProfile = normalizeAccessProfile(accessProfile);

    setStoredAssignment(target, nextAssignment);
    writeUserTeamStore();
    setStoredAccessProfile(target, nextAccessProfile);
    writeUserAccessStore();

    const targetEmail = cleanText(target.email).toLowerCase();

    usuarios = usuarios.map((user) => {
      const sameById = target.id && sameUserId(user.id, target.id);
      const sameByEmail = targetEmail && cleanText(user.email).toLowerCase() === targetEmail;
      if (!sameById && !sameByEmail) return user;

      return {
        ...user,
        coordenador: nextAssignment.coordenador,
        equipe: nextAssignment.equipe,
        accessProfile: nextAccessProfile,
      };
    });
  }

  function cleanText(value) {
    if (value == null) return "";
    if (typeof value === "object") {
      if ("value" in value) return String(value.value || "").trim();
      return "";
    }
    return String(value).trim();
  }

  function requiresTeamAssignment(cargo, accessProfile) {
    const normalizedCargo = normalizeName(cargo);
    const normalizedAccess = normalizeAccessProfile(accessProfile);
    if (normalizedAccess === "gerencial") return false;
    if (normalizedCargo === "gerente") return false;
    return true;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function renderCollaboratorCard(user, options = {}) {
    const mode = String(options.mode || "team");
    const actionLabel = String(options.actionLabel || "");
    const actionAttr = String(options.actionAttr || "");
    const actionId = getUserActionId(user);
    const assignmentText = cleanText(user.equipe)
      ? `${cleanText(user.coordenador) || "Sem coord."} / ${cleanText(user.equipe)}`
      : "Sem equipe";
    const subtitle = `${cleanText(user.cargo) || "Usuário"} • ${cleanText(user.email) || "Sem email"}`;

    const roleText = accessProfileLabel(user.accessProfile);
    const initials = avatarFromName(cleanText(user.nome) || cleanText(user.email));

    return `
      <article class="collab-card collab-card--${escapeHtml(mode)}">
        <div class="collab-card__avatar">${escapeHtml(initials)}</div>
        <div class="collab-card__body">
          <div class="collab-card__top">
            <strong>${escapeHtml(cleanText(user.nome) || cleanText(user.email) || "Colaborador")}</strong>
            <span>${escapeHtml(roleText)}</span>
          </div>
          <div class="collab-card__meta">${escapeHtml(subtitle)}</div>
          <div class="collab-card__assignment">${escapeHtml(assignmentText)}</div>
        </div>
        <div class="collab-card__actions">
          ${
            actionLabel && actionAttr && actionId
              ? `<button type="button" class="btn-acao ${mode === "directory" && cleanText(user.equipe) ? "btn-acao--ghost" : ""}" ${actionAttr}="${escapeHtml(actionId)}">${escapeHtml(actionLabel)}</button>`
              : ""
          }
          <button type="button" class="btn-acao btn-acao--ghost" data-open-bi="${escapeHtml(actionId)}">BI</button>
        </div>
      </article>
    `;
  }

  function renderDirectoryGroup(title, description, count, content) {
    return `
      <section class="team-directory-group">
        <div class="team-directory-group__head">
          <div>
            <h4>${escapeHtml(title)}</h4>
            <p>${escapeHtml(description)}</p>
          </div>
          <span class="team-directory-group__metrics">${escapeHtml(String(count))}</span>
        </div>
        <div class="team-directory-group__body">
          ${content}
        </div>
      </section>
    `;
  }

  function renderAssignedTeamGroups(users) {
    const groups = new Map();

    users.forEach((user) => {
      const key = `${cleanText(user.coordenador)}__${cleanText(user.equipe)}`;
      if (!groups.has(key)) {
        groups.set(key, {
          coordinator: cleanText(user.coordenador) || "Sem coord.",
          team: cleanText(user.equipe) || "Sem equipe",
          users: [],
        });
      }
      groups.get(key).users.push(user);
    });

    return Array.from(groups.values())
      .sort((a, b) => {
        const aLabel = `${a.coordinator} ${a.team}`;
        const bLabel = `${b.coordinator} ${b.team}`;
        return aLabel.localeCompare(bLabel, "pt-BR", { sensitivity: "base" });
      })
      .map(
        (group) => `
          <section class="team-assigned-group">
            <div class="team-assigned-group__head">
              <div>
                <h5>${escapeHtml(`${group.coordinator} / ${group.team}`)}</h5>
                <p>Pessoas atualmente vinculadas a esta equipe.</p>
              </div>
              <span class="team-assigned-group__count">${escapeHtml(String(group.users.length))}</span>
            </div>
            <div class="team-assigned-group__body">
              ${group.users
                .map((user) =>
                  renderCollaboratorCard(user, {
                    mode: "directory",
                    actionLabel: "Mover",
                    actionAttr: "data-move-member",
                  })
                )
                .join("")}
            </div>
          </section>
        `
      )
      .join("");
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

    const id = resolveUserId(u);
    const nome = String(u.nome ?? u.name ?? "").trim();
    const email = String(u.email ?? "").trim().toLowerCase();
    const cargo = u.cargo != null ? String(u.cargo).trim() : "";
    const role = String(u.role ?? accessProfileToLegacyRole(u.accessProfile) ?? "user").toLowerCase();
    const accessProfile = getAccessProfile({ ...u, id, email, role });

    const ativo =
      typeof u.ativo === "boolean"
        ? u.ativo
        : typeof u.active === "boolean"
        ? u.active
        : true;

    const assignment = getStoredAssignment({ ...u, id, email }) || {};
    const normalizedAssignment = normalizeAssignment({
      coordenador: cleanText(u.coordenador ?? u.coordinator ?? assignment.coordenador),
      equipe: cleanText(u.equipe ?? u.team ?? assignment.equipe),
    });

    return {
      id,
      nome,
      email,
      cargo,
      role,
      accessProfile,
      ativo,
      coordenador: normalizedAssignment.coordenador,
      equipe: normalizedAssignment.equipe,
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
  const usuariosFiltro = document.getElementById("usuariosFiltro");
  const modal = document.getElementById("modalUsuario");
  const form = document.getElementById("formUsuario");
  const btnNovoUsuario = document.getElementById("btnNovoUsuario");
  const btnCancelar = document.getElementById("cancelarModal");
  const btnFecharModalUsuario = document.getElementById("fecharModalUsuario");
  const fieldNome = document.getElementById("nome");
  const fieldEmail = document.getElementById("email");
  const fieldCargo = document.getElementById("cargo");
  const fieldSenha = document.getElementById("senha");
  const fieldConfirmarSenha = document.getElementById("confirmarSenha");
  const userFormFeedback = document.getElementById("userFormFeedback");
  const userModalModeLabel = document.getElementById("userModalModeLabel");
  const passwordToggleButtons = Array.from(document.querySelectorAll(".password-toggle"));
  const btnGerenciarEquipes = document.getElementById("btnGerenciarEquipes");
  const equipesOverview = document.getElementById("equipesOverview");
  const modalEquipes = document.getElementById("modalEquipes");
  const formEquipes = document.getElementById("formEquipes");
  const equipesGrid = document.getElementById("equipesGrid");
  const equipesMembers = document.getElementById("equipesMembers");
  const cancelarEquipes = document.getElementById("cancelarEquipes");
  const fecharModalEquipesHeader = document.getElementById("fecharModalEquipesHeader");
  const modalEquipeMembros = document.getElementById("modalEquipeMembros");
  const membrosEquipeTitulo = document.getElementById("membrosEquipeTitulo");
  const membrosEquipeSubtitulo = document.getElementById("membrosEquipeSubtitulo");
  const membrosEquipeLista = document.getElementById("membrosEquipeLista");
  const membrosEquipeBusca = document.getElementById("membrosEquipeBusca");
  const membrosEquipeDisponiveis = document.getElementById("membrosEquipeDisponiveis");
  const membrosEquipeTransferiveis = document.getElementById("membrosEquipeTransferiveis");
  const fecharMembrosEquipe = document.getElementById("fecharMembrosEquipe");
  const fecharEquipeHeader = document.getElementById("fecharEquipeHeader");
  const inputCoordenador = document.getElementById("coordenador");
  const inputEquipe = document.getElementById("equipe");

  let usuarios = [];
  let modoEdicao = false;
  let idEmEdicao = null;
  let currentTeamModal = { coordinator: "", team: "" };
  let currentTeamHubCoordinator = "";
  let teamEditorFeedback = { type: "", text: "" };

  function syncBodyModalState() {
    const hasOpenModal =
      modal?.classList.contains("ativo") ||
      modalEquipes?.classList.contains("ativo") ||
      modalEquipeMembros?.classList.contains("ativo");

    document.body.classList.toggle("modal-open", !!hasOpenModal);
  }

  function setTeamEditorFeedback(type = "", text = "") {
    teamEditorFeedback = { type, text };
  }

  function openModal() {
    modal?.classList.add("ativo");
    modal?.setAttribute("aria-hidden", "false");
    syncBodyModalState();
  }

  function closeModal({ reset = true } = {}) {
    modal?.classList.remove("ativo");
    modal?.setAttribute("aria-hidden", "true");
    syncBodyModalState();

    if (reset) form?.reset();
    setUserFormFeedback("", "");

    modoEdicao = false;
    idEmEdicao = null;

    if (fieldSenha) fieldSenha.required = true;
    if (fieldConfirmarSenha) fieldConfirmarSenha.required = true;

    passwordToggleButtons.forEach((button) => {
      const targetId = String(button.getAttribute("data-target-input") || "").trim();
      const input = targetId ? document.getElementById(targetId) : null;
      if (!input) return;
      input.type = "password";
      button.textContent = "Mostrar";
    });
  }

  function setUserModalCopy(mode = "create") {
    if (!form) return;

    const title = form.querySelector("h3");
    const subtitle = form.querySelector(".form-usuario__subtitle");

    if (title) title.textContent = mode === "edit" ? "Editar Usuário" : "Novo Usuário";
    if (userModalModeLabel) {
      userModalModeLabel.textContent = mode === "edit" ? "Edição em andamento" : "Novo cadastro";
    }
    if (subtitle) {
      subtitle.textContent =
        mode === "edit"
          ? "Atualize dados de acesso, equipe e permissões deste colaborador."
          : "Cadastre acessos, vínculo com equipe e nível de permissão.";
    }
  }

  function setUserFormFeedback(type = "", text = "") {
    if (!userFormFeedback) return;
    if (!text) {
      userFormFeedback.hidden = true;
      userFormFeedback.className = "form-usuario__feedback";
      userFormFeedback.textContent = "";
      return;
    }

    userFormFeedback.hidden = false;
    userFormFeedback.className = `form-usuario__feedback form-usuario__feedback--${type || "info"}`;
    userFormFeedback.textContent = text;
  }

  function setUserFormSaving(isSaving) {
    if (!form) return;
    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) {
      submitButton.disabled = !!isSaving;
      submitButton.textContent = isSaving ? "Salvando..." : "Salvar";
    }
  }

  function openTeamsModal() {
    currentTeamHubCoordinator = getDefaultCoordinator(currentTeamHubCoordinator);
    modalEquipes?.classList.add("ativo");
    modalEquipes?.setAttribute("aria-hidden", "false");
    syncBodyModalState();
    renderTeamEditor();
  }

  function closeTeamsModal() {
    modalEquipes?.classList.remove("ativo");
    modalEquipes?.setAttribute("aria-hidden", "true");
    syncBodyModalState();
  }

  function openTeamMembersModal(coordinator, team) {
    currentTeamModal = { coordinator, team };
    modalEquipeMembros?.classList.add("ativo");
    modalEquipeMembros?.setAttribute("aria-hidden", "false");
    if (membrosEquipeBusca) membrosEquipeBusca.value = "";
    syncBodyModalState();
    renderTeamMembersModal();
  }

  function closeTeamMembersModal() {
    currentTeamModal = { coordinator: "", team: "" };
    modalEquipeMembros?.classList.remove("ativo");
    modalEquipeMembros?.setAttribute("aria-hidden", "true");
    syncBodyModalState();
  }

  modalEquipeMembros?.addEventListener("click", (e) => {
    if (e.target === modalEquipeMembros) closeTeamMembersModal();
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
        display:grid;
        gap:10px;
      }
      .role-select{
        appearance:none;
        -webkit-appearance:none;
        -moz-appearance:none;
        width:100%;
        min-height:46px;
        border-radius:12px;
        border:1px solid rgba(93,188,255,0.22);
        background:
          linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04)),
          rgba(16,21,32,0.98);
        color:#eef4fb;
        font-weight:900;
        padding:0 44px 0 14px;
        outline:none;
        cursor:pointer;
        color-scheme:dark;
        box-shadow:inset 0 1px 0 rgba(255,255,255,0.04);
        background-image:
          linear-gradient(45deg, transparent 50%, rgba(238,244,251,0.88) 50%),
          linear-gradient(135deg, rgba(238,244,251,0.88) 50%, transparent 50%);
        background-position:
          calc(100% - 18px) calc(50% - 2px),
          calc(100% - 12px) calc(50% - 2px);
        background-size:6px 6px, 6px 6px;
        background-repeat:no-repeat;
      }
      #accessProfileHint{
        color:rgba(234,238,243,.68);
        font-size:12px;
        line-height:1.5;
      }
      .role-select:focus{
        border-color:rgba(93,188,255,0.45);
        box-shadow:0 0 0 3px rgba(93,188,255,0.16);
      }
      .role-select option{
        background:#101622;
        color:#eef4fb;
      }
      .role-select option:disabled{
        color:rgba(238,244,251,0.38);
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
    return box;
  }

  function renderRoleSelect(currentRole, usuarioRef) {
    const box = ensureRoleBox();
    if (!box) return;

    const currentAccessProfile = normalizeAccessProfile(usuarioRef?.accessProfile || legacyRoleToAccessProfile(usuarioRef?.role));
    const canAssignTi = getAccessProfile({ role: currentRole }) === "ti";

    box.innerHTML = `
      <div style="font-weight:900; font-size:12px; letter-spacing:.4px; text-transform:uppercase; color:rgba(232,237,246,.85); margin:6px 0 10px 0;">
        PERFIL DE ACESSO
      </div>
      <select id="accessProfileSelect" class="role-select"></select>
      <div id="accessProfileHint" style="margin-top:10px; color:rgba(234,238,243,.64); font-size:12px; line-height:1.5;"></div>
    `;

    const select = box.querySelector("#accessProfileSelect");
    const hint = box.querySelector("#accessProfileHint");
    if (!select || !hint) return;

    select.innerHTML = ACCESS_PROFILES.map((profile) => {
      const disabled = profile.value === "ti" && !canAssignTi ? "disabled" : "";
      const selected = profile.value === currentAccessProfile ? "selected" : "";
      return `<option value="${profile.value}" ${selected} ${disabled}>${profile.label}</option>`;
    }).join("");

    const syncHint = () => {
      const selectedProfile = ACCESS_PROFILES.find((item) => item.value === select.value) || ACCESS_PROFILES[3];
      hint.textContent = selectedProfile.description;
      updateTeamAssignmentUI();
    };

    select.addEventListener("change", syncHint);
    syncHint();
  }

  function updateTeamAssignmentUI() {
    const accessProfileSel = document.getElementById("accessProfileSelect");
    const selectedAccessProfile = normalizeAccessProfile(accessProfileSel?.value || "operacional");
    const cargo = String(fieldCargo?.value || "").trim();
    const needsAssignment = requiresTeamAssignment(cargo, selectedAccessProfile);

    if (inputCoordenador) {
      inputCoordenador.required = needsAssignment;
      inputCoordenador.classList.toggle("is-disabled", !needsAssignment);
      inputCoordenador.disabled = !needsAssignment;
    }

    if (inputEquipe) {
      inputEquipe.required = needsAssignment;
      inputEquipe.classList.toggle("is-disabled", !needsAssignment);
      inputEquipe.disabled = !needsAssignment;
    }

    if (!needsAssignment) {
      if (inputCoordenador) inputCoordenador.value = "";
      if (inputEquipe) inputEquipe.value = "";
    } else if (!cleanText(inputCoordenador?.value) || !cleanText(inputEquipe?.value)) {
      syncTeamSelectors(getDefaultCoordinator());
    }
  }

  function renderEquipesOverview() {
    if (!equipesOverview) return;
    const coordinators = getCoordinatorList();

    if (!coordinators.length) {
      equipesOverview.innerHTML =
        '<div class="equipe-summary-row equipe-summary-row--empty">Nenhum coordenador ou equipe encontrado ainda.</div>';
      return;
    }

    equipesOverview.innerHTML = coordinators.map((coordinator) => {
      const teams = getTeamsForCoordinator(coordinator);
      const totalMembers = teams.reduce((sum, team) => {
        const members = usuarios.filter((user) => isUserInTeam(user, coordinator, team));
        return sum + members.length;
      }, 0);

      return `
        <article class="equipe-card">
          <div class="equipe-card__top">
            <div>
              <strong class="equipe-card__title">${coordinator}</strong>
              <span class="equipe-card__meta">${teams.length} equipes • ${totalMembers} pessoas</span>
            </div>
          </div>
          <div class="equipe-card__list">
            ${
              teams.length
                ? teams
                    .map((team) => {
                      const members = usuarios.filter(
                        (user) => isUserInTeam(user, coordinator, team)
                      );
                      return `
                        <button
                          type="button"
                          class="equipe-summary-row"
                          data-open-team-modal="true"
                          data-coordinator="${coordinator}"
                          data-equipe="${team}"
                        >
                          <strong>${team}</strong>
                          <span>${members.length} pessoa(s)</span>
                        </button>
                      `;
                    })
                    .join("")
                : '<div class="equipe-summary-row equipe-summary-row--empty">Sem equipes configuradas</div>'
            }
          </div>
        </article>
      `;
    }).join("");
  }

  async function persistUserTeamAssignment(userId, coordinator, equipe) {
    const targetUser = findUserByEntityId(userId);
    const nextAssignment = normalizeAssignment({ coordenador: coordinator, equipe });

    if (!targetUser) return;

    const targetId = resolveUserId(targetUser);
    if (!targetId) throw new Error("Usuario sem identificador valido.");

    const updated = await apiUpdateUser(targetId, {
      id: targetUser.id,
      nome: targetUser.nome,
      email: targetUser.email,
      cargo: targetUser.cargo,
      role: targetUser.role,
      accessProfile: targetUser.accessProfile,
      coordenador: nextAssignment.coordenador,
      equipe: nextAssignment.equipe,
      ativo: targetUser.ativo,
    });

    applyUserMetaToState(
      updated || targetUser,
      nextAssignment,
      getAccessProfile(updated || targetUser)
    );

    usuarios = usuarios.map((user) =>
      getUserTeamKeys(user).some((key) => normalizeEntityId(key).toLowerCase() === normalizeEntityId(userId).toLowerCase())
        ? {
            ...user,
            ...normalizeUser(updated || user),
            coordenador: nextAssignment.coordenador,
            equipe: nextAssignment.equipe,
          }
        : user
    );
  }

  async function removeUserFromTeam(userId) {
    const nextAssignment = {
      coordenador: "",
      equipe: "",
    };

    const targetUser = findUserByEntityId(userId);
    if (!targetUser) return;

    const targetId = resolveUserId(targetUser);
    if (!targetId) throw new Error("Usuario sem identificador valido.");

    const updated = await apiUpdateUser(targetId, {
      id: targetUser.id,
      nome: targetUser.nome,
      email: targetUser.email,
      cargo: targetUser.cargo,
      role: targetUser.role,
      accessProfile: targetUser.accessProfile,
      coordenador: "",
      equipe: "",
      ativo: targetUser.ativo,
    });

    applyUserMetaToState(
      updated || targetUser,
      nextAssignment,
      getAccessProfile(updated || targetUser)
    );

    usuarios = usuarios.map((user) =>
      getUserTeamKeys(user).some((key) => normalizeEntityId(key).toLowerCase() === normalizeEntityId(userId).toLowerCase())
        ? {
            ...user,
            ...normalizeUser(updated || user),
            coordenador: "",
            equipe: "",
          }
        : user
    );
  }

  function renderTeamMembersModal() {
    if (
      !membrosEquipeTitulo ||
      !membrosEquipeSubtitulo ||
      !membrosEquipeLista ||
      !membrosEquipeDisponiveis ||
      !membrosEquipeTransferiveis
    ) {
      return;
    }

    const { coordinator, team } = currentTeamModal;
    const members = usuarios.filter((user) => isUserInTeam(user, coordinator, team));
    const available = usuarios.filter(
      (user) => user.ativo && !hasUserTeamAssignment(user)
    );
    const transferCandidates = usuarios.filter(
      (user) => user.ativo && hasUserTeamAssignment(user) && !isUserInTeam(user, coordinator, team)
    );
    const countEl = document.getElementById("membrosEquipeCount");
    const countCardEl = document.getElementById("membrosEquipeCountCard");
    const countHeadEl = document.getElementById("membrosEquipeCountHead");
    const availableCountEl = document.getElementById("membrosEquipeAvailableCount");
    const poolCountEl = document.getElementById("membrosEquipePoolCount");
    const transferCountCardEl = document.getElementById("membrosEquipeTransferCount");
    const transferCountEl = document.getElementById("membrosEquipeTransferLabel");
    const transferHeadCountEl = document.getElementById("membrosEquipeTransferHeadCount");
    const availableLabelEl = document.getElementById("membrosEquipeAvailableLabel");
    const searchTerm = String(membrosEquipeBusca?.value || "").trim().toLowerCase();
    const filteredMembers = !searchTerm
      ? members
      : members.filter((member) =>
          [member.nome, member.email, member.cargo]
            .map((value) => String(value || "").toLowerCase())
            .some((value) => value.includes(searchTerm))
        );
    const filteredAvailable = !searchTerm
      ? available
      : available.filter((user) =>
          [user.nome, user.email, user.cargo]
            .map((value) => String(value || "").toLowerCase())
            .some((value) => value.includes(searchTerm))
        );
    const filteredTransfers = !searchTerm
      ? transferCandidates
      : transferCandidates.filter((user) =>
          [user.nome, user.email, user.cargo, user.coordenador, user.equipe]
            .map((value) => String(value || "").toLowerCase())
            .some((value) => value.includes(searchTerm))
        );
    membrosEquipeTitulo.textContent = team || "Equipe";
    membrosEquipeSubtitulo.textContent = coordinator
      ? `${coordinator} • gerencie as pessoas desta equipe`
      : "Gerencie as pessoas desta equipe.";
    if (countEl) countEl.textContent = `${members.length} na equipe`;
    if (countCardEl) countCardEl.textContent = String(members.length);
    if (countHeadEl) countHeadEl.textContent = `${members.length} registro(s)`;
    if (poolCountEl) poolCountEl.textContent = `${available.length + transferCandidates.length} no diretório`;
    if (availableCountEl) availableCountEl.textContent = `${available.length} sem equipe`;
    if (transferCountCardEl) transferCountCardEl.textContent = String(transferCandidates.length);
    if (availableLabelEl) availableLabelEl.textContent = String(available.length);
    if (transferCountEl) transferCountEl.textContent = `${transferCandidates.length} em outras equipes`;
    if (transferHeadCountEl) transferHeadCountEl.textContent = `${transferCandidates.length} em outras equipes`;

    membrosEquipeLista.innerHTML = filteredMembers.length
      ? filteredMembers
          .map((member) =>
            renderCollaboratorCard(member, {
              mode: "team",
              actionLabel: "Remover",
              actionAttr: "data-remove-member",
            })
          )
          .join("")
      : `<div class="membros-equipe-vazio">${
          members.length
            ? "Nenhuma pessoa encontrada com esse filtro."
            : "Nenhuma pessoa vinculada a esta equipe ainda."
        }</div>`;

    const availableContent = filteredAvailable.length
      ? filteredAvailable
          .map((user) =>
            renderCollaboratorCard(user, {
              mode: "directory",
              actionLabel: "Adicionar",
              actionAttr: "data-add-member",
            })
          )
          .join("")
      : `<div class="membros-equipe-vazio">${
          available.length ? "Nenhuma pessoa sem equipe encontrada com esse filtro." : "Nenhuma pessoa sem equipe disponível."
        }</div>`;

    const transferContent = filteredTransfers.length
      ? renderAssignedTeamGroups(filteredTransfers)
      : `<div class="membros-equipe-vazio">${
          transferCandidates.length ? "Nenhuma pessoa de outras equipes encontrada com esse filtro." : "Nenhuma pessoa em outras equipes disponível."
        }</div>`;

    membrosEquipeDisponiveis.innerHTML = filteredAvailable.length
      ? availableContent
      : `<div class="membros-equipe-vazio">${
          available.length ? "Nenhuma pessoa sem equipe encontrada com esse filtro." : "Nenhuma pessoa sem equipe disponível."
        }</div>`;

    membrosEquipeTransferiveis.innerHTML = filteredTransfers.length
      ? transferContent
      : `<div class="membros-equipe-vazio">${
          transferCandidates.length ? "Nenhuma pessoa de outras equipes encontrada com esse filtro." : "Nenhuma pessoa em outras equipes disponível."
        }</div>`;
  }

  function renderEquipeMembers() {
    if (!equipesMembers) return;
    const coordinators = getCoordinatorList();

    if (!coordinators.length) {
      equipesMembers.innerHTML =
        '<div class="team-master__empty">Nenhum coordenador ou equipe disponivel para gerenciar.</div>';
      return;
    }

    equipesMembers.innerHTML = coordinators.map((coordinator) => {
      const teams = getTeamsForCoordinator(coordinator);
      const totalMembers = teams.reduce((sum, team) => {
        const members = usuarios.filter((user) => isUserInTeam(user, coordinator, team));
        return sum + members.length;
      }, 0);

      return `
        <article class="equipe-members-card">
          <div class="equipe-members-card__head">
            <div>
              <h3>${coordinator}</h3>
              <p>${teams.length} equipes configuradas</p>
            </div>
            <span class="equipe-members-card__count">${totalMembers} pessoas</span>
          </div>

          <div class="equipe-members-grid">
            ${teams
              .map((team) => {
                const members = usuarios.filter(
                  (user) => isUserInTeam(user, coordinator, team)
                );

                return `
                  <section class="equipe-member-box">
                    <div class="equipe-member-box__title">
                      <div>
                        <strong>${team}</strong>
                        <span>${members.length} pessoas</span>
                      </div>
                      <button
                        type="button"
                        class="btn-acao btn-acao--ghost"
                        data-open-team-modal="true"
                        data-coordinator="${coordinator}"
                        data-equipe="${team}"
                      >
                        Gerenciar
                      </button>
                    </div>

                    <div class="equipe-member-list">
                      ${
                        members.length
                          ? members
                              .map(
                                (member) => `
                                  <div class="equipe-member-row">
                                    <strong>${member.nome || member.email}</strong>
                                    <span>${member.cargo || "Usuário"}</span>
                                  </div>
                                `
                              )
                              .join("")
                          : '<div class="equipe-member-empty">Nenhuma pessoa nesta equipe.</div>'
                      }
                    </div>
                  </section>
                `;
              })
              .join("")}
          </div>
        </article>
      `;
    }).join("");
  }

  async function syncTeamConfigUsers(usersToSync, assignmentResolver) {
    const targets = Array.isArray(usersToSync) ? usersToSync.filter(Boolean) : [];
    if (!targets.length) return;

    await Promise.all(
      targets.map(async (user) => {
        const nextAssignment = normalizeAssignment(assignmentResolver(user) || {});
        const updated = await apiUpdateUser(user.id, {
          id: user.id,
          nome: user.nome,
          email: user.email,
          cargo: user.cargo,
          role: user.role,
          accessProfile: user.accessProfile,
          coordenador: nextAssignment.coordenador,
          equipe: nextAssignment.equipe,
          ativo: user.ativo,
        });

        applyUserMetaToState(
          updated || user,
          nextAssignment,
          getAccessProfile(updated || user)
        );
      })
    );
  }

  async function addTeamToCoordinator(coordinator, teamName) {
    const safeCoordinator = resolveCoordinatorName(coordinator);
    const nextName = cleanText(teamName);
    if (!safeCoordinator) throw new Error("Coordenador invalido.");
    if (!nextName) throw new Error("Informe o nome da equipe.");

    const existingTeams = teamConfig[safeCoordinator] || [];
    if (resolveTeamName(safeCoordinator, nextName)) {
      throw new Error("Ja existe uma equipe com esse nome nessa coordenacao.");
    }

    teamConfig = {
      ...teamConfig,
      [safeCoordinator]: [...existingTeams, nextName],
    };
    await writeTeamConfigStore();
    setTeamEditorFeedback("success", `Equipe "${nextName}" salva em ${safeCoordinator}.`);
  }

  async function renameTeamForCoordinator(coordinator, oldTeamName, newTeamName) {
    const safeCoordinator = resolveCoordinatorName(coordinator);
    const currentName = resolveTeamName(safeCoordinator, oldTeamName);
    const nextName = cleanText(newTeamName);
    if (!safeCoordinator || !currentName) throw new Error("Equipe invalida.");
    if (!nextName) throw new Error("Informe o novo nome da equipe.");

    const duplicate = resolveTeamName(safeCoordinator, nextName);
    if (duplicate && normalizeName(duplicate) !== normalizeName(currentName)) {
      throw new Error("Ja existe uma equipe com esse nome nessa coordenacao.");
    }

    teamConfig = {
      ...teamConfig,
      [safeCoordinator]: (teamConfig[safeCoordinator] || []).map((team) =>
        normalizeName(team) === normalizeName(currentName) ? nextName : team
      ),
    };
    await writeTeamConfigStore();
    setTeamEditorFeedback("success", `Equipe "${currentName}" renomeada para "${nextName}".`);

    const affectedUsers = usuarios.filter(
      (user) =>
        normalizeName(user.coordenador) === normalizeName(safeCoordinator) &&
        normalizeName(user.equipe) === normalizeName(currentName)
    );

    await syncTeamConfigUsers(affectedUsers, () => ({
      coordenador: safeCoordinator,
      equipe: nextName,
    }));
  }

  async function deleteTeamForCoordinator(coordinator, teamName) {
    const safeCoordinator = resolveCoordinatorName(coordinator);
    const currentName = resolveTeamName(safeCoordinator, teamName);
    if (!safeCoordinator || !currentName) throw new Error("Equipe invalida.");

    teamConfig = {
      ...teamConfig,
      [safeCoordinator]: (teamConfig[safeCoordinator] || []).filter(
        (team) => normalizeName(team) !== normalizeName(currentName)
      ),
    };
    await writeTeamConfigStore();
    setTeamEditorFeedback("success", `Equipe "${currentName}" removida de ${safeCoordinator}.`);

    const affectedUsers = usuarios.filter(
      (user) =>
        normalizeName(user.coordenador) === normalizeName(safeCoordinator) &&
        normalizeName(user.equipe) === normalizeName(currentName)
    );

    await syncTeamConfigUsers(affectedUsers, () => ({
      coordenador: "",
      equipe: "",
    }));
  }

  function renderTeamEditor() {
    if (!equipesGrid) return;
    const coordinators = getCoordinatorList();
    const safeCoordinator = getDefaultCoordinator(currentTeamHubCoordinator);
    const teams = getTeamsForCoordinator(safeCoordinator);

    if (!coordinators.length) {
      equipesGrid.innerHTML = `
        <div class="team-master__empty">
          Nenhum coordenador foi encontrado. Vincule um usuario a um coordenador/equipe para a estrutura aparecer aqui.
        </div>
      `;
      return;
    }

    currentTeamHubCoordinator = safeCoordinator;
    const totalMembers = teams.reduce((sum, team) => {
      const members = usuarios.filter((user) => isUserInTeam(user, safeCoordinator, team));
      return sum + members.length;
    }, 0);

    equipesGrid.innerHTML = `
      <div class="team-master">
        <aside class="team-master__sidebar">
          <div class="team-master__sidebar-head">
            <strong>Coordenadores</strong>
            <span>${coordinators.length} lideranças</span>
          </div>
          <div class="team-master__nav">
            ${coordinators.map((coordinator) => {
              const coordinatorTeams = getTeamsForCoordinator(coordinator);
              const coordinatorMembers = coordinatorTeams.reduce((sum, team) => {
                const members = usuarios.filter((user) => isUserInTeam(user, coordinator, team));
                return sum + members.length;
              }, 0);

              return `
                <button
                  type="button"
                  class="team-master__nav-item ${coordinator === safeCoordinator ? "is-active" : ""}"
                  data-select-coordinator="${coordinator}"
                >
                  <strong>${coordinator}</strong>
                  <span>${coordinatorTeams.length} equipes • ${coordinatorMembers} pessoas</span>
                </button>
              `;
            }).join("")}
          </div>
        </aside>

        <section class="team-master__content">
          <div class="team-master__content-head">
            <div>
              <h4>${safeCoordinator}</h4>
              <p>${teams.length} equipes ativas nessa coordenação</p>
            </div>
            <span class="team-master__content-badge">${totalMembers} pessoas</span>
          </div>

          <section class="equipe-editor">
            <h4>Estrutura da coordenação</h4>
            <p>Adicione novas equipes, renomeie as atuais ou remova as que não serão mais usadas.</p>
            ${
              teamEditorFeedback.text
                ? `<div class="equipe-editor__feedback equipe-editor__feedback--${escapeHtml(teamEditorFeedback.type || "info")}">${escapeHtml(teamEditorFeedback.text)}</div>`
                : ""
            }
            <div class="equipe-editor__create">
              <input
                type="text"
                id="novaEquipeNome"
                placeholder="Nome da nova equipe"
                maxlength="60"
              />
              <button
                type="button"
                class="btn-acao"
                data-add-team="${safeCoordinator}"
              >
                Salvar equipe
              </button>
            </div>
            <div class="equipe-editor__list">
              ${
                teams.length
                  ? teams
                      .map(
                        (team, index) => `
                          <div class="equipe-editor__item" data-team-index="${index}">
                            <input
                              type="text"
                              value="${escapeHtml(team)}"
                              data-team-name-input="${index}"
                              maxlength="60"
                            />
                            <button
                              type="button"
                              class="btn-acao btn-acao--ghost"
                              data-rename-team="${index}"
                              data-coordinator="${safeCoordinator}"
                            >
                              Renomear
                            </button>
                            <button
                              type="button"
                              class="btn-acao btn-acao--ghost"
                              data-delete-team="${index}"
                              data-coordinator="${safeCoordinator}"
                            >
                              Excluir
                            </button>
                          </div>
                        `
                      )
                      .join("")
                  : '<div class="team-master__empty">Nenhuma equipe cadastrada para esta coordenação.</div>'
              }
            </div>
          </section>

          <div class="team-master__rows">
            ${
              teams.length
                ? teams.map((team) => {
                    const members = usuarios.filter(
                      (user) => isUserInTeam(user, safeCoordinator, team)
                    );
                    return `
                      <button
                        type="button"
                        class="team-master__row"
                        data-open-team-modal="true"
                        data-coordinator="${safeCoordinator}"
                        data-equipe="${team}"
                      >
                        <div class="team-master__row-main">
                          <strong>${team}</strong>
                          <small>Gerenciar pessoas desta equipe</small>
                        </div>
                        <div class="team-master__row-meta">
                          <span>${members.length} pessoa(s)</span>
                          <b>Abrir</b>
                        </div>
                      </button>
                    `;
                  }).join("")
                : '<div class="team-master__empty">Nenhuma equipe configurada para este coordenador.</div>'
            }
          </div>
        </section>
      </div>
    `;
  }

  function populateCoordinatorList(selected = "") {
    if (inputCoordenador) {
      const coordinators = getCoordinatorList();
      const resolvedSelected = resolveCoordinatorName(selected);
      const defaultCoordinator = getDefaultCoordinator(selected);
      inputCoordenador.innerHTML = [
        '<option value="">Selecione o coordenador</option>',
        ...coordinators.map(
          (coordinator) => `<option value="${escapeHtml(coordinator)}">${escapeHtml(coordinator)}</option>`
        ),
      ].join("");
      inputCoordenador.value = resolvedSelected || defaultCoordinator || "";
    }
  }

  function populateTeamList(coordinator, selected = "") {
    const safeCoordinator = resolveCoordinatorName(coordinator) || getDefaultCoordinator(coordinator);
    const teams = getTeamsForCoordinator(safeCoordinator);
    if (inputEquipe) {
      inputEquipe.innerHTML = [
        '<option value="">Selecione a equipe</option>',
        ...teams.map((team) => `<option value="${escapeHtml(team)}">${escapeHtml(team)}</option>`),
      ].join("");
      inputEquipe.value = resolveTeamName(safeCoordinator, selected) || teams[0] || "";
    }
  }

  function syncTeamSelectors(coordinator, team = "") {
    const safeCoordinator = resolveCoordinatorName(coordinator) || getDefaultCoordinator(coordinator);
    populateCoordinatorList(safeCoordinator);
    populateTeamList(safeCoordinator, team);
  }

  const inputCargo = document.getElementById("cargo");
  inputCargo?.addEventListener("change", () => updateTeamAssignmentUI());
  inputCoordenador?.addEventListener("change", () => {
    syncTeamSelectors(inputCoordenador.value, "");
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

    if (elUserName) elUserName.textContent = nome;
    if (elUserRole) elUserRole.textContent = accessProfileLabel(getAccessProfile(u));
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

    getSidebarCards().forEach((card) => {
      const moduleId = card.dataset.moduleId;
      if (!moduleId) return;

      const blocked = moduleId === "contadmin" && !canViewAdmin(current);
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

  async function loadTeamConfigFromApi() {
    const payload = await fetchJson(API_TEAM_CONFIG, { method: "GET" });
    return normalizeTeamConfig(payload?.config || payload);
  }

  async function saveTeamConfigToApi(config) {
    const payload = await fetchJson(API_TEAM_CONFIG, {
      method: "PUT",
      body: { config: normalizeTeamConfig(config) },
    });
    teamConfig = normalizeTeamConfig(payload?.config || config);
    return teamConfig;
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
        access_profile: body.accessProfile,
        accessProfile: body.accessProfile,
        coordenador: body.coordenador,
        equipe: body.equipe,
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
        access_profile: body.accessProfile,
        accessProfile: body.accessProfile,
        coordenador: body.coordenador,
        equipe: body.equipe,
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
        sub.textContent = `${usuario.email || ""} • ${accessProfileLabel(usuario.accessProfile)} • ${usuario.cargo || ""}`;
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

    const filterTerm = String(usuariosFiltro?.value || "").trim().toLowerCase();
    const visibleUsers = !filterTerm
      ? usuarios
      : usuarios.filter((usuario) =>
          [
            usuario.nome,
            usuario.email,
            usuario.cargo,
            accessProfileLabel(usuario.accessProfile),
          ]
            .map((value) => String(value || "").toLowerCase())
            .some((value) => value.includes(filterTerm))
        );

    if (!visibleUsers.length) {
      listaUsuarios.innerHTML = `
        <tr>
          <td colspan="6" class="muted" style="text-align:center;">
            ${usuarios.length ? "Nenhum usuário encontrado para esse filtro" : "Nenhum usuário encontrado"}
          </td>
        </tr>
      `;
      return;
    }

    const current = getSessionUser();
    const currentAccessProfile = getAccessProfile(current);
    const allowManagement = canManageUsers(current);

    visibleUsers.forEach((usuario) => {
      const protegido = currentAccessProfile !== "ti" && getAccessProfile(usuario) === "ti";
      const accessProfile = accessProfileLabel(usuario.accessProfile);

      listaUsuarios.innerHTML += `
        <tr>
          <td>${usuario.nome || ""}</td>
          <td>${usuario.email || ""}</td>
          <td>${usuario.cargo || ""}</td>
          <td><span class="muted-inline">${accessProfile}</span></td>
          <td>
            <span class="status ${usuario.ativo ? "ativo" : "inativo"}">
              ${usuario.ativo ? "Ativo" : "Inativo"}
            </span>
          </td>
          <td>
            ${
              !allowManagement
                ? `<span class="muted">Somente visualização</span>`
                : protegido
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

  function applyUsersToUi(nextUsers) {
    usuarios = Array.isArray(nextUsers) ? nextUsers.filter(Boolean) : [];
    renderizarUsuarios();
    renderEquipesOverview();
    renderEquipeMembers();
    renderTeamEditor();
    renderTeamMembersModal();
  }

  // =======================================
  // LOAD USERS (API)
  // =======================================
  async function carregarUsuariosDaAPI() {
    try {
      applyUsersToUi((await apiListUsers()).map((user) => normalizeUser(user)));
    } catch (err) {
      console.error("❌ Falha ao listar usuários (API):", err);
      alert("Erro ao listar usuários. Veja o console (F12) para o detalhe.");
      applyUsersToUi([]);
    }
  }

  async function syncUsersAfterMutation() {
    const freshUsers = (await apiListUsers()).map((user) => normalizeUser(user));
    applyUsersToUi(freshUsers);
    return freshUsers;
  }

  // =======================================
  // NOVO / EDITAR
  // =======================================
  btnNovoUsuario?.addEventListener("click", () => {
    if (!canManageUsers(getSessionUser())) {
      alert("Somente TI pode criar usuários.");
      return;
    }

    modoEdicao = false;
    idEmEdicao = null;
    form?.reset();

    if (fieldSenha) fieldSenha.required = true;
    if (fieldConfirmarSenha) fieldConfirmarSenha.required = true;

    const current = getSessionUser();
    renderRoleSelect((current?.role || "user").toLowerCase(), {
      role: ROLE_DEFAULT,
      accessProfile: "operacional",
    });

    setUserModalCopy("create");
    setUserFormFeedback("", "");
    syncTeamSelectors(getDefaultCoordinator());
    updateTeamAssignmentUI();
    openModal();
  });

  usuariosFiltro?.addEventListener("input", () => renderizarUsuarios());

  btnCancelar?.addEventListener("click", () => closeModal({ reset: true }));
  btnFecharModalUsuario?.addEventListener("click", () => closeModal({ reset: true }));
  passwordToggleButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const targetId = String(button.getAttribute("data-target-input") || "").trim();
      const input = targetId ? document.getElementById(targetId) : null;
      if (!input) return;

      const showing = input.type === "text";
      input.type = showing ? "password" : "text";
      button.textContent = showing ? "Mostrar" : "Ocultar";
    });
  });

  btnGerenciarEquipes?.addEventListener("click", () => {
    if (!canEditTeams(getSessionUser())) {
      alert("Somente você e a Gabriella podem editar as equipes.");
      return;
    }
    setTeamEditorFeedback("", "");
    renderTeamEditor();
    openTeamsModal();
  });

  cancelarEquipes?.addEventListener("click", () => closeTeamsModal());
  fecharModalEquipesHeader?.addEventListener("click", () => closeTeamsModal());

  equipesGrid?.addEventListener("click", (e) => {
    const coordinatorBtn = e.target.closest("button[data-select-coordinator]");
    if (coordinatorBtn) {
      const coordinator = String(coordinatorBtn.getAttribute("data-select-coordinator") || "").trim();
      if (!coordinator) return;
      currentTeamHubCoordinator = coordinator;
      setTeamEditorFeedback("", "");
      renderTeamEditor();
      return;
    }

    const addBtn = e.target.closest("button[data-add-team]");
    if (addBtn) {
      const coordinator = String(addBtn.getAttribute("data-add-team") || "").trim();
      const input = document.getElementById("novaEquipeNome");
      const nextName = String(input?.value || "").trim();
      if (!coordinator) return;

      addTeamToCoordinator(coordinator, nextName)
        .then(() => {
          if (input) input.value = "";
          applyUsersToUi(usuarios);
        })
        .catch((err) => {
          setTeamEditorFeedback("error", err?.message || "Erro ao salvar equipe.");
          renderTeamEditor();
          console.error("❌ Falha ao adicionar equipe:", err);
          alert(`Erro ao salvar equipe: ${err?.message || err}`);
        });
      return;
    }

    const renameBtn = e.target.closest("button[data-rename-team]");
    if (renameBtn) {
      const coordinator = String(renameBtn.getAttribute("data-coordinator") || "").trim();
      const teamIndex = Number(renameBtn.getAttribute("data-rename-team"));
      const row = renameBtn.closest(".equipe-editor__item");
      const input = row?.querySelector("input[data-team-name-input]");
      const currentName = Number.isInteger(teamIndex) ? (teamConfig[coordinator] || [])[teamIndex] || "" : "";
      const nextName = String(input?.value || "").trim();
      if (!coordinator || !currentName) return;

      renameTeamForCoordinator(coordinator, currentName, nextName)
        .then(() => syncUsersAfterMutation())
        .catch((err) => {
          setTeamEditorFeedback("error", err?.message || "Erro ao renomear equipe.");
          renderTeamEditor();
          console.error("❌ Falha ao renomear equipe:", err);
          alert(`Erro ao renomear equipe: ${err?.message || err}`);
        });
      return;
    }

    const deleteBtn = e.target.closest("button[data-delete-team]");
    if (deleteBtn) {
      const coordinator = String(deleteBtn.getAttribute("data-coordinator") || "").trim();
      const teamIndex = Number(deleteBtn.getAttribute("data-delete-team"));
      const currentName = Number.isInteger(teamIndex) ? (teamConfig[coordinator] || [])[teamIndex] || "" : "";
      if (!coordinator || !currentName) return;

      const membersCount = usuarios.filter(
        (user) =>
          normalizeName(user.coordenador) === normalizeName(coordinator) &&
          normalizeName(user.equipe) === normalizeName(currentName)
      ).length;
      const ok = confirm(
        membersCount
          ? `Excluir a equipe "${currentName}"? ${membersCount} usuario(s) ficarao sem equipe.`
          : `Excluir a equipe "${currentName}"?`
      );
      if (!ok) return;

      deleteTeamForCoordinator(coordinator, currentName)
        .then(() => syncUsersAfterMutation())
        .catch((err) => {
          setTeamEditorFeedback("error", err?.message || "Erro ao excluir equipe.");
          renderTeamEditor();
          console.error("❌ Falha ao excluir equipe:", err);
          alert(`Erro ao excluir equipe: ${err?.message || err}`);
        });
      return;
    }

    const btn = e.target.closest("button[data-open-team-modal]");
    if (!btn) return;

    const coordinator = String(btn.getAttribute("data-coordinator") || "").trim();
    const team = String(btn.getAttribute("data-equipe") || "").trim();
    if (!coordinator || !team) return;

    closeTeamsModal();
    openTeamMembersModal(coordinator, team);
  });

  equipesMembers?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-open-team-modal]");
    if (!btn) return;

    const coordinator = String(btn.getAttribute("data-coordinator") || "").trim();
    const team = String(btn.getAttribute("data-equipe") || "").trim();
    if (!coordinator || !team) return;

    openTeamMembersModal(coordinator, team);
  });

  equipesOverview?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-open-team-modal]");
    if (!btn) return;

    const coordinator = String(btn.getAttribute("data-coordinator") || "").trim();
    const team = String(btn.getAttribute("data-equipe") || "").trim();
    if (!coordinator || !team) return;

    openTeamMembersModal(coordinator, team);
  });

  membrosEquipeDisponiveis?.addEventListener("click", async (e) => {
    const biBtn = e.target.closest("button[data-open-bi]");
    if (biBtn) {
      const userId = normalizeEntityId(biBtn.getAttribute("data-open-bi") || "");
      const usuario = findUserByEntityId(userId);
      if (usuario) openLogsForUser(usuario);
      return;
    }

    const btn = e.target.closest("button[data-add-member], button[data-move-member]");
    if (!btn) return;

    const userId = normalizeEntityId(
      btn.getAttribute("data-add-member") || btn.getAttribute("data-move-member") || ""
    );
    const { coordinator, team } = currentTeamModal;
    if (!userId || !coordinator || !team) return;

    try {
      await persistUserTeamAssignment(userId, coordinator, team);
      await syncUsersAfterMutation();
    } catch (err) {
      console.error("❌ Falha ao salvar equipe do usuário:", err);
      alert(`Erro ao salvar equipe: ${err?.message || err}`);
    }
  });

  membrosEquipeLista?.addEventListener("click", async (e) => {
    const biBtn = e.target.closest("button[data-open-bi]");
    if (biBtn) {
      const userId = normalizeEntityId(biBtn.getAttribute("data-open-bi") || "");
      const usuario = findUserByEntityId(userId);
      if (usuario) openLogsForUser(usuario);
      return;
    }

    const btn = e.target.closest("button[data-remove-member]");
    if (!btn) return;

    const userId = normalizeEntityId(btn.getAttribute("data-remove-member") || "");
    if (!userId) return;

    try {
      await removeUserFromTeam(userId);
      await syncUsersAfterMutation();
    } catch (err) {
      console.error("❌ Falha ao remover usuário da equipe:", err);
      alert(`Erro ao remover da equipe: ${err?.message || err}`);
    }
  });

  fecharMembrosEquipe?.addEventListener("click", () => closeTeamMembersModal());
  fecharEquipeHeader?.addEventListener("click", () => closeTeamMembersModal());
  membrosEquipeBusca?.addEventListener("input", () => renderTeamMembersModal());

  function editarUsuario(id) {
    if (!canManageUsers(getSessionUser())) {
      alert("Somente TI pode editar usuários.");
      return;
    }

    const usuario = usuarios.find((u) => sameUserId(u.id, id));
    if (!usuario) return;

    const current = getSessionUser();
    const currentAccessProfile = getAccessProfile(current);

    if (currentAccessProfile !== "ti" && getAccessProfile(usuario) === "ti") {
      alert("Somente TI pode alterar usuários com perfil TI.");
      return;
    }

    modoEdicao = true;
    idEmEdicao = id;

    if (fieldNome) fieldNome.value = usuario.nome || "";
    if (fieldEmail) fieldEmail.value = usuario.email || "";
    if (fieldCargo) fieldCargo.value = usuario.cargo || "";
    syncTeamSelectors(usuario.coordenador, usuario.equipe);

    if (fieldSenha) {
      fieldSenha.value = "";
      fieldSenha.required = false;
    }

    if (fieldConfirmarSenha) {
      fieldConfirmarSenha.value = "";
      fieldConfirmarSenha.required = false;
    }

    setUserModalCopy("edit");
    setUserFormFeedback("", "");
    renderRoleSelect((current?.role || "user").toLowerCase(), usuario);
    updateTeamAssignmentUI();
    openModal();
  }

  async function toggleStatusUsuario(id) {
    if (!canManageUsers(getSessionUser())) {
      alert("Somente TI pode alterar status de usuários.");
      return;
    }

    const usuario = usuarios.find((u) => sameUserId(u.id, id));
    if (!usuario) return;

    const current = getSessionUser();
    const currentAccessProfile = getAccessProfile(current);

    if (currentAccessProfile !== "ti" && getAccessProfile(usuario) === "ti") {
      alert("Somente TI pode alterar usuários com perfil TI.");
      return;
    }

    try {
      const updated = await apiToggleUser(id);
      usuarios = usuarios.map((u) => (sameUserId(u.id, id) ? normalizeUser(updated) : u));
      renderizarUsuarios();
    } catch (err) {
      console.error("❌ Falha ao alternar status:", err);
      alert("Erro ao alterar status. Veja o console (F12).");
    }
  }

  async function excluirUsuario(id) {
    if (!canManageUsers(getSessionUser())) {
      alert("Somente TI pode excluir usuários.");
      return;
    }

    const usuario = usuarios.find((u) => sameUserId(u.id, id));
    if (!usuario) return;

    const current = getSessionUser();
    const currentAccessProfile = getAccessProfile(current);

    if (currentAccessProfile !== "ti" && getAccessProfile(usuario) === "ti") {
      alert("Somente TI pode excluir usuários com perfil TI.");
      return;
    }

    const ok = confirm(`Excluir o usuário "${usuario.nome}"?`);
    if (!ok) return;

    try {
      await apiDeleteUser(id);
      getUserTeamKeys(usuario).forEach((key) => {
        delete userTeamMap[key];
        delete userAccessMap[key];
      });
      writeUserTeamStore();
      writeUserAccessStore();
      usuarios = usuarios.filter((u) => !sameUserId(u.id, id));
      renderizarUsuarios();
    } catch (err) {
      console.error("❌ Falha ao excluir:", err);
      alert("Erro ao excluir. Veja o console (F12).");
    }
  }

  async function abrirLogsUsuario(id) {
    const usuario = usuarios.find((u) => sameUserId(u.id, id));
    if (!usuario) return;
    await openLogsForUser(usuario);
  }

  // =======================================
  // SUBMIT (CREATE / EDIT)
  // =======================================
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!canManageUsers(getSessionUser())) {
      alert("Somente TI pode criar ou editar usuários.");
      return;
    }

    const nome = String(fieldNome?.value || "").trim();
    const emailRaw = String(fieldEmail?.value || "").trim();
    const cargo = String(fieldCargo?.value || "").trim();
    const rawCoordenador = String(inputCoordenador?.value || "").trim();
    const rawEquipe = String(inputEquipe?.value || "").trim();
    const senha = String(fieldSenha?.value || "");
    const confirmarSenha = String(fieldConfirmarSenha?.value || "");

    const emailCheck = ensureCompanyEmail(emailRaw);
    if (!emailCheck.ok) return alert(emailCheck.error);
    const email = emailCheck.value;

    const accessProfileSel = document.getElementById("accessProfileSelect");
    const selectedAccessProfile = normalizeAccessProfile(accessProfileSel?.value || "operacional");
    const selectedRole = accessProfileToLegacyRole(selectedAccessProfile);
    const needsAssignment = requiresTeamAssignment(cargo, selectedAccessProfile);

    if (!nome || !emailRaw || !cargo || (needsAssignment && (!rawCoordenador || !rawEquipe))) {
      alert("Preencha todos os campos obrigatórios");
      return;
    }

    const normalizedAssignment = needsAssignment
      ? normalizeAssignment({ coordenador: rawCoordenador, equipe: rawEquipe })
      : { coordenador: "", equipe: "" };

    const finalCoordenador = normalizedAssignment.coordenador;
    const finalEquipe = normalizedAssignment.equipe;

    if (needsAssignment && (!finalCoordenador || !finalEquipe)) {
      alert("Selecione um coordenador e uma equipe validos da lista.");
      return;
    }

    const current = getSessionUser();
    const creatorAccessProfile = getAccessProfile(current);

    if (creatorAccessProfile !== "ti" && selectedAccessProfile === "ti") {
      alert("Somente TI pode criar ou alterar usuários com perfil TI.");
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
      setUserFormSaving(true);
      if (modoEdicao) {
        const id = idEmEdicao;
        if (!id) return;

        const updated = await apiUpdateUser(id, {
          id,
          nome,
          email,
          cargo,
          role: selectedRole,
          accessProfile: selectedAccessProfile,
          coordenador: finalCoordenador,
          equipe: finalEquipe,
          ativo: true,
        });

        if (senha) {
          await apiUpdatePassword(id, senha);
        }

        applyUserMetaToState(updated || { id, email }, { coordenador: finalCoordenador, equipe: finalEquipe }, selectedAccessProfile);
        usuarios = usuarios.map((u) =>
          sameUserId(u.id, id)
            ? {
                ...normalizeUser(updated),
                coordenador: finalCoordenador,
                equipe: finalEquipe,
                accessProfile: selectedAccessProfile,
              }
            : u
        );
      } else {
        const created = await apiCreateUser({
          nome,
          email,
          cargo,
          role: selectedRole,
          accessProfile: selectedAccessProfile,
          coordenador: finalCoordenador,
          equipe: finalEquipe,
          ativo: true,
          senha,
        });

        applyUserMetaToState(created || { email }, { coordenador: finalCoordenador, equipe: finalEquipe }, selectedAccessProfile);

        if (!created || !created.id) {
          const provisionalUser = normalizeUser({
            id: email,
            nome,
            email,
            cargo,
            role: selectedRole,
            active: true,
            accessProfile: selectedAccessProfile,
          });

          if (provisionalUser && !usuarios.some((u) => cleanText(u.email).toLowerCase() === email.toLowerCase())) {
            usuarios = [
              {
                ...provisionalUser,
                coordenador: finalCoordenador,
                equipe: finalEquipe,
                accessProfile: selectedAccessProfile,
              },
              ...usuarios,
            ];
          }

          setTimeout(() => {
            carregarUsuariosDaAPI().catch((err) =>
              console.warn("Falha ao sincronizar usuários após cadastro:", err)
            );
          }, 600);
        } else {
          usuarios = [
            {
              ...normalizeUser(created),
              coordenador: finalCoordenador,
              equipe: finalEquipe,
              accessProfile: selectedAccessProfile,
            },
            ...usuarios,
          ];
        }
      }

      setUserFormFeedback("success", modoEdicao ? "Usuario atualizado com sucesso." : "Usuario criado com sucesso.");
      await syncUsersAfterMutation();
      closeModal({ reset: true });
    } catch (err) {
      console.error("❌ Falha ao salvar usuário:", err);
      setUserFormFeedback("error", err.message || "Erro ao salvar usuario.");
      alert(`Erro ao salvar usuário: ${err.message || "ver console (F12)"}`);
    } finally {
      setUserFormSaving(false);
    }
  });

  // =======================================
  // TABELA: AÇÕES
  // =======================================
  listaUsuarios?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-id]");
    if (!btn) return;

    const id = normalizeEntityId(btn.dataset.id);
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
      userTeamMap = readUserTeamStore();
      userAccessMap = readUserAccessStore();
      await loadSessionUser();

      if (!currentUser) {
        goto(LOGIN_PAGE_URL);
        return;
      }

      if (!canViewAdmin(currentUser)) {
        alert("Seu perfil não possui acesso ao ContAdmin.");
        goto("../contflow/contflow.html");
        return;
      }

      await loadModulesFromApi();
      try {
        teamConfig = await loadTeamConfigFromApi();
      } catch (teamConfigError) {
        console.warn("Falha ao carregar equipes da API:", teamConfigError);
        teamConfig = {};
      }

      syncSidebarFromStore();
      renderAdminPanel();
      bindAdminPanelEvents();
      applyRoleToSidebar();
      renderUserCard();
      renderEquipesOverview();
      renderEquipeMembers();
      populateCoordinatorList(getDefaultCoordinator());
      populateTeamList(getDefaultCoordinator(), getTeamsForCoordinator(getDefaultCoordinator())[0] || "");

      if (btnNovoUsuario) {
        btnNovoUsuario.style.display = canManageUsers(currentUser) ? "" : "none";
      }

      if (btnGerenciarEquipes) {
        btnGerenciarEquipes.style.display = canEditTeams(currentUser) ? "" : "none";
      }

      await carregarUsuariosDaAPI();
      renderEquipeMembers();

      console.log("🎉 ContAdmin JS inicializado!");
    } catch (err) {
      console.error("❌ Falha ao inicializar ContAdmin:", err);
      alert("Sessão inválida ou expirada. Faça login novamente.");
      goto(LOGIN_PAGE_URL);
    }
  }

  init();
});
