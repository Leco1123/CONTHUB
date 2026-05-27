(function () {
  const THEME_KEY = "conthub_theme";
  const THEMES = ["dark", "light"];
  const SIDEBAR_MODULES = [
    {
      id: "dashboard",
      title: "Dashboard",
      subtitle: "Visão geral",
      description: "Visão geral do ContHub.",
      icon: "🏠",
      href: "/dashboard/dashboard.html",
      defaultStatus: "online",
    },
    {
      id: "contcomercial",
      title: "ContComercial",
      subtitle: "Operação comercial",
      description: "Operação comercial, propostas e relacionamento.",
      icon: "💼",
      href: "/contcomercial/contcomercial.html",
      defaultStatus: "online",
    },
    {
      id: "ti-tickets",
      title: "Chamados TI",
      subtitle: "Suporte e fila",
      description: "Fila de chamados e suporte interno de TI.",
      icon: "🧰",
      href: "/dashboard/dashboard.html#dashboardChamadosPanel",
      defaultStatus: "online",
    },
    {
      id: "contflow",
      title: "ContFlow",
      subtitle: "Rotinas e fluxo",
      description: "Controle de rotinas e fluxo contábil.",
      icon: "⚡",
      href: "/contflow/contflow.html",
      defaultStatus: "online",
    },
    {
      id: "contanalytics",
      title: "ContAnalytics",
      subtitle: "KPIs e painel",
      description: "KPIs, indicadores e painéis de análise.",
      icon: "📊",
      href: "/contanalytics/contanalytics.html",
      defaultStatus: "online",
    },
    {
      id: "contdocs",
      title: "ContDocs",
      subtitle: "Documentos",
      description: "Centralização e gestão de documentos.",
      icon: "📁",
      href: "/contdocs/contdocs.html",
      defaultStatus: "offline",
    },
    {
      id: "contrelatorios",
      title: "ContRelatórios",
      subtitle: "Exportações",
      description: "Geração de relatórios e exportações.",
      icon: "📈",
      href: "/contrelatorios/contrelatorios.html",
      defaultStatus: "offline",
    },
    {
      id: "contconfig",
      title: "ContConfig",
      subtitle: "Parâmetros",
      description: "Parâmetros e configurações gerais.",
      icon: "⚙️",
      href: "/contconfig/contconfig.html",
      defaultStatus: "offline",
    },
    {
      id: "contadmin",
      title: "ContAdmin Hub",
      subtitle: "Acesso total",
      description: "Área administrativa e de controle total.",
      icon: "🛡️",
      href: "/contadmin/contadmin.html",
      defaultStatus: "admin",
    },
  ];

  function normalizeTheme(value) {
    return THEMES.includes(value) ? value : "dark";
  }

  function safeStorageGet() {
    try {
      return localStorage.getItem(THEME_KEY);
    } catch {
      return null;
    }
  }

  function safeStorageSet(value) {
    try {
      localStorage.setItem(THEME_KEY, value);
    } catch {}
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getThemeBootScriptUrl() {
    const current = document.currentScript;
    if (current?.src) return current.src;
    const fallback = document.querySelector('script[src*="theme-boot.js"]');
    return fallback?.src || "";
  }

  function ensureSidebarStylesheet() {
    if (document.querySelector('link[data-sidebar-standard="true"]')) return;
    const scriptUrl = getThemeBootScriptUrl();
    if (!scriptUrl) return;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = new URL("sidebar-standard.css", scriptUrl).href;
    link.setAttribute("data-sidebar-standard", "true");
    document.head.appendChild(link);
  }

  function inferCurrentModule() {
    const explicit = String(document.body?.dataset?.currentModule || "").trim().toLowerCase();
    if (explicit) return explicit;

    const path = String(window.location.pathname || "").toLowerCase();
    const hash = String(window.location.hash || "").toLowerCase();

    if (hash.includes("dashboardchamadospanel") || hash.includes("ti-tickets")) return "ti-tickets";
    if (path.includes("/contcomercial/")) return "contcomercial";
    if (path.includes("/contflow/")) return "contflow";
    if (path.includes("/contanalytics/")) return "contanalytics";
    if (path.includes("/contdocs/")) return "contdocs";
    if (path.includes("/contrelatorios/")) return "contrelatorios";
    if (path.includes("/contconfig/")) return "contconfig";
    if (path.includes("/contadmin/")) return "contadmin";
    if (path.includes("/dashboard/")) return "dashboard";
    return "";
  }

  function normalizeSidebarModules() {
    const navs = Array.from(document.querySelectorAll(".modulos-sidebar"));
    if (!navs.length) return;

    const currentModule = inferCurrentModule();
    if (document.body) {
      document.body.classList.add("has-standard-sidebar");
    }

    navs.forEach((nav) => {
      nav.innerHTML = SIDEBAR_MODULES.map((module) => {
        const isActive = module.id === currentModule;
        return `
          <button
            class="cards-modulos ${isActive ? "is-active" : ""}"
            type="button"
            data-module-id="${escapeHtml(module.id)}"
            data-title="${escapeHtml(module.title)}"
            data-src="${escapeHtml(module.href)}"
            data-goto="${escapeHtml(module.href)}"
            data-subtitle="${escapeHtml(module.description)}"
          >
            <span class="icone-modulo">${escapeHtml(module.icon)}</span>
            <span class="plaquinha-de-nome">
              <span class="placeholder-titulo">${escapeHtml(module.title)}</span>
              <span class="placeholder">${escapeHtml(module.subtitle)}</span>
            </span>
            <span class="status" data-status="${escapeHtml(module.defaultStatus)}">${escapeHtml(module.defaultStatus.toUpperCase())}</span>
          </button>
        `;
      }).join("");
    });
  }

  function ensureThemeSwitcher() {
    if (document.querySelector("[data-theme-choice]")) return;

    const sidebar =
      document.querySelector(".dashboardSidebar") ||
      document.querySelector(".profile-sidebar") ||
      document.querySelector("aside.sidebar") ||
      document.querySelector(".sidebar");

    if (!sidebar) return;

    const wrapper = document.createElement("div");
    wrapper.className = "theme-switcher theme-switcher--sidebar theme-switcher--auto";
    wrapper.setAttribute("aria-label", "Alternar tema");
    wrapper.innerHTML = `
      <button type="button" class="theme-switcher__button" data-theme-choice="dark">Preto</button>
      <button type="button" class="theme-switcher__button" data-theme-choice="light">Branco</button>
    `;

    const anchor =
      sidebar.querySelector(".sidebar__group") ||
      sidebar.querySelector(".titulo-sidebar") ||
      sidebar.querySelector(".sidebar__brand") ||
      sidebar.firstElementChild;

    if (anchor?.parentElement === sidebar) {
      anchor.insertAdjacentElement("afterend", wrapper);
      return;
    }

    sidebar.prepend(wrapper);
  }

  function syncThemeButtons(activeTheme) {
    document.querySelectorAll("[data-theme-choice]").forEach((button) => {
      const isActive = button.getAttribute("data-theme-choice") === activeTheme;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  function applyTheme(theme) {
    const nextTheme = normalizeTheme(theme);
    document.documentElement.setAttribute("data-theme", nextTheme);
    if (document.body) {
      document.body.setAttribute("data-theme", nextTheme);
    }
    safeStorageSet(nextTheme);
    syncThemeButtons(nextTheme);
    return nextTheme;
  }

  function getStoredTheme() {
    return normalizeTheme(safeStorageGet() || "dark");
  }

  function initThemeSwitcher() {
    ensureSidebarStylesheet();
    normalizeSidebarModules();
    ensureThemeSwitcher();
    const currentTheme = applyTheme(getStoredTheme());

    document.querySelectorAll("[data-theme-choice]").forEach((button) => {
      button.addEventListener("click", () => {
        applyTheme(button.getAttribute("data-theme-choice"));
      });
    });

    syncThemeButtons(currentTheme);
  }

  applyTheme(getStoredTheme());

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initThemeSwitcher, { once: true });
  } else {
    initThemeSwitcher();
  }

  window.ContHubTheme = {
    applyTheme,
    getStoredTheme,
    initThemeSwitcher,
  };
})();
