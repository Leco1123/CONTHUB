const form = document.getElementById("resetForm");
const err = document.getElementById("err");

function showError(text) {
  err.textContent = text;
  err.classList.remove("hidden");
}
function clearError() {
  err.textContent = "";
  err.classList.add("hidden");
}

function getTokenFromUrl() {
  const url = new URL(window.location.href);
  return String(url.searchParams.get("token") || "").trim();
}

form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError();

  const token = getTokenFromUrl();
  const password = String(form.password?.value || "").trim();
  const password2 = String(form.password2?.value || "").trim();

  if (!token) return showError("Token ausente na URL.");
  if (!password || !password2) return showError("Preencha os campos.");
  if (password.length < 6) return showError("A senha deve ter no mínimo 6 caracteres.");
  if (password !== password2) return showError("As senhas não conferem.");

  try {
    const resp = await fetch("/api/auth/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || "Erro ao redefinir senha.");

    window.location.href = "/login/login.html";
  } catch (e2) {
    showError(e2?.message || "Erro ao redefinir senha.");
  }
});
