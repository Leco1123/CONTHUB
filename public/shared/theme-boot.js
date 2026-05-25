(function () {
  const THEME_KEY = "conthub_theme";
  const THEMES = ["dark", "light"];

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
