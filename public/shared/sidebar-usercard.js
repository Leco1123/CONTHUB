// public/shared/sidebar-usercard.js
// =======================================
// SIDEBAR USER CARD • GLOBAL (COMPAT)
// ✅ Mostra usuário logado
// ✅ Clique no card -> ../perfil/perfil.html
// ✅ Clique no Sair -> logout + ../login/login.html
// ✅ CAPTURE + top navigation (iframe-proof)
// ✅ Funciona com sessão conthub_user OU legado
// =======================================

import {
  getCurrentUser,
  requireAuth,
  logoutAndRedirect,
  roleLabel,
  avatarFromName,
} from "./auth-helper.js";

document.addEventListener("DOMContentLoaded", () => {
  const LOGIN_PAGE_URL = "../login/login.html";
  const USER_PAGE_URL = "../perfil/perfil.html";

  const userCard =
    document.querySelector("[data-usercard]") || document.querySelector(".usercard");
  if (!userCard) return;

  // garante sessão
  const u = requireAuth(LOGIN_PAGE_URL);
  if (!u) return;

  const btnLogout =
    userCard.querySelector("[data-logout]") ||
    userCard.querySelector(".btn--sair") ||
    document.querySelector("[data-logout]");

  const elUserName = userCard.querySelector("[data-user-name]") || document.querySelector("[data-user-name]");
  const elUserRole = userCard.querySelector("[data-user-role]") || document.querySelector("[data-user-role]");
  const elUserAvatar =
    userCard.querySelector("[data-user-avatar]") ||
    document.querySelector("[data-user-avatar]") ||
    userCard.querySelector(".usercard__avatar");

  // render
  if (elUserName) elUserName.textContent = u.nome || u.name || "Usuário";
  if (elUserRole) elUserRole.textContent = roleLabel(u.role || "user");
  if (elUserAvatar) elUserAvatar.textContent = avatarFromName(u.nome || u.name);

  // navegação segura (top se estiver em iframe)
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

  // força clique
  userCard.style.pointerEvents = "auto";
  userCard.style.cursor = "pointer";
  userCard.style.position = "relative";
  userCard.style.zIndex = "999999";

  if (btnLogout) {
    btnLogout.style.pointerEvents = "auto";
    btnLogout.style.position = "relative";
    btnLogout.style.zIndex = "1000000";
    btnLogout.style.cursor = "pointer";
  }

  // SAIR (CAPTURE)
  ["pointerdown", "click"].forEach((evt) => {
    btnLogout?.addEventListener(
      evt,
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        logoutAndRedirect(LOGIN_PAGE_URL);
      },
      true
    );
  });

  // CARD (CAPTURE) -> perfil
  ["pointerdown", "click"].forEach((evt) => {
    userCard.addEventListener(
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

  console.log("✅ sidebar-usercard OK:", getCurrentUser());
});
