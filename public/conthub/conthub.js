// =======================================
// CONTADMIN • JS PRINCIPAL (SIMPLIFICADO + STATUS DE ACESSO VOLTOU)
// ✅ Mantém: sidebar status (ONLINE/DEV/OFF), aba "Status de Acesso" (cards + botões ON/DEV/OFF)
// ✅ Mantém: usuários (novo/editar/excluir/ativar) + nível de acesso (user/admin/ti)
// ✅ Mantém: cargo (sem sumário extra)
// =======================================

console.log("🚀 ContAdmin JS carregando...");

document.addEventListener("DOMContentLoaded", () => {
  console.log("✅ DOM totalmente carregado");

  // =======================================
  // SIDEBAR • ABRIR / FECHAR
  // =======================================
  const menuBtn = document.getElementById("menuBtn");
  const overlay = document.getElementById("overlay");

  menuBtn?.addEventListener("click", () => {
    document.body.classList.toggle("sidebar-open");
  });

  overlay?.addEventListener("click", () => {
    document.body.classList.remove("sidebar-open");
  });

  // =======================================
  // ABAS (USUÁRIOS | ACESSOS)
  // =======================================
  const abas = document.querySelectorAll(".aba-conthub");
  const views = document.querySelectorAll(".visualizacao-conthub");

  abas.forEach((aba) => {
    aba.addEventListener("click", () => {
      const alvo = aba.dataset.visualizacao;
      if (!alvo) return;

      abas.forEach((a) => a.classList.remove("ativa"));
      views.forEach((v) => v.classList.remove("ativa"));

      aba.classList.add("ativa");
      document.getElementById(alvo)?.classList.add("ativa");

      // quando abrir a aba "acessos", garante que o painel esteja atualizado
      if (alvo === "acessos") {
        renderAdminPanel();
      }
    });
  });

  // =======================================
  // STATUS DOS MÓDULOS (SIDEBAR + PAINEL)
  // =======================================
  const MODULES_KEY = "conthub_module_status";

  const statusLabel = {
    online: "ONLINE",
    dev: "DEV",
    offline: "OFF",
    admin: "ADMIN",
  };

  function readModuleStore() {
    try {
      return JSON.parse(localStorage.getItem(MODULES_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function writeModuleStore(obj) {
    localStorage.setItem(MODULES_KEY, JSON.stringify(obj));
  }

  function getSidebarCards() {
    return Array.from(
      document.querySelectorAll(".modulos-sidebar .cards-modulos[data-module-id]")
    );
  }

  function ensureStatusSpan(btn) {
    let pill = btn.querySelector("[data-status]");
    if (!pill) pill = btn.querySelector(".status");
    if (!pill) return null;

    if (!pill.getAttribute("data-status")) {
      const t = (pill.textContent || "").trim().toLowerCase();
      if (t === "admin") pill.setAttribute("data-status", "admin");
      else pill.setAttribute("data-status", "online");
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

    // OFFLINE bloqueia clique/navegação
    if (finalStatus === "offline") btn.setAttribute("data-disabled", "true");
    else btn.setAttribute("data-disabled", "false");
  }

  function syncSidebarFromStore() {
    const store = readModuleStore();
    getSidebarCards().forEach((btn) => {
      const moduleId = btn.dataset.moduleId;
      if (!moduleId) return;

      const defaultStatus = moduleId === "contadmin" ? "admin" : "online";
      const next = store[moduleId] || defaultStatus;

      applyStatusToSidebar(moduleId, next);
    });
  }

  // =======================================
  // PAINEL "STATUS DE ACESSO" (ABA) — CARDS IGUAIS SIDEBAR
  // (precisa existir um container com id="acessosGrid" na aba #acessos)
  // =======================================
  function renderAdminPanel() {
    const grid = document.getElementById("acessosGrid");
    if (!grid) return;

    const store = readModuleStore();
    const sidebarCards = getSidebarCards();

    grid.innerHTML = "";

    sidebarCards.forEach((card) => {
      const id = card.dataset.moduleId;
      if (!id) return;

      const icon =
        card.querySelector(".icone-modulo")?.textContent?.trim() || "📦";

      const title =
        card.dataset.title ||
        card.querySelector(".placeholder-titulo")?.textContent?.trim() ||
        "Módulo";

      const subtitle =
        card.dataset.subtitle ||
        card.querySelector(".placeholder")?.textContent?.trim() ||
        "";

      const isAdminModule = id === "contadmin";
      const current = isAdminModule ? "admin" : store[id] || "online";

      const wrap = document.createElement("div");
      wrap.className = "cards-modulos";
      wrap.setAttribute("data-module-id", id);

      wrap.innerHTML = `
        <span class="icone-modulo">${icon}</span>
        <span class="plaquinha-de-nome">
          <span class="placeholder-titulo">${title}</span>
          <span class="placeholder">${subtitle}</span>
        </span>
        <span class="acesso-actions">
          <span class="status" data-status="${current}">${
        statusLabel[current] || "ONLINE"
      }</span>
          <button type="button" data-set="online">ON</button>
          <button type="button" data-set="dev">DEV</button>
          <button type="button" data-set="offline">OFF</button>
        </span>
      `;

      // contadmin sempre "ADMIN" e travado
      if (isAdminModule) {
        wrap
          .querySelectorAll("button[data-set]")
          .forEach((b) => (b.disabled = true));
      }

      grid.appendChild(wrap);
    });

    // delegação: 1 listener só
    grid.onclick = (e) => {
      const btn = e.target.closest("button[data-set]");
      if (!btn) return;

      const card = e.target.closest(".cards-modulos[data-module-id]");
      if (!card) return;

      const moduleId = card.getAttribute("data-module-id");
      if (!moduleId || moduleId === "contadmin") return;

      const next = btn.getAttribute("data-set");
      if (!next) return;

      const storeNow = readModuleStore();
      storeNow[moduleId] = next;
      writeModuleStore(storeNow);

      syncSidebarFromStore();
      renderAdminPanel();
    };
  }

  // =======================================
  // ROLE (NÍVEL DE ACESSO): user | admin | ti
  // =======================================
  const ROLE_DEFAULT = "user"; // user | admin | ti

  function normalizeUser(u) {
    if (!u.role) u.role = ROLE_DEFAULT;
    return u;
  }

  const CURRENT_USER_KEY = "conthub_current_user_id";

  function getCurrentUserId() {
    const v = localStorage.getItem(CURRENT_USER_KEY);
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function getCurrentUser() {
    const id = getCurrentUserId();
    if (!id) return null;
    return usuarios.find((u) => u.id === id) || null;
  }

  // ADMIN não pode mexer em usuário TI
  function canManageTargetUser(current, target) {
    if (!current || !target) return true;
    current = normalizeUser(current);
    target = normalizeUser(target);

    if (current.role === "ti") return true;
    if (current.role === "admin" && target.role === "ti") return false;
    return true;
  }

  // USER não vê ContAdmin Hub
  function applyRoleToSidebar() {
    const current = getCurrentUser();
    getSidebarCards().forEach((card) => {
      const moduleId = card.dataset.moduleId;
      if (!moduleId) return;

      if (!current) {
        card.setAttribute("data-noaccess", "false");
        return;
      }

      const role = normalizeUser(current).role;
      const accessProfile = String(current.accessProfile || current.access_profile || role || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      const blocked =
        (moduleId === "contadmin" && role === "user") ||
        (moduleId === "contanalytics" &&
          !["ti", "admin", "gerencial", "coordenacao"].includes(accessProfile) &&
          !["ti", "admin"].includes(role));
      card.setAttribute("data-noaccess", blocked ? "true" : "false");
    });
  }

  // navegação do sidebar (respeitando OFFLINE e ROLE)
  document.querySelectorAll(".cards-modulos[data-src]").forEach((button) => {
    button.addEventListener("click", (e) => {
      const disabled = button.getAttribute("data-disabled") === "true";
      const noAccess = button.getAttribute("data-noaccess") === "true";

      if (disabled || noAccess) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      window.location.href = button.dataset.src;
    });
  });

  // =======================================
  // USUÁRIOS • LOCALSTORAGE
  // =======================================
  const STORAGE_KEY = "conthub_usuarios";

  const listaUsuarios = document.getElementById("lista-usuarios");
  const modal = document.getElementById("modalUsuario");
  const form = document.getElementById("formUsuario");
  const btnNovoUsuario = document.getElementById("btnNovoUsuario");
  const btnCancelar = document.getElementById("cancelarModal");

  let usuarios = [];
  let modoEdicao = false;
  let idEmEdicao = null;

  function carregarUsuarios() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch {
      return [];
    }
  }

  function salvarUsuarios() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(usuarios));
  }

  // =======================================
  // UI DO MODAL: SELECT DE ROLE (INJETADO) — sem sumário
  // =======================================
  function ensureRoleStyle() {
    if (document.getElementById("roleMiniStyle")) return;
    const st = document.createElement("style");
    st.id = "roleMiniStyle";
    st.textContent = `
      #roleBox{
        margin-top:6px;
        padding:10px;
        border:1px solid rgba(255,255,255,0.12);
        border-radius:10px;
        background:rgba(255,255,255,0.04);
      }
      .role-select{
        width:100%;
        height:36px;
        border-radius:10px;
        border:1px solid rgba(255,255,255,0.12);
        background:rgba(255,255,255,0.06);
        color:rgba(232,237,246,0.9);
        font-weight:900;
        padding:0 10px;
        outline:none;
        cursor:pointer;
      }
    `;
    document.head.appendChild(st);
  }
  ensureRoleStyle();

  function ensureRoleBox() {
    if (!form) return null;

    let box = document.getElementById("roleBox");
    if (box) return box;

    box = document.createElement("div");
    box.id = "roleBox";

    const acoes = form.querySelector(".acoes-form");
    if (acoes) form.insertBefore(box, acoes);
    else form.appendChild(box);

    return box;
  }

  function renderRoleSelect(usuarioRef) {
    const box = ensureRoleBox();
    if (!box) return;

    const ctx = usuarioRef
      ? normalizeUser(usuarioRef)
      : normalizeUser({ role: ROLE_DEFAULT });

    const current = getCurrentUser();
    const currentRole = current ? normalizeUser(current).role : null;

    // admin não consegue setar TI
    const disableTIOption = currentRole === "admin";

    box.innerHTML = `
      <div style="font-weight:900; font-size:12px; letter-spacing:.4px; text-transform:uppercase; color:rgba(232,237,246,.85); margin:6px 0 10px 0;">
        Nível de acesso
      </div>
      <select id="roleSelect" class="role-select">
        <option value="user" ${ctx.role === "user" ? "selected" : ""}>USER</option>
        <option value="admin" ${ctx.role === "admin" ? "selected" : ""}>ADMIN</option>
        <option value="ti" ${ctx.role === "ti" ? "selected" : ""} ${
      disableTIOption ? "disabled" : ""
    }>TI</option>
      </select>
    `;
  }

  // =======================================
  // MODAL
  // =======================================
  btnNovoUsuario?.addEventListener("click", () => {
    modoEdicao = false;
    idEmEdicao = null;
    form?.reset();
    modal?.classList.add("ativo");
    renderRoleSelect({ role: ROLE_DEFAULT });
  });

  btnCancelar?.addEventListener("click", () => {
    modal?.classList.remove("ativo");
    form?.reset();
    modoEdicao = false;
    idEmEdicao = null;
  });

  // =======================================
  // SUBMIT (CRIAR ou EDITAR)
  // =======================================
  form?.addEventListener("submit", (e) => {
    e.preventDefault();

    const nome = form.nome.value.trim();
    const email = form.email.value.trim();
    const cargo = form.cargo.value.trim();
    const senha = form.senha.value;

    if (!nome || !email || !cargo) {
      alert("Preencha todos os campos obrigatórios");
      return;
    }

    const emailLower = email.toLowerCase();
    const emailDuplicado = usuarios.some((u) => {
      if (modoEdicao && u.id === idEmEdicao) return false;
      return (u.email || "").toLowerCase() === emailLower;
    });

    if (emailDuplicado) {
      alert("Email já cadastrado");
      return;
    }

    const current = getCurrentUser();
    const roleSel = document.getElementById("roleSelect");
    const selectedRole = roleSel?.value || ROLE_DEFAULT;

    if (modoEdicao) {
      const usuario = usuarios.find((u) => u.id === idEmEdicao);
      if (!usuario) {
        alert("Usuário não encontrado para edição");
        return;
      }

      if (current && !canManageTargetUser(current, usuario)) {
        alert("ADMIN não pode alterar usuários TI.");
        return;
      }

      usuario.nome = nome;
      usuario.email = email;
      usuario.cargo = cargo;
      usuario.role = selectedRole;

      if (senha && senha.trim().length > 0) {
        if (senha.length < 6) {
          alert("Senha deve ter no mínimo 6 caracteres");
          return;
        }
        usuario.senha = senha;
      }
    } else {
      if (!senha || senha.length < 6) {
        alert("Senha deve ter no mínimo 6 caracteres");
        return;
      }

      const creatorRole = current ? normalizeUser(current).role : null;
      if (creatorRole === "admin" && selectedRole === "ti") {
        alert("ADMIN não pode criar usuário TI.");
        return;
      }

      usuarios.push(
        normalizeUser({
          id: Date.now(),
          nome,
          email,
          cargo,
          senha,
          ativo: true,
          role: selectedRole,
        })
      );
    }

    salvarUsuarios();
    renderizarUsuarios();

    form.reset();
    modal?.classList.remove("ativo");

    modoEdicao = false;
    idEmEdicao = null;

    applyRoleToSidebar();
  });

  // =======================================
  // RENDER TABELA
  // =======================================
  function renderizarUsuarios() {
    if (!listaUsuarios) return;

    listaUsuarios.innerHTML = "";

    if (!usuarios.length) {
      listaUsuarios.innerHTML = `
        <tr>
          <td colspan="5" class="muted" style="text-align:center;">Nenhum usuário cadastrado</td>
        </tr>
      `;
      return;
    }

    const current = getCurrentUser();

    usuarios.forEach((usuario) => {
      normalizeUser(usuario);

      const protegido = current && !canManageTargetUser(current, usuario);
      const roleBadge = (usuario.role || "user").toUpperCase();

      listaUsuarios.innerHTML += `
        <tr>
          <td>${usuario.nome}</td>
          <td>${usuario.email}</td>
          <td>${usuario.cargo} <span class="muted" style="font-size:11px;">(${roleBadge})</span></td>
          <td>
            <span class="status ${usuario.ativo ? "ativo" : "inativo"}">
              ${usuario.ativo ? "Ativo" : "Inativo"}
            </span>
          </td>
          <td>
            ${
              protegido
                ? `<span class="muted">Protegido</span>`
                : `
                  <button class="btn-acao btn-editar" data-id="${usuario.id}">Editar</button>
                  <button class="btn-acao btn-toggle" data-id="${usuario.id}">${usuario.ativo ? "Desativar" : "Ativar"}</button>
                  <button class="btn-acao btn-excluir" data-id="${usuario.id}">Excluir</button>
                `
            }
          </td>
        </tr>
      `;
    });
  }

  function toggleStatusUsuario(id) {
    const usuario = usuarios.find((u) => u.id === id);
    if (!usuario) return;

    const current = getCurrentUser();
    if (current && !canManageTargetUser(current, usuario)) {
      alert("ADMIN não pode alterar usuários TI.");
      return;
    }

    usuario.ativo = !usuario.ativo;
    salvarUsuarios();
    renderizarUsuarios();
    applyRoleToSidebar();
  }

  function excluirUsuario(id) {
    const usuario = usuarios.find((u) => u.id === id);
    if (!usuario) return;

    const current = getCurrentUser();
    if (current && !canManageTargetUser(current, usuario)) {
      alert("ADMIN não pode excluir usuário TI.");
      return;
    }

    const ok = confirm(`Excluir o usuário "${usuario.nome}"?`);
    if (!ok) return;

    usuarios = usuarios.filter((u) => u.id !== id);
    salvarUsuarios();
    renderizarUsuarios();
    applyRoleToSidebar();
  }

  function editarUsuario(id) {
    const usuario = usuarios.find((u) => u.id === id);
    if (!usuario) return;

    const current = getCurrentUser();
    if (current && !canManageTargetUser(current, usuario)) {
      alert("ADMIN não pode alterar usuários TI.");
      return;
    }

    normalizeUser(usuario);

    modoEdicao = true;
    idEmEdicao = id;

    form.nome.value = usuario.nome || "";
    form.email.value = usuario.email || "";
    form.cargo.value = usuario.cargo || "";

    form.senha.value = "";
    if (form.confirmarSenha) form.confirmarSenha.value = "";

    modal?.classList.add("ativo");
    renderRoleSelect(usuario);
  }

  listaUsuarios?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-id]");
    if (!btn) return;

    const id = Number(btn.dataset.id);
    if (!id) return;

    if (btn.classList.contains("btn-editar")) return editarUsuario(id);
    if (btn.classList.contains("btn-toggle")) return toggleStatusUsuario(id);
    if (btn.classList.contains("btn-excluir")) return excluirUsuario(id);
  });

  // =======================================
  // SELECT DE CARGO
  // =======================================
  const inputCargo = document.getElementById("cargo");
  const listaCargos = document.querySelector(".lista-cargos");

  inputCargo?.addEventListener("click", () => {
    if (!listaCargos) return;
    listaCargos.style.display =
      listaCargos.style.display === "block" ? "none" : "block";
  });

  listaCargos?.querySelectorAll("li").forEach((item) => {
    item.addEventListener("click", () => {
      if (!inputCargo) return;
      inputCargo.value = item.textContent.trim();
      if (listaCargos) listaCargos.style.display = "none";
    });
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".select-cargo")) {
      if (listaCargos) listaCargos.style.display = "none";
    }
  });

  // =======================================
  // INIT
  // =======================================
  usuarios = carregarUsuarios().map((u) => normalizeUser(u));
  renderizarUsuarios();

  syncSidebarFromStore();   // aplica status ONLINE/DEV/OFF no sidebar
  renderAdminPanel();       // desenha os cards na aba Status de Acesso (se existir #acessosGrid)
  applyRoleToSidebar();     // aplica bloqueio do ContAdmin Hub para USER

  console.log("🎉 ContAdmin JS inicializado com sucesso!");
});
