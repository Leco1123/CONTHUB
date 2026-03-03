const form = document.getElementById("signupForm");
const err = document.getElementById("err");
const pass = document.getElementById("password");
const eye = document.getElementById("togglePassword");

eye?.addEventListener("click", () => {
  if (!pass) return;
  const hidden = pass.type === "password";
  pass.type = hidden ? "text" : "password";
  eye.textContent = hidden ? "🙈" : "👁";
});

function showError(msg) {
  err.textContent = msg;
  err.classList.remove("hidden");
}
function clearError() {
  err.textContent = "";
  err.classList.add("hidden");
}

form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError();

  const name = String(form.name?.value || "").trim();
  const email = String(form.email?.value || "").trim();
  const password = String(form.password?.value || "").trim();
  const password2 = String(form.password2?.value || "").trim();

  if (!name || !email || !password || !password2) return showError("Preencha todos os campos.");
  if (password.length < 6) return showError("A senha deve ter no mínimo 6 caracteres.");
  if (password !== password2) return showError("As senhas não conferem.");

  try {
    const resp = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });

    const raw = await resp.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw };}

    if (!resp.ok) {
      console.error("Signup error:", resp.status, data);
      throw new Error(data?.error || data?.message || `Erro ao cadastrar (HTTP ${resp.status}).`);
    }

    // Depois do cadastro, vai pro login
    window.location.href = "/login/login.html";
  } catch (e2) {
    showError(e2?.message || "Erro ao cadastrar.");
  }
});
