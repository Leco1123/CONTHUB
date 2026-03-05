// ================================
// LOGIN • CONT HUB (SESSION COOKIE • SEM FALLBACK LOCAL)
// - Login via API (/api/auth/login)
// - ✅ Usa cookie de sessão (express-session) com credentials: "include"
// - ✅ Confirma sessão com /api/auth/me antes de redirecionar
// - ✅ Mantém compatibilidade com ContAdmin:
//   - conthub_user (objeto cache UI)
//   - conthub_current_user_id (id legado)
//   - conthub_usuarios (base local)  <-- NÃO usa pra autenticar
// ================================

const form = document.getElementById("loginForm");
const err = document.getElementById("err");
const pass = document.getElementById("password");
const eye = document.getElementById("togglePassword");
const submitBtn = form?.querySelector("button[type='submit']");
const loading = document.getElementById("loginLoading");

/* ===== KEYS ===== */
const USERS_KEY = "conthub_usuarios"; // compatibilidade (não autentica)
const CURRENT_USER_KEY = "conthub_current_user_id";
const SESSION_USER_KEY = "conthub_user"; // cache UI (ContAdmin lê)

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

/* ===== helpers localStorage ===== */
function safeJsonParse(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function loadUsers() {
  const arr = safeJsonParse(localStorage.getItem(USERS_KEY) || "[]", []);
  return Array.isArray(arr) ? arr : [];
}

function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function normalizeRole(role) {
  const r = String(role || "").toLowerCase().trim();
  if (r === "ti") return "ti";
  if (r === "admin") return "admin";
  return "user";
}

function normalizeUser(userAny) {
  const u = userAny && typeof userAny === "object" ? userAny : {};
  const id = Number(u.id);

  const nome = String(u.nome || u.name || "Usuário").trim();
  const email = String(u.email || "").trim().toLowerCase();
  const cargo = String(u.cargo || u.roleName || u.funcao || "").trim();

  const ativo = u.ativo !== false;
  const role = normalizeRole(u.role);

  return {
    ...u,
    id,
    nome,
    email,
    cargo,
    ativo,
    role,
  };
}

// mantém store local (compatibilidade) — mas NÃO usa pra autenticar
function upsertUserInStore(userFromApi) {
  const incoming = normalizeUser(userFromApi);

  if (!Number.isFinite(incoming.id) || incoming.id <= 0) {
    throw new Error("Usuário sem ID válido retornado pela API.");
  }

  const users = loadUsers().map(normalizeUser);
  const idx = users.findIndex((x) => Number(x.id) === Number(incoming.id));

  if (idx >= 0) {
    const keepSenha = users[idx]?.senha; // preserva senha local se existir (legado)
    users[idx] = { ...users[idx], ...incoming };
    if (keepSenha && !users[idx].senha) users[idx].senha = keepSenha;
  } else {
    users.push(incoming);
  }

  saveUsers(users);
  return incoming;
}

function setSession(userNormalized) {
  const u = normalizeUser(userNormalized);

  if (u.ativo === false) {
    throw new Error("Usuário desativado. Solicite liberação ao ADMIN/TI.");
  }

  // cache UI (não é segurança)
  localStorage.setItem(SESSION_USER_KEY, JSON.stringify(u));
  localStorage.setItem(CURRENT_USER_KEY, String(u.id));
}

function clearLocalSession() {
  localStorage.removeItem(SESSION_USER_KEY);
  localStorage.removeItem(CURRENT_USER_KEY);
}

/**
 * ✅ Confirma que a sessão no servidor foi criada (cookie conthub.sid)
 */
async function confirmServerSession() {
  const resp = await fetch("/api/auth/me", {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" },
  });

  if (!resp.ok) return null;

  const data = await resp.json().catch(() => null);
  if (!data || typeof data !== "object") return null;

  // /me pode retornar {user:{...}} ou {...}
  const me = data.user || data;
  return me && typeof me === "object" ? me : null;
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
    // ====== LOGIN VIA API ======
    const resp = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "include", // ✅ ESSENCIAL: salva/manda cookie de sessão
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      throw new Error(data?.error || "Usuário ou senha inválidos.");
    }
    if (!data || !data.user) {
      throw new Error("Resposta inválida do servidor (user ausente).");
    }

    // cache/compatibilidade (não segurança)
    const u = upsertUserInStore(data.user);
    setSession(u);

    // ✅ confirma sessão real no servidor antes de ir pro dashboard
    const me = await confirmServerSession();
    if (!me) {
      clearLocalSession();
      throw new Error("Sessão não confirmada (/api/auth/me). Verifique cookie/CORS/session.");
    }

    // reforça dados do servidor (fonte de verdade)
    setSession(me);

    window.location.href = "../dashboard/dashboard.html";
    return;
  } catch (apiErr) {
    console.warn("❌ Erro no login:", apiErr);

    hideLoading();
    showError(apiErr?.message || "Erro ao efetuar login.");
    if (submitBtn) submitBtn.disabled = false;
  }
});