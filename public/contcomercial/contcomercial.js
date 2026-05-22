(function () {
  const LOGIN_PAGE_URL = "../login/login.html";
  const API_MODULES = "/api/admin/modules";
  const STATUS_LABEL = {
    online: "ONLINE",
    dev: "DEV",
    offline: "OFF",
    admin: "ADMIN",
  };
  const NEXT_ACTIONS_LIMIT = 3;

  let currentUser = null;
  let moduleStatusMap = {};
  let moduleAccessMap = {};

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

  function getUserKey() {
    const user = getSessionUser();
    if (!user) return "anon";
    return String(user.email || user.id || user.nome || user.name || "anon").trim().toLowerCase();
  }

  function nextActionsStorageKey() {
    return `conthub:contcomercial:next-actions:${getUserKey()}`;
  }

  function normalizeAccessProfile(value) {
    const normalized = String(value || "").trim().toLowerCase();
    return ["ti", "gerencial", "coordenacao", "operacional", "consulta", "comercial"].includes(normalized)
      ? normalized
      : "operacional";
  }

  function getAccessProfile(user) {
    return normalizeAccessProfile(
      user?.accessProfile ||
      user?.access_profile ||
      (String(user?.role || "").trim().toLowerCase() === "admin" ? "gerencial" : user?.role)
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

  function canAccessModule(moduleId, user = getSessionUser()) {
    const id = String(moduleId || "").trim().toLowerCase();
    const role = String(user?.role || "").trim().toLowerCase();
    const profile = getAccessProfile(user);
    const rules = normalizeModuleAccess(moduleAccessMap[id]);

    if (role === "ti" || profile === "ti") return true;
    if (profile === "comercial") return id === "dashboard" || id === "contcomercial";
    if (id === "contadmin") return role === "admin" || profile === "gerencial";
    if (!rules.length || rules.includes("user") || rules.includes("user+admin")) return true;
    if (rules.includes("all") || rules.includes("*") || rules.includes("auth")) return true;
    if (rules.includes(role) || rules.includes(profile)) return true;
    if (rules.includes("admin") && role === "admin") return true;
    return false;
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

  function normalizeModuleStatus(status, active) {
    const normalized = String(status || "").trim().toLowerCase();
    if (active === false) return "offline";
    if (normalized === "offline" || normalized === "off") return "offline";
    if (normalized === "dev") return "dev";
    if (normalized === "admin") return "admin";
    return "online";
  }

  async function apiFetch(url, options = {}) {
    return fetch(url, {
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(options.headers || {}),
      },
      ...options,
    });
  }

  async function requireAuthOrRedirect() {
    try {
      const resp = await apiFetch("/api/auth/me", { method: "GET" });
      if (!resp.ok) {
        goto(LOGIN_PAGE_URL);
        return null;
      }

      const data = await resp.json().catch(() => null);
      const me = data && typeof data === "object" ? data.user || data : null;
      if (!me || typeof me !== "object") {
        goto(LOGIN_PAGE_URL);
        return null;
      }

      currentUser = me;
      return me;
    } catch (_) {
      goto(LOGIN_PAGE_URL);
      return null;
    }
  }

  async function loadModulesMap() {
    try {
      const resp = await apiFetch(API_MODULES, { method: "GET" });
      if (!resp.ok) throw new Error("Falha ao carregar módulos.");
      const data = await resp.json().catch(() => ({}));
      const rows = Array.isArray(data?.modules) ? data.modules : [];
      const statusMap = {};
      const accessMap = {};

      rows.forEach((row) => {
        const slug = String(row.slug || "").trim().toLowerCase();
        if (!slug) return;
        statusMap[slug] = normalizeModuleStatus(row.status, row.active);
        accessMap[slug] = String(row.access || "").trim();
      });

      moduleStatusMap = statusMap;
      moduleAccessMap = accessMap;
    } catch (_) {
      moduleStatusMap = {};
      moduleAccessMap = {};
    }
  }

  function fillUserCard() {
    const user = getSessionUser();
    const name = String(user?.nome || user?.name || "Usuário").trim();
    const initials = name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "U";

    const userName = document.getElementById("userName");
    const userRole = document.getElementById("userRole");
    const userInitials = document.getElementById("userInitials");
    const heroText = document.getElementById("heroText");
    const commercialProfileLabel = document.getElementById("commercialProfileLabel");

    if (userName) userName.textContent = name;
    if (userRole) userRole.textContent = accessProfileLabel(getAccessProfile(user));
    if (userInitials) userInitials.textContent = initials;
    if (commercialProfileLabel) commercialProfileLabel.textContent = accessProfileLabel(getAccessProfile(user));

    if (heroText && getAccessProfile(user) !== "comercial") {
      heroText.textContent =
        "Essa dashboard comercial também pode ser acompanhada por perfis de gestão e suporte, sem misturar a visualização com a operação contábil.";
    }
  }

  function applyShortcutStates() {
    document.querySelectorAll("[data-module-id]").forEach((card) => {
      const moduleId = String(card.dataset.moduleId || "").trim().toLowerCase();
      if (!moduleId) return;

      const blocked = !canAccessModule(moduleId, getSessionUser());
      const status = moduleStatusMap[moduleId] || "online";
      card.dataset.disabled = status === "offline" ? "true" : "false";
      card.dataset.noaccess = blocked ? "true" : "false";
      if (moduleId !== "contcomercial") {
        card.hidden = blocked;
      }

      const pill = card.querySelector(".pill");
      if (pill && moduleId !== "contcomercial") {
        pill.textContent = STATUS_LABEL[status] || pill.textContent;
      }
    });
  }

  function loadNextActionsState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(nextActionsStorageKey()) || "null");
      if (!parsed || typeof parsed !== "object") {
        return {
          manual: Array.from({ length: NEXT_ACTIONS_LIMIT }, () => ""),
          checks: Array.from({ length: NEXT_ACTIONS_LIMIT }, () => false),
        };
      }

      const manual = Array.isArray(parsed.manual) ? parsed.manual.slice(0, NEXT_ACTIONS_LIMIT) : [];
      const checks = Array.isArray(parsed.checks) ? parsed.checks.slice(0, NEXT_ACTIONS_LIMIT) : [];
      while (manual.length < NEXT_ACTIONS_LIMIT) manual.push("");
      while (checks.length < NEXT_ACTIONS_LIMIT) checks.push(false);
      return { manual, checks };
    } catch (_) {
      return {
        manual: Array.from({ length: NEXT_ACTIONS_LIMIT }, () => ""),
        checks: Array.from({ length: NEXT_ACTIONS_LIMIT }, () => false),
      };
    }
  }

  function saveNextActionsState(state) {
    localStorage.setItem(nextActionsStorageKey(), JSON.stringify(state));
  }

  function updateActionMeta(state) {
    const meta = document.getElementById("commercialActionMeta");
    if (!meta) return;

    const filled = state.manual.filter((item) => String(item || "").trim()).length;
    const done = state.checks.filter(Boolean).length;
    meta.textContent = `${filled} ações preenchidas • ${done} concluídas`;
    meta.dataset.tone = done === filled && filled > 0 ? "ok" : "soft";
  }

  function renderNextActions() {
    const state = loadNextActionsState();
    const host = document.getElementById("nextActionsList");
    if (!host) return;

    host.innerHTML = "";

    for (let i = 0; i < NEXT_ACTIONS_LIMIT; i += 1) {
      const text = String(state.manual[i] || "").trim();
      const checked = Boolean(state.checks[i]);
      const row = document.createElement("div");
      row.className = `todo__row${checked ? " is-done" : ""}`;
      row.innerHTML = `
        <input type="checkbox" data-check="${i}" ${checked ? "checked" : ""} />
        <input
          class="todo__text ${text ? "" : "is-empty"}"
          type="text"
          value="${escapeHTML(text)}"
          placeholder="Clique aqui para anotar uma ação comercial..."
          data-edit="${i}"
          maxlength="220"
        />
        <button class="todo__del" type="button" title="Apagar" aria-label="Apagar" data-del="${i}">
          🗑
        </button>
      `;
      host.appendChild(row);
    }

    host.onclick = (e) => {
      const delBtn = e.target.closest("[data-del]");
      if (!delBtn) return;
      const idx = Number(delBtn.getAttribute("data-del"));
      if (!Number.isFinite(idx)) return;
      state.manual[idx] = "";
      state.checks[idx] = false;
      saveNextActionsState(state);
      renderNextActions();
    };

    host.onchange = (e) => {
      const checkbox = e.target.closest("[data-check]");
      if (!checkbox) return;
      const idx = Number(checkbox.getAttribute("data-check"));
      if (!Number.isFinite(idx)) return;
      state.checks[idx] = Boolean(checkbox.checked);
      saveNextActionsState(state);
      renderNextActions();
    };

    host.querySelectorAll("[data-edit]").forEach((input) => {
      input.addEventListener("focus", () => {
        input.classList.remove("is-empty");
      });

      input.addEventListener("blur", () => {
        const idx = Number(input.getAttribute("data-edit"));
        if (!Number.isFinite(idx)) return;
        state.manual[idx] = String(input.value || "").trim().slice(0, 220);
        saveNextActionsState(state);
        renderNextActions();
      });

      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          input.blur();
        }
      });
    });

    updateActionMeta(state);
  }

  function bindActionButtons() {
    const addBtn = document.getElementById("btnAddNextAction");
    const resetBtn = document.getElementById("btnResetNextActions");
    const clearChecksBtn = document.getElementById("btnResetChecks");

    addBtn?.addEventListener("click", () => {
      const state = loadNextActionsState();
      const idx = state.manual.findIndex((item) => !String(item || "").trim());
      const target = idx >= 0 ? idx : 0;
      const next = window.prompt("Digite a ação comercial:", "");
      if (next == null) return;
      state.manual[target] = String(next).trim().slice(0, 220);
      state.checks[target] = false;
      saveNextActionsState(state);
      renderNextActions();
    });

    resetBtn?.addEventListener("click", () => {
      if (!window.confirm("Resetar as ações comerciais deste usuário?")) return;
      saveNextActionsState({
        manual: Array.from({ length: NEXT_ACTIONS_LIMIT }, () => ""),
        checks: Array.from({ length: NEXT_ACTIONS_LIMIT }, () => false),
      });
      renderNextActions();
    });

    clearChecksBtn?.addEventListener("click", () => {
      const state = loadNextActionsState();
      state.checks = Array.from({ length: NEXT_ACTIONS_LIMIT }, () => false);
      saveNextActionsState(state);
      renderNextActions();
    });
  }

  function escapeHTML(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatDateLong(date) {
    try {
      return date.toLocaleDateString("pt-BR", {
        weekday: "long",
        day: "2-digit",
        month: "long",
      });
    } catch (_) {
      return date.toISOString().slice(0, 10);
    }
  }

  function renderCommercialPulse() {
    const now = new Date();
    const hour = now.getHours();
    const monthRef = document.getElementById("commercialMonthRef");
    const status = document.getElementById("commercialShiftStatus");
    const chip = document.getElementById("commercialShiftChip");
    const copy = document.getElementById("commercialShiftCopy");
    const today = document.getElementById("commercialToday");
    const windowEl = document.getElementById("commercialWindow");
    const progress = document.getElementById("commercialDayProgress");
    const meta = document.getElementById("commercialPulseMeta");
    const focus = document.getElementById("commercialFocusLabel");

    let label = "Organizado";
    let tone = "ok";
    let copyText = "Priorize retorno rápido, proposta em andamento e follow-up sem perder contexto.";
    let focusText = "Follow-up";

    if (hour < 10) {
      label = "Aquecendo";
      tone = "warn";
      copyText = "Hora de abrir contatos, revisar pendências e sair na frente com os retornos do dia.";
      focusText = "Abertura";
    } else if (hour >= 10 && hour < 15) {
      label = "Em tração";
      tone = "ok";
      copyText = "Momento ideal para avançar negociações, atacar propostas e manter o pipeline vivo.";
      focusText = "Negociação";
    } else if (hour >= 15 && hour < 19) {
      label = "Fechando o dia";
      tone = "ok";
      copyText = "Consolide próximos passos, devolutivas pendentes e organize o comercial para amanhã.";
      focusText = "Fechamento";
    } else {
      label = "Fora da janela";
      tone = "danger";
      copyText = "Se houver algo urgente, deixe o próximo passo registrado para o time começar sem ruído.";
      focusText = "Planejamento";
    }

    const minutes = hour * 60 + now.getMinutes();
    const start = 8 * 60;
    const end = 18 * 60;
    const progressPct = Math.max(0, Math.min(100, ((minutes - start) / (end - start)) * 100));

    if (monthRef) {
      monthRef.textContent = now.toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" });
    }
    if (status) {
      status.textContent = label;
      status.classList.remove("ok", "warn", "danger");
      status.classList.add(tone);
    }
    if (chip) chip.textContent = "COMERCIAL";
    if (copy) copy.textContent = copyText;
    if (today) today.textContent = formatDateLong(now);
    if (windowEl) windowEl.textContent = "08:00 às 18:00";
    if (progress) progress.style.width = `${progressPct.toFixed(2)}%`;
    if (meta) meta.textContent = `Turno comercial em ${Math.round(progressPct)}% da janela padrão.`;
    if (focus) focus.textContent = focusText;
  }

  function bindNavigation() {
    document.querySelectorAll("[data-goto]").forEach((button) => {
      button.addEventListener("click", () => {
        if (button.dataset.disabled === "true" || button.dataset.noaccess === "true") return;
        goto(button.dataset.goto);
      });
    });

    document.getElementById("btnJumpPipeline")?.addEventListener("click", () => {
      document.getElementById("commercialPipelinePanel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    const logoutBtn = document.querySelector("[data-logout]");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", async () => {
        try {
          await apiFetch("/api/auth/logout", { method: "POST" });
        } catch (_) {}
        goto(LOGIN_PAGE_URL);
      });
    }
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const me = await requireAuthOrRedirect();
    if (!me) return;

    await loadModulesMap();

    if (!canAccessModule("contcomercial", me)) {
      alert("Seu perfil não possui acesso à área comercial.");
      goto("../dashboard/dashboard.html");
      return;
    }

    fillUserCard();
    applyShortcutStates();
    renderCommercialPulse();
    renderNextActions();
    bindActionButtons();
    bindNavigation();
  });
})();
