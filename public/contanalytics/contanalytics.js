console.log("🚀 ContAnalytics JS carregando...");

document.addEventListener("DOMContentLoaded", () => {
  const LOGIN_PAGE_URL = "../login/login.html";
  const USER_PAGE_URL = "../perfil/perfil.html";
  const API_BASE = "";
  const API_MODULES = `${API_BASE}/api/admin/modules`;

  const statusLabel = {
    online: "ONLINE",
    dev: "DEV",
    offline: "OFF",
    admin: "ADMIN",
  };

  let currentUser = null;
  let moduleStatusMap = {};

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
    const devModuleName = document.getElementById("devModuleName");
    const devTitle = document.getElementById("devTitle");
    const devSubtitle = document.getElementById("devSubtitle");

    if (pageTitle) pageTitle.textContent = currentModuleTitle;
    if (pageSubtitle) pageSubtitle.textContent = currentModuleSubtitle;
    if (devModuleName) devModuleName.textContent = currentModuleTitle;
    if (devTitle) devTitle.textContent = `${currentModuleTitle} em desenvolvimento`;

    if (devSubtitle) {
      devSubtitle.textContent =
        `Estamos preparando o módulo ${currentModuleTitle} para receber novas funcionalidades, melhorias visuais e recursos adicionais dentro do ContHub.`;
    }
  }

  function initRobot() {
    const robot = document.getElementById("robot");
    if (!robot) return;

    function blinkRobot() {
      robot.classList.add("blink");
      setTimeout(() => {
        robot.classList.remove("blink");
      }, 180);
    }

    function talkRobot() {
      robot.classList.add("talk");
      setTimeout(() => {
        robot.classList.remove("talk");
      }, 450);
    }

    function randomBlinkLoop() {
      const nextBlink = Math.floor(Math.random() * 2500) + 1800;

      setTimeout(() => {
        blinkRobot();
        randomBlinkLoop();
      }, nextBlink);
    }

    setInterval(() => {
      talkRobot();
    }, 5000);

    randomBlinkLoop();
  }

  async function init() {
    try {
      await loadSessionUser();

      if (!currentUser) {
        goto(LOGIN_PAGE_URL);
        return;
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
      initRobot();

      console.log("🎉 ContAnalytics inicializado!");
    } catch (err) {
      console.error("❌ Falha ao inicializar ContAnalytics:", err);
      goto(LOGIN_PAGE_URL);
    }
  }

  init();
});