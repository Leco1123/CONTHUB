(function () {
  const LOGIN_PAGE_URL = "../login/login.html";
  const DASHBOARD_PAGE_URL = "../dashboard/dashboard.html";
  const MODULE_CATALOG = [
    { id: "dashboard", name: "Dashboard", desc: "Visão geral do ContHub.", icon: "🏠" },
    { id: "contcomercial", name: "ContComercial", desc: "Operação comercial e propostas.", icon: "💼" },
    { id: "contflow", name: "ContFlow", desc: "Fluxo e rotinas contábeis.", icon: "⚡" },
    { id: "contanalytics", name: "ContAnalytics", desc: "Indicadores e análise.", icon: "📊" },
    { id: "contdocs", name: "ContDocs", desc: "Documentos e reconciliações.", icon: "📁" },
    { id: "contrelatorios", name: "ContRelatórios", desc: "Exportações e relatórios.", icon: "📈" },
    { id: "contconfig", name: "ContConfig", desc: "Configurações do ecossistema.", icon: "⚙️" },
    { id: "contadmin", name: "ContAdmin", desc: "Usuários, equipes e permissões.", icon: "🛡️" },
  ];

  let authUser = null;

  const el = {
    avatar: document.getElementById("avatar"),
    nome: document.getElementById("nome"),
    email: document.getElementById("email"),
    perfilAcesso: document.getElementById("perfilAcesso"),
    nivelAcesso: document.getElementById("nivelAcesso"),
    cargo: document.getElementById("cargo"),
    status: document.getElementById("status"),
    coordenador: document.getElementById("coordenador"),
    equipe: document.getElementById("equipe"),
    behavioralProfile: document.getElementById("behavioralProfile"),
    createdAt: document.getElementById("createdAt"),
    roleBadge: document.getElementById("roleBadge"),
    cargoBadge: document.getElementById("cargoBadge"),
    statusBadge: document.getElementById("statusBadge"),
    updatedAtPill: document.getElementById("updatedAtPill"),
    summaryBehavioral: document.getElementById("perfilBehavioral"),
    summaryEquipe: document.getElementById("perfilEquipe"),
    summaryPermissionMode: document.getElementById("perfilPermissionMode"),
    modulesList: document.getElementById("modulesList"),
    logsList: document.getElementById("logsList"),
    profileForm: document.getElementById("profileForm"),
    profileFeedback: document.getElementById("profileFeedback"),
    profileName: document.getElementById("profileName"),
    profileEmail: document.getElementById("profileEmail"),
    profileCurrentPassword: document.getElementById("profileCurrentPassword"),
    profileNewPassword: document.getElementById("profileNewPassword"),
    profileConfirmPassword: document.getElementById("profileConfirmPassword"),
    btnVoltar: document.getElementById("btnVoltar"),
    btnSair: document.getElementById("btnSair"),
  };

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

  function cleanText(value) {
    return String(value ?? "").trim();
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => {
      switch (char) {
        case "&": return "&amp;";
        case "<": return "&lt;";
        case ">": return "&gt;";
        case '"': return "&quot;";
        default: return "&#039;";
      }
    });
  }

  function normalizeName(value) {
    return cleanText(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function avatarFromName(name) {
    const text = cleanText(name);
    return text ? text[0].toUpperCase() : "U";
  }

  function fmtTime(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString("pt-BR");
    } catch {
      return "—";
    }
  }

  function roleLabel(role) {
    const normalized = cleanText(role).toLowerCase();
    if (normalized === "ti") return "TI";
    if (normalized === "admin") return "ADMIN";
    if (normalized === "customer") return "CLIENTE";
    return "USER";
  }

  function accessProfileLabel(profile) {
    const normalized = cleanText(profile).toLowerCase();
    if (normalized === "ti") return "TI";
    if (normalized === "gerencial") return "Gerencial";
    if (normalized === "coordenacao") return "Coordenação";
    if (normalized === "comercial") return "Comercial";
    if (normalized === "consulta") return "Consulta";
    return "Operacional";
  }

  function permissionModeLabel(mode) {
    return cleanText(mode).toLowerCase() === "custom" ? "Matriz personalizada" : "Perfil padrão";
  }

  function splitBehavioralProfile(profile) {
    const raw = cleanText(profile);
    if (!raw) return [];
    return raw
      .split(/[\/|,;]+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 2);
  }

  function behavioralChipLabel(profile) {
    const normalized = normalizeName(profile);
    if (normalized.includes("execut")) return "Executor";
    if (normalized.includes("comunic")) return "Comunicador";
    if (normalized.includes("anal")) return "Analista";
    if (normalized.includes("planej")) return "Planejador";
    return cleanText(profile);
  }

  function showFeedback(message, variant = "success") {
    if (!el.profileFeedback) return;
    el.profileFeedback.textContent = message;
    el.profileFeedback.classList.remove("hidden", "message--error", "message--success");
    el.profileFeedback.classList.add(variant === "error" ? "message--error" : "message--success");
  }

  function clearFeedback() {
    if (!el.profileFeedback) return;
    el.profileFeedback.textContent = "";
    el.profileFeedback.classList.add("hidden");
    el.profileFeedback.classList.remove("message--error", "message--success");
  }

  async function fetchJson(url, opts = {}) {
    const resp = await fetch(url, {
      method: opts.method || "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(opts.headers || {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      if (resp.status === 401) {
        authUser = null;
        goto(LOGIN_PAGE_URL);
        return null;
      }
      throw new Error(data?.error || data?.message || `HTTP ${resp.status}`);
    }
    return data;
  }

  async function requireSession() {
    const payload = await fetchJson("/api/auth/me");
    const user = payload?.user || payload || null;
    if (!user) {
      goto(LOGIN_PAGE_URL);
      return null;
    }
    authUser = user;
    return user;
  }

  function renderProfile(user) {
    if (!user) return;

    const displayName = cleanText(user.nome) || cleanText(user.email) || "Usuário";
    const statusLabel = user.ativo ? "Ativo" : "Inativo";
    const behavioralProfiles = splitBehavioralProfile(user.behavioralProfile);
    const behavioralText = behavioralProfiles.length
      ? behavioralProfiles.map(behavioralChipLabel).join(" • ")
      : "Sem perfil comportamental";

    if (el.avatar) el.avatar.textContent = avatarFromName(displayName);
    if (el.nome) el.nome.textContent = displayName;
    if (el.email) el.email.textContent = cleanText(user.email) || "—";
    if (el.perfilAcesso) el.perfilAcesso.textContent = accessProfileLabel(user.accessProfile);
    if (el.nivelAcesso) el.nivelAcesso.textContent = permissionModeLabel(user.permissionMode);
    if (el.cargo) el.cargo.textContent = cleanText(user.cargo) || "Não informado";
    if (el.status) el.status.textContent = statusLabel;
    if (el.coordenador) el.coordenador.textContent = cleanText(user.coordenador) || "Sem coordenação";
    if (el.equipe) el.equipe.textContent = cleanText(user.equipe) || "Sem equipe";
    if (el.behavioralProfile) el.behavioralProfile.textContent = behavioralText;
    if (el.createdAt) el.createdAt.textContent = fmtTime(user.createdAt);
    if (el.updatedAtPill) el.updatedAtPill.textContent = `Atualização ${fmtTime(user.updatedAt)}`;
    if (el.roleBadge) el.roleBadge.textContent = roleLabel(user.role);
    if (el.cargoBadge) el.cargoBadge.textContent = cleanText(user.cargo) || "Sem cargo";
    if (el.statusBadge) {
      el.statusBadge.textContent = statusLabel.toUpperCase();
      el.statusBadge.classList.toggle("badge--off", !user.ativo);
    }

    if (el.summaryBehavioral) el.summaryBehavioral.textContent = behavioralText;
    if (el.summaryEquipe) {
      el.summaryEquipe.textContent = cleanText(user.equipe)
        ? `${cleanText(user.coordenador) || "Sem coord."} / ${cleanText(user.equipe)}`
        : "Sem equipe";
    }
    if (el.summaryPermissionMode) el.summaryPermissionMode.textContent = permissionModeLabel(user.permissionMode);

    if (el.profileName) el.profileName.value = displayName;
    if (el.profileEmail) el.profileEmail.value = cleanText(user.email);
  }

  function getModuleCatalogMap() {
    return Object.fromEntries(MODULE_CATALOG.map((item) => [item.id, item]));
  }

  function normalizeModuleStatus(permission) {
    const raw = cleanText(permission?.status || permission?.moduleStatus).toLowerCase();
    if (raw === "offline") return "offline";
    if (raw === "dev") return "dev";
    if (raw === "admin") return "online";
    return "online";
  }

  function renderModules(user) {
    if (!el.modulesList) return;
    const catalog = getModuleCatalogMap();
    const permissions = Array.isArray(user?.permissions) ? user.permissions : [];

    if (!permissions.length) {
      el.modulesList.innerHTML = '<div class="message message--error">Nenhuma permissão encontrada para este usuário.</div>';
      return;
    }

    el.modulesList.innerHTML = permissions
      .filter((entry) => entry?.view)
      .map((entry) => {
        const moduleId = cleanText(entry.moduleId).toLowerCase();
        const catalogRow = catalog[moduleId] || {};
        const status = normalizeModuleStatus(entry);
        const permissionPills = [
          entry.view ? '<span class="pill pill--permission">Ver</span>' : "",
          entry.edit ? '<span class="pill pill--permission">Editar</span>' : "",
          entry.manage ? '<span class="pill pill--permission">Gerenciar</span>' : "",
        ].filter(Boolean).join("");

        return `
          <article class="module">
            <div class="module__left">
              <span class="module__icon">${catalogRow.icon || "•"}</span>
              <div class="module__text">
                <p class="module__name">${escapeHtml(catalogRow.name || moduleId || "Módulo")}</p>
                <p class="module__desc">${escapeHtml(catalogRow.desc || "Permissão herdada da sua matriz de acesso.")}</p>
              </div>
            </div>
            <div class="module__right">
              <span class="pill pill--${status === "offline" ? "off" : status === "dev" ? "dev" : "online"}">${status.toUpperCase()}</span>
              ${permissionPills}
            </div>
          </article>
        `;
      })
      .join("");
  }

  function normalizeLogLine(log) {
    return {
      when: fmtTime(log.createdAt || log.timestamp),
      action: cleanText(log.action || "LOG"),
      by: cleanText(log.actorEmail),
      message: cleanText(log.message),
    };
  }

  async function renderLogs() {
    if (!el.logsList) return;
    el.logsList.innerHTML = '<div class="message">Carregando atividade...</div>';
    try {
      const payload = await fetchJson("/api/auth/logs?limit=20");
      const logs = Array.isArray(payload?.logs) ? payload.logs : [];
      if (!logs.length) {
        el.logsList.innerHTML = '<div class="message">Sem atividade registrada até agora.</div>';
        return;
      }

      el.logsList.innerHTML = logs
        .map(normalizeLogLine)
        .map(
          (line) => `
            <article class="log">
              <div class="log__msg">
                <strong>${escapeHtml(line.action)}</strong>
                ${line.message ? ` • ${escapeHtml(line.message)}` : ""}
                ${line.by ? `<span class="muted">(${escapeHtml(line.by)})</span>` : ""}
              </div>
              <div class="log__time">${escapeHtml(line.when)}</div>
            </article>
          `
        )
        .join("");
    } catch (err) {
      el.logsList.innerHTML = `<div class="message message--error">${escapeHtml(err?.message || "Não foi possível carregar os logs.")}</div>`;
    }
  }

  async function logout() {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch (_) {}
    authUser = null;
    goto(LOGIN_PAGE_URL);
  }

  document.querySelectorAll("[data-password-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const targetId = cleanText(button.getAttribute("data-password-toggle"));
      const input = targetId ? document.getElementById(targetId) : null;
      if (!input) return;
      const showing = input.type === "text";
      input.type = showing ? "password" : "text";
      button.textContent = showing ? "👁" : "🙈";
    });
  });

  el.btnVoltar?.addEventListener("click", () => goto(DASHBOARD_PAGE_URL));
  el.btnSair?.addEventListener("click", logout);

  el.profileForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFeedback();

    const name = cleanText(el.profileName?.value);
    const currentPassword = cleanText(el.profileCurrentPassword?.value);
    const newPassword = cleanText(el.profileNewPassword?.value);
    const confirmPassword = cleanText(el.profileConfirmPassword?.value);

    if (!name) {
      showFeedback("O nome não pode ficar vazio.", "error");
      return;
    }

    if (newPassword || currentPassword || confirmPassword) {
      if (!currentPassword || !newPassword || !confirmPassword) {
        showFeedback("Preencha senha atual, nova senha e confirmação.", "error");
        return;
      }
      if (newPassword.length < 10) {
        showFeedback("A nova senha deve ter no mínimo 10 caracteres.", "error");
        return;
      }
      if (newPassword !== confirmPassword) {
        showFeedback("A confirmação da senha não confere.", "error");
        return;
      }
    }

    try {
      const payload = await fetchJson("/api/auth/profile", {
        method: "PATCH",
        body: {
          name,
          currentPassword,
          newPassword,
        },
      });

      authUser = payload?.user || authUser;
      renderProfile(authUser);
      renderModules(authUser);
      await renderLogs();

      if (el.profileCurrentPassword) el.profileCurrentPassword.value = "";
      if (el.profileNewPassword) el.profileNewPassword.value = "";
      if (el.profileConfirmPassword) el.profileConfirmPassword.value = "";

      showFeedback(payload?.unchanged ? "Nenhuma alteração foi necessária." : "Perfil atualizado com sucesso.");
    } catch (err) {
      showFeedback(err?.message || "Não foi possível salvar o perfil.", "error");
    }
  });

  (async function init() {
    try {
      const user = await requireSession();
      if (!user) return;
      renderProfile(user);
      renderModules(user);
      await renderLogs();
    } catch (err) {
      console.warn("Falha ao abrir o perfil:", err);
      goto(LOGIN_PAGE_URL);
    }
  })();
})();
