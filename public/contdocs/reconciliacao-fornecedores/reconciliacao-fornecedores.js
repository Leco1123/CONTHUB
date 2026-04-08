console.log("🚀 Reconciliação de Fornecedores JS carregando...");

document.addEventListener("DOMContentLoaded", () => {
  const LOGIN_PAGE_URL = "../../login/login.html";
  const USER_PAGE_URL = "../../perfil/perfil.html";
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
  let ultimoArquivoGerado = "";

  const app = document.getElementById("app");
  const currentModuleId = app?.dataset.currentModule || "contdocs";
  const currentModuleTitle = app?.dataset.moduleTitle || "Reconciliação de Fornecedores";
  const currentModuleSubtitle =
    app?.dataset.moduleSubtitle ||
    "Cruze a base contábil com a posição do fornecedor e gere um relatório Excel formatado.";

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
        const err = new Error("Sessão não disponível.");
        err.status = 401;
        throw err;
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
    const payload = await fetchJson(API_MODULES, { method: "GET" }).catch(() => null);
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
    if (pageTitle) pageTitle.textContent = currentModuleTitle;
    if (pageSubtitle) pageSubtitle.textContent = currentModuleSubtitle;
  }

  function setProgress(value, statusText) {
    const fill = document.getElementById("progressFill");
    const percent = document.getElementById("progressPercent");
    const status = document.getElementById("progressStatus");
    const safeValue = Math.max(0, Math.min(100, Number(value) || 0));
    if (fill) fill.style.width = `${safeValue}%`;
    if (percent) percent.textContent = `${safeValue}%`;
    if (status && statusText) status.textContent = statusText;
  }

  function setRunState(state, label, summary) {
    const badge = document.getElementById("runBadge");
    const resumo = document.getElementById("statusExecucaoResumo");

    if (badge) {
      badge.setAttribute("data-state", state || "idle");
      badge.textContent = label || "Pronto para executar";
    }

    if (resumo && summary) {
      resumo.textContent = summary;
    }
  }

  function refreshExecutionOverview() {
    const arquivoContabil = document.getElementById("arquivoContabil")?.files?.[0];
    const arquivoFornecedor = document.getElementById("arquivoFornecedor")?.files?.[0];
    const saida = document.getElementById("arquivoSaidaNome")?.value?.trim();

    const statusContabil = document.getElementById("statusArquivoContabil");
    const statusBase = document.getElementById("statusArquivoBase");
    const statusSaida = document.getElementById("statusArquivoSaida");

    if (statusContabil) {
      statusContabil.textContent = arquivoContabil ? arquivoContabil.name : "Aguardando arquivo";
    }

    if (statusBase) {
      statusBase.textContent = arquivoFornecedor ? arquivoFornecedor.name : "Aguardando arquivo";
    }

    if (statusSaida) {
      statusSaida.textContent = saida || "Será gerado automaticamente";
    }

    if (arquivoContabil && arquivoFornecedor) {
      setRunState("ready", "Pronto para executar", "Arquivos validados e automação pronta");
      return;
    }

    setRunState("idle", "Aguardando arquivos", "Validação pendente");
  }

  function addLog(message) {
    const logBox = document.getElementById("logBox");
    if (!logBox) return;
    const line = document.createElement("div");
    line.className = "log-line";
    line.textContent = message;
    logBox.appendChild(line);
    logBox.scrollTop = logBox.scrollHeight;
  }

  function handleInitError(err) {
    console.error("❌ Falha ao inicializar Reconciliação de Fornecedores:", err);
    setProgress(0, "Erro ao carregar a automação.");
    addLog(`Erro ao carregar a tela: ${err?.message || err}`);
    fillPageTexts();
    bindMenu();
    bindSidebarNavigation();
    syncSidebarFromStore();
    markCurrentModuleActive();
    bindFileInputs();
    bindActions();
    renderUserCard();
    refreshExecutionOverview();
  }

  function formatarNomeSaida() {
    const nomeEmpresa = document.getElementById("nomeEmpresa")?.value?.trim() || "Empresa";
    const normalizado = nomeEmpresa.replace(/[^\w\-]+/g, "_");
    const agora = new Date();
    const pad = (n) => String(n).padStart(2, "0");

    const nome = `Relatorio_Reconciliacao_Fornecedores_${normalizado}_${agora.getFullYear()}${pad(
      agora.getMonth() + 1
    )}${pad(agora.getDate())}_${pad(agora.getHours())}${pad(
      agora.getMinutes()
    )}${pad(agora.getSeconds())}.xlsx`;

    const campo = document.getElementById("arquivoSaidaNome");
    if (campo) campo.value = nome;
    refreshExecutionOverview();
    return nome;
  }

  function bindFileInputs() {
    document.querySelectorAll(".file-trigger").forEach((button) => {
      button.addEventListener("click", () => {
        const targetId = button.getAttribute("data-target");
        const input = document.getElementById(targetId);
        input?.click();
      });
    });

    const arquivoContabil = document.getElementById("arquivoContabil");
    const arquivoFornecedor = document.getElementById("arquivoFornecedor");
    const arquivoContabilNome = document.getElementById("arquivoContabilNome");
    const arquivoFornecedorNome = document.getElementById("arquivoFornecedorNome");

    arquivoContabil?.addEventListener("change", () => {
      const file = arquivoContabil.files?.[0];
      if (arquivoContabilNome) arquivoContabilNome.value = file ? file.name : "";
      addLog(file ? `Arquivo contábil selecionado: ${file.name}` : "Arquivo contábil limpo.");
      refreshExecutionOverview();
    });

    arquivoFornecedor?.addEventListener("change", () => {
      const file = arquivoFornecedor.files?.[0];
      if (arquivoFornecedorNome) arquivoFornecedorNome.value = file ? file.name : "";
      addLog(file ? `Arquivo fornecedor selecionado: ${file.name}` : "Arquivo fornecedor limpo.");
      refreshExecutionOverview();
    });

    document.getElementById("btnGerarNomeSaida")?.addEventListener("click", () => {
      const nome = formatarNomeSaida();
      addLog(`Nome sugerido para saída: ${nome}`);
    });

    document.getElementById("nomeEmpresa")?.addEventListener("input", () => {
      formatarNomeSaida();
    });
  }

  function baixarBlobComoArquivo(blob, nomeArquivo) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nomeArquivo;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }

  function bindActions() {
    document.getElementById("btnVoltarContdocs")?.addEventListener("click", () => {
      goto("../contdocs.html");
    });

    document.getElementById("btnLimparRecon")?.addEventListener("click", () => {
      const ids = [
        "arquivoContabilNome",
        "arquivoFornecedorNome",
        "arquivoSaidaNome",
        "nomeEmpresa",
        "nomeResponsavel",
      ];

      ids.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = "";
      });

      ["arquivoContabil", "arquivoFornecedor"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = "";
      });

      document.getElementById("tolerancia").value = "0.01";
      document.getElementById("limiarFuzzy").value = "0.88";
      document.getElementById("usarFuzzy").checked = true;
      document.getElementById("abrirAoFinal").checked = true;

      setProgress(0, "Aguardando execução...");
      addLog("Campos limpos.");
      refreshExecutionOverview();
    });

    document.getElementById("btnAbrirUltimo")?.addEventListener("click", () => {
      if (!ultimoArquivoGerado) {
        addLog("Nenhum relatório foi gerado nesta sessão.");
        return;
      }
      window.open(ultimoArquivoGerado, "_blank");
    });

    document.getElementById("btnExecutarRecon")?.addEventListener("click", async () => {
      const btn = document.getElementById("btnExecutarRecon");
      const arquivoContabil = document.getElementById("arquivoContabil")?.files?.[0];
      const arquivoFornecedor = document.getElementById("arquivoFornecedor")?.files?.[0];
      const nomeEmpresa = document.getElementById("nomeEmpresa")?.value?.trim() || "API";
      const usarFuzzy = document.getElementById("usarFuzzy")?.checked;
      const limiarFuzzy = document.getElementById("limiarFuzzy")?.value?.trim() || "0.88";
      const tolerancia = document.getElementById("tolerancia")?.value?.trim() || "0.01";
      const abrirAoFinal = document.getElementById("abrirAoFinal")?.checked;

      if (!arquivoContabil) {
        addLog("Selecione o arquivo contábil.");
        setProgress(0, "Selecione o arquivo contábil.");
        return;
      }

      if (!arquivoFornecedor) {
        addLog("Selecione o arquivo do fornecedor.");
        setProgress(0, "Selecione o arquivo do fornecedor.");
        return;
      }

      try {
        btn.disabled = true;
        formatarNomeSaida();
        addLog("Iniciando reconciliação de fornecedores...");
        setProgress(15, "Enviando arquivos para processamento...");
        setRunState("processing", "Processando", "Arquivos enviados para o servidor");

        const form = new FormData();
        form.append("arquivo_contabil", arquivoContabil);
        form.append("arquivo_fornecedor", arquivoFornecedor);
        form.append("nome_empresa", nomeEmpresa);
        form.append("usar_fuzzy", String(usarFuzzy));
        form.append("limiar_fuzzy", limiarFuzzy);
        form.append("tolerancia", tolerancia);

        const response = await fetch("/api/reconciliacao/fornecedores/processar", {
          method: "POST",
          body: form,
          credentials: "include",
        });

        setProgress(65, "Processamento concluído no servidor. Preparando download...");

        if (!response.ok) {
          let erroTexto = "Falha ao processar reconciliação de fornecedores.";
          try {
            const erroJson = await response.json();
            erroTexto = erroJson?.error || erroTexto;
            if (erroJson?.stderr) addLog(`stderr: ${erroJson.stderr}`);
            if (erroJson?.stdout) addLog(`stdout: ${erroJson.stdout}`);
          } catch (_) {}
          throw new Error(erroTexto);
        }

        const disposition = response.headers.get("content-disposition") || "";
        let nomeArquivo =
          document.getElementById("arquivoSaidaNome")?.value || "reconciliacao_fornecedores.xlsx";

        const match = disposition.match(/filename="?([^"]+)"?/i);
        if (match && match[1]) nomeArquivo = match[1];

        const blob = await response.blob();
        baixarBlobComoArquivo(blob, nomeArquivo);
        ultimoArquivoGerado = `/generated/reconciliacoes/${nomeArquivo}`;

        setProgress(100, "Reconciliação de fornecedores concluída com sucesso.");
        addLog(`Reconciliação de fornecedores concluída. Download iniciado: ${nomeArquivo}`);
        setRunState("success", "Concluído com sucesso", "Relatório gerado e download iniciado");

        if (abrirAoFinal) addLog("Opção 'Abrir relatório ao finalizar' marcada.");
      } catch (err) {
        console.error("Erro na reconciliação de fornecedores:", err);
        setProgress(0, `Erro: ${err.message}`);
        addLog(`Erro: ${err.message}`);
        setRunState("error", "Falha na execução", err.message || "Erro no processamento");
      } finally {
        btn.disabled = false;
        refreshExecutionOverview();
      }
    });
  }

  async function init() {
    try {
      await loadSessionUser();

      if (!currentUser) {
        throw new Error("Sessão do usuário não encontrada.");
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
      bindFileInputs();
      bindActions();

      const nome = currentUser?.nome || currentUser?.name || "";
      const usuarioWindows = currentUser?.email || nome || "Usuário logado";
      const usuarioEl = document.getElementById("usuarioWindows");
      if (usuarioEl) usuarioEl.textContent = usuarioWindows;

      formatarNomeSaida();
      setProgress(0, "Aguardando execução...");
      addLog("Reconciliação de fornecedores inicializada!");
      refreshExecutionOverview();
    } catch (err) {
      handleInitError(err);
    }
  }

  init();
});
