// ================================
// LOGIN • CONT HUB (SESSION COOKIE • 100% BACKEND)
// - Login via API (/api/auth/login)
// - Usa cookie de sessão (express-session) com credentials: "include"
// - Confirma sessão com /api/auth/me antes de redirecionar
// - NÃO usa localStorage para autenticação
// ================================

const form = document.getElementById("loginForm");
const err = document.getElementById("err");
const pass = document.getElementById("password");
const eye = document.getElementById("togglePassword");
const submitBtn = form?.querySelector("button[type='submit']");
const loading = document.getElementById("loginLoading");

/* ===== olho da senha ===== */
eye?.addEventListener("click", () => {
  if (!pass) return;
  const hidden = pass.type === "password";
  pass.type = hidden ? "text" : "password";
  if (eye) eye.textContent = hidden ? "🙈" : "👁";
});

/* ===== erro ===== */
function showError(msg) {
  if (!err) return;
  err.textContent = msg;
  err.classList.remove("hidden");
}

function clearError() {
  if (!err) return;
  err.textContent = "";
  err.classList.add("hidden");
}

/* ===== loading ===== */
function showLoading(text = "Entrando no ContHub...") {
  if (loading) loading.style.display = "grid";
  const t = document.getElementById("loginLoadingText");
  if (t) t.textContent = text;
  document.body.style.pointerEvents = "none";
}

function hideLoading() {
  if (loading) loading.style.display = "none";
  document.body.style.pointerEvents = "";
}

/**
 * Confirma que a sessão no servidor foi criada
 */
async function confirmServerSession() {
  const resp = await fetch("/api/auth/me", {
    method: "GET",
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
  });

  if (!resp.ok) return null;

  const data = await resp.json().catch(() => null);
  if (!data || typeof data !== "object") return null;

  return data.user || data || null;
}

/* ===== submit ===== */
form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError();

  const email = String(form.email?.value || "").trim();
  const password = String(form.password?.value || "").trim();

  if (!email || !password) {
    showError("Preencha email e senha.");
    return;
  }

  if (submitBtn) submitBtn.disabled = true;
  showLoading();

  await new Promise((r) => requestAnimationFrame(r));

  try {
    const resp = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      throw new Error(data?.error || "Usuário ou senha inválidos.");
    }

    if (!data || !data.user) {
      throw new Error("Resposta inválida do servidor (user ausente).");
    }

    const me = await confirmServerSession();
    if (!me) {
      throw new Error("Sessão não confirmada pelo servidor.");
    }

    window.location.href = "../dashboard/dashboard.html";
  } catch (apiErr) {
    console.warn("❌ Erro no login:", apiErr);
    hideLoading();
    showError(apiErr?.message || "Erro ao efetuar login.");
    if (submitBtn) submitBtn.disabled = false;
  }
});