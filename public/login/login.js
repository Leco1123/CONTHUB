// ================================
// LOGIN • CONT HUB (FIXED + SESSION COOKIE)
// - Login via API (/api/auth/login)
// - ✅ Usa cookie de sessão (express-session) com credentials: "include"
// - ✅ Confirma sessão com /api/auth/me antes de redirecionar
// - Mantém compatibilidade com ContAdmin:
//   - conthub_user (objeto da sessão no front)
//   - conthub_current_user_id (id legado)
//   - conthub_usuarios (base local)
// ================================

const form = document.getElementById("loginForm");
const err = document.getElementById("err");
const pass = document.getElementById("password");
const eye = document.getElementById("togglePassword");
const submitBtn = form?.querySelector("button[type='submit']");
const loading = document.getElementById("loginLoading");

/* ===== KEYS ===== */
const USERS_KEY = "conthub_usuarios";
const CURRENT_USER_KEY = "conthub_current_user_id";
const SESSION_USER_KEY = "conthub_user"; // sessão nova (ContAdmin lê)

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

function upsertUserInStore(userFromApi) {
  const incoming = normalizeUser(userFromApi);

  if (!Number.isFinite(incoming.id) || incoming.id <= 0) {
    throw new Error("Usuário sem ID válido retornado pela API.");
  }

  const users = loadUsers();
  const idx = users.findIndex((x) => Number(x.id) === Number(incoming.id));

  if (idx >= 0) {
    const keepSenha = users[idx]?.senha; // preserva senha local se existir
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

  localStorage.setItem(SESSION_USER_KEY, JSON.stringify(u));
  localStorage.setItem(CURRENT_USER_KEY, String(u.id));
}

function clearLocalSession() {
  localStorage.removeItem(SESSION_USER_KEY);
  localStorage.removeItem(CURRENT_USER_KEY);
}

/**
 * ✅ Confirma que a sessão no servidor foi criada (cookie conthub.sid)
 * - Se der 401, você sabe que o cookie não colou ou a sessão não existe
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

  // seu /me pode retornar {user:{...}} ou {...}
  const me = data.user || data;
  return me && typeof me === "object" ? me : null;
}

/**
 * Fallback LOCAL (opcional):
 * Se a API falhar, tenta autenticar pelo conthub_usuarios (base local).
 */
function tryLocalLogin(email, password) {
  const emailLower = String(email || "").trim().toLowerCase();
  const passStr = String(password || "").trim();

  const users = loadUsers().map(normalizeUser);
  const u = users.find((x) => String(x.email || "").toLowerCase() === emailLower);

  if (!u) return { ok: false, error: "Usuário não encontrado (base local)." };
  if (u.ativo === false) return { ok: false, error: "Usuário desativado." };

  if (u.senha && String(u.senha) !== passStr) return { ok: false, error: "Senha inválida." };
  if (!u.senha) return { ok: false, error: "Usuário sem senha cadastrada localmente." };

  return { ok: true, user: u };
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

    // salva user pro front (cache/compatibilidade)
    const u = upsertUserInStore(data.user);
    setSession(u);

    // ✅ confirma sessão no servidor antes de ir pro dashboard
    const me = await confirmServerSession();
    if (!me) {
      clearLocalSession();
      throw new Error("Sessão não foi confirmada (/api/auth/me). Verifique cookie/CORS.");
    }

    // opcional: reforça dados vindos do servidor (fonte de verdade)
    setSession(me);

    window.location.href = "../dashboard/dashboard.html";
    return;
  } catch (apiErr) {
    console.warn("⚠️ Falha na API de login, tentando fallback local...", apiErr);

    // ====== FALLBACK LOCAL (DEV/EMERGÊNCIA) ======
    const local = tryLocalLogin(email, password);
    if (local.ok) {
      try {
        setSession(local.user);
        window.location.href = "../dashboard/dashboard.html";
        return;
      } catch (sessErr) {
        hideLoading();
        showError(sessErr?.message || "Não foi possível criar sessão.");
        if (submitBtn) submitBtn.disabled = false;
        return;
      }
    }

    hideLoading();
    showError(local.error || apiErr?.message || "Erro ao efetuar login.");
    if (submitBtn) submitBtn.disabled = false;
  }
});