document.addEventListener("DOMContentLoaded", () => {
  const menuBtn = document.getElementById("menuBtn");
  const overlay = document.getElementById("overlay");

  if (!menuBtn || !overlay) return;

  function setOverlayState() {
    const open = document.body.classList.contains("sidebar-open");
    overlay.style.pointerEvents = open ? "auto" : "none";
    overlay.style.opacity = open ? "1" : "0";
    overlay.setAttribute("aria-hidden", open ? "false" : "true");
  }

  function closeSidebar() {
    document.body.classList.remove("sidebar-open");
    setOverlayState();
  }

  menuBtn.addEventListener("click", () => {
    document.body.classList.toggle("sidebar-open");
    setOverlayState();
  });

  overlay.addEventListener("click", closeSidebar);

  document.addEventListener("click", (event) => {
    const target = event.target.closest(".sidebar [data-src], .sidebar [data-goto], .sidebar [data-logout]");
    if (!target) return;
    closeSidebar();
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 1100 && document.body.classList.contains("sidebar-open")) {
      closeSidebar();
    }
  });

  setOverlayState();
});
