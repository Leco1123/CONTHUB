// server/routes/admin.users.routes.js
const express = require("express");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");
const db = require("../db"); // PrismaClient
const { requireContAdminAccess, requireContAdminManage } = require("../middleware/auth");

const router = express.Router();
const USER_META_FILE = path.join(__dirname, "..", "data", "user-metadata.json");

/* ================================
 * ✅ NOVO: Role mapping (front <-> prisma enum/string)
 * - Front manda: admin | user | ti | customer
 * - Prisma (se você usa enum): ADMIN | USER | TI | CUSTOMER
 * - Se seu schema ainda for String, isso não quebra (só padroniza)
 * ================================ */
function mapRoleIn(role) {
  const r = String(role || "").trim().toLowerCase();
  if (r === "admin") return "ADMIN";
  if (r === "ti") return "TI";
  if (r === "user") return "USER";
  return "CUSTOMER";
}

function mapRoleOut(role) {
  const r = String(role || "").trim().toUpperCase();
  if (r === "ADMIN") return "admin";
  if (r === "TI") return "ti";
  if (r === "USER") return "user";
  return "customer";
}

/* ================================
 * Helpers
 * ================================ */
function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function normalizeAccessProfile(value, fallbackRole = "customer") {
  const normalized = cleanText(value).toLowerCase();
  if (["ti", "gerencial", "coordenacao", "operacional", "consulta"].includes(normalized)) {
    return normalized;
  }

  const role = mapRoleOut(fallbackRole);
  if (role === "ti") return "ti";
  if (role === "admin") return "gerencial";
  return "operacional";
}

function ensureUserMetaFile() {
  const dir = path.dirname(USER_META_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(USER_META_FILE)) fs.writeFileSync(USER_META_FILE, "{}", "utf8");
}

function readUserMetaStore() {
  try {
    ensureUserMetaFile();
    const raw = fs.readFileSync(USER_META_FILE, "utf8");
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    console.warn("⚠️ Falha ao ler metadata de usuários:", err?.message || err);
    return {};
  }
}

function writeUserMetaStore(store) {
  ensureUserMetaFile();
  fs.writeFileSync(USER_META_FILE, JSON.stringify(store, null, 2), "utf8");
}

function getUserMetaKeys(user) {
  const keys = [user?.id, user?.email]
    .map((value) => cleanText(value).toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(keys));
}

function getLegacyUserMeta(user) {
  const store = readUserMetaStore();
  for (const key of getUserMetaKeys(user)) {
    if (store[key] && typeof store[key] === "object") {
      return store[key];
    }
  }
  return {};
}

function deleteUserMeta(user) {
  const store = readUserMetaStore();
  getUserMetaKeys(user).forEach((key) => {
    delete store[key];
  });
  writeUserMetaStore(store);
}

function getNormalizedMetaInput(user, metaInput = {}) {
  return {
    coordenador: cleanText(metaInput.coordenador),
    equipe: cleanText(metaInput.equipe),
    accessProfile: normalizeAccessProfile(
      metaInput.accessProfile ?? metaInput.access_profile,
      user?.role
    ),
  };
}

function getPersistedUserMeta(user) {
  const legacyMeta = getLegacyUserMeta(user);
  const coordenador = cleanText(user?.coordenador ?? legacyMeta.coordenador);
  const equipe = cleanText(user?.equipe ?? legacyMeta.equipe);
  const accessProfile = normalizeAccessProfile(
    user?.accessProfile ?? user?.access_profile ?? legacyMeta.accessProfile,
    user?.role
  );

  return { coordenador, equipe, accessProfile };
}

async function persistUserMeta(user, metaInput = {}) {
  const next = getNormalizedMetaInput(user, metaInput);

  await db.user.update({
    where: { id: Number(user.id) },
    data: {
      coordenador: next.coordenador || null,
      equipe: next.equipe || null,
      accessProfile: next.accessProfile,
    },
  });

  deleteUserMeta(user);
  return next;
}

function pickUserSafe(u) {
  const meta = getPersistedUserMeta(u);
  return {
    id: u.id,
    name: u.name ?? "",
    email: u.email ?? "",
    // ✅ ALTERADO: garante que o front sempre receba admin/user/ti/customer
    role: mapRoleOut(u.role ?? "CUSTOMER"),
    active: typeof u.active === "boolean" ? u.active : true,
    cargo: u.cargo ?? null,
    coordenador: cleanText(meta.coordenador),
    equipe: cleanText(meta.equipe),
    accessProfile: normalizeAccessProfile(meta.accessProfile, u.role ?? "CUSTOMER"),
    createdAt: u.createdAt ?? null,
    updatedAt: u.updatedAt ?? null,
  };
}

// ✅ já tinha: captura ator via headers opcionais
function getActorFromReq(req) {
  const idRaw = req.headers["x-user-id"];
  const emailRaw = req.headers["x-user-email"];

  const id = idRaw != null && String(idRaw).trim() !== "" ? Number(idRaw) : null;
  const email =
    emailRaw != null && String(emailRaw).trim() !== "" ? String(emailRaw).trim() : null;

  if (!id && !email) return null;
  return { id: Number.isFinite(id) ? id : null, email };
}

/* ================================
 * ✅ NOVO: enrich de auditoria (IP/UA/requestId)
 * ================================ */
function getAuditMeta(req) {
  const ip =
    (req.headers["x-forwarded-for"] && String(req.headers["x-forwarded-for"]).split(",")[0].trim()) ||
    req.socket?.remoteAddress ||
    null;

  const userAgent = req.headers["user-agent"] ? String(req.headers["user-agent"]) : null;
  const requestId = req.headers["x-request-id"] ? String(req.headers["x-request-id"]) : null;

  return { ip, userAgent, requestId };
}

// ✅ já tinha: log não-bloqueante
async function writeUserLog({ userId, action, message = null, meta = null, actor = null }) {
  try {
    await db.userLog.create({
      data: {
        userId: Number(userId),
        action: String(action), // se action for enum no prisma, continue mandando "USER_CREATED" etc.
        message: message != null ? String(message) : null,
        meta: meta ?? null,
        actorId: actor?.id != null ? Number(actor.id) : null,
        actorEmail: actor?.email != null ? String(actor.email) : null,
      },
    });
  } catch (e) {
    console.warn("⚠️ UserLog indisponível (não bloqueante):", e?.message || e);
  }
}

async function backfillLegacyUserMetadata() {
  const store = readUserMetaStore();
  const entries = Object.entries(store).filter(([, value]) => value && typeof value === "object");
  if (!entries.length) return;

  const processedIds = new Set();

  for (const [key, value] of entries) {
    const rawKey = cleanText(key);
    if (!rawKey) continue;

    const maybeId = Number(rawKey);
    const user = Number.isFinite(maybeId)
      ? await db.user.findUnique({ where: { id: maybeId } })
      : await db.user.findUnique({ where: { email: normalizeEmail(rawKey) } });

    if (!user || processedIds.has(user.id)) continue;
    processedIds.add(user.id);

    await db.user.update({
      where: { id: user.id },
      data: {
        coordenador: cleanText(value.coordenador) || null,
        equipe: cleanText(value.equipe) || null,
        accessProfile: normalizeAccessProfile(value.accessProfile, user.role),
      },
    });
  }
}

/* ================================
 * GET /api/admin/users
 * ================================ */
router.get("/", requireContAdminAccess, async (req, res) => {
  try {
    await backfillLegacyUserMetadata();
    const rows = await db.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        cargo: true,
        coordenador: true,
        equipe: true,
        accessProfile: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { id: "desc" },
    });

    return res.json({ users: rows.map(pickUserSafe) });
  } catch (err) {
    console.error("Erro ao listar usuários:", err);
    return res.status(500).json({ error: "Erro ao listar usuários." });
  }
});

/* ================================
 * ✅ GET /api/admin/users/:id/logs?limit=50
 * ================================ */
router.get("/:id/logs", requireContAdminAccess, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const limit = Math.min(Number(req.query.limit || 50), 200);

    if (!Number.isFinite(id)) return res.status(400).json({ error: "ID inválido." });

    const logs = await db.userLog.findMany({
      where: { userId: id },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        userId: true,
        action: true,
        message: true,
        meta: true,
        actorId: true,
        actorEmail: true,
        createdAt: true,
      },
    });

    return res.json({ logs });
  } catch (err) {
    const msg = String(err?.message || err);
    console.error("Erro ao buscar logs:", msg);
    return res.status(404).json({
      error: "Logs indisponíveis (tabela/endpoint não configurado).",
      detail: msg,
    });
  }
});

/* ================================
 * POST /api/admin/users
 * ================================ */
router.post("/", requireContAdminManage, async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "").trim();

    // ✅ ALTERADO: role entra normalizado (enum-friendly)
    const role = mapRoleIn(req.body?.role || "customer");

    const active = typeof req.body?.active === "boolean" ? req.body.active : true;
    const cargo = req.body?.cargo != null ? String(req.body.cargo).trim() : null;

    if (!name || !email || !password) {
      return res.status(400).json({ error: "name, email e password são obrigatórios." });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Senha mínimo 6 caracteres." });
    }

    const exists = await db.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (exists) return res.status(409).json({ error: "Email já cadastrado." });

    const hash = await bcrypt.hash(password, 10);

    const created = await db.user.create({
      data: {
        name,
        email,
        password: hash,
        role,
        active,
        cargo,
        coordenador: cleanText(req.body?.coordenador) || null,
        equipe: cleanText(req.body?.equipe) || null,
        accessProfile: normalizeAccessProfile(
          req.body?.accessProfile ?? req.body?.access_profile,
          role
        ),
      },
    });
    const meta = getPersistedUserMeta(created);

    // ✅ ALTERADO: log com meta enriquecido
    await writeUserLog({
      userId: created.id,
      action: "USER_CREATED",
      message: `Usuário criado: ${created.email}`,
      meta: {
        ...getAuditMeta(req), // ✅ NOVO
        role: created.role,
        active: created.active,
        cargo: created.cargo,
        coordenador: meta.coordenador,
        equipe: meta.equipe,
        accessProfile: meta.accessProfile,
      },
      actor: getActorFromReq(req),
    });

    return res.status(201).json({ user: pickUserSafe(created) });
  } catch (err) {
    console.error("Erro ao criar usuário:", err);
    return res.status(500).json({ error: "Erro ao criar usuário." });
  }
});

/* ================================
 * PUT /api/admin/users/:id
 * ================================ */
router.put("/:id", requireContAdminManage, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "ID inválido." });

    const current = await db.user.findUnique({ where: { id } });
    if (!current) return res.status(404).json({ error: "Usuário não encontrado." });

    const data = {};

    if (req.body?.name != null) data.name = String(req.body.name).trim();
    if (req.body?.email != null) data.email = normalizeEmail(req.body.email);

    // ✅ ALTERADO: role normalizado para enum
    if (req.body?.role != null) data.role = mapRoleIn(req.body.role);

    if (typeof req.body?.active === "boolean") data.active = req.body.active;

    if (req.body?.cargo != null) data.cargo = String(req.body.cargo).trim();
    if (req.body?.coordenador != null) data.coordenador = cleanText(req.body.coordenador) || null;
    if (req.body?.equipe != null) data.equipe = cleanText(req.body.equipe) || null;
    if (req.body?.accessProfile != null || req.body?.access_profile != null) {
      data.accessProfile = normalizeAccessProfile(
        req.body?.accessProfile ?? req.body?.access_profile,
        req.body?.role ?? current.role
      );
    }

    // Se vier vazio, não atualiza com string vazia sem querer
    if (data.name === "") delete data.name;
    if (data.email === "") delete data.email;
    if (data.cargo === "") data.cargo = null;

    const updated = await db.user.update({ where: { id }, data });
    deleteUserMeta(updated);
    const meta = getPersistedUserMeta(updated);

    // ✅ ALTERADO: log com meta enriquecido
    await writeUserLog({
      userId: updated.id,
      action: "USER_UPDATED",
      message: `Usuário atualizado: ${updated.email}`,
      meta: {
        ...getAuditMeta(req), // ✅ NOVO
        fields: Object.keys(data),
        coordenador: meta.coordenador,
        equipe: meta.equipe,
        accessProfile: meta.accessProfile,
      },
      actor: getActorFromReq(req),
    });

    return res.json({ user: pickUserSafe(updated) });
  } catch (err) {
    console.error("Erro ao atualizar usuário:", err);
    return res.status(500).json({ error: "Erro ao atualizar usuário." });
  }
});

/* ================================
 * PUT /api/admin/users/:id/password
 * ================================ */
router.put("/:id/password", requireContAdminManage, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const password = String(req.body?.password || "").trim();

    if (!Number.isFinite(id)) return res.status(400).json({ error: "ID inválido." });
    if (!password || password.length < 6) {
      return res.status(400).json({ error: "Senha mínimo 6 caracteres." });
    }

    const hash = await bcrypt.hash(password, 10);

    await db.user.update({
      where: { id },
      data: { password: hash },
    });

    // ✅ ALTERADO: log com meta enriquecido
    await writeUserLog({
      userId: id,
      action: "PASSWORD_CHANGED",
      message: "Senha alterada",
      meta: {
        ...getAuditMeta(req), // ✅ NOVO
      },
      actor: getActorFromReq(req),
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error("Erro ao trocar senha:", err);
    return res.status(500).json({ error: "Erro ao trocar senha." });
  }
});

/* ================================
 * PATCH /api/admin/users/:id/toggle
 * ================================ */
router.patch("/:id/toggle", requireContAdminManage, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "ID inválido." });

    const current = await db.user.findUnique({ where: { id } });
    if (!current) return res.status(404).json({ error: "Usuário não encontrado." });

    const updated = await db.user.update({
      where: { id },
      data: { active: !current.active },
    });

    // ✅ ALTERADO: log com meta enriquecido
    await writeUserLog({
      userId: updated.id,
      action: "USER_TOGGLED",
      message: `Status alterado: ${updated.email}`,
      meta: {
        ...getAuditMeta(req), // ✅ NOVO
        active: updated.active,
      },
      actor: getActorFromReq(req),
    });

    return res.json({ user: pickUserSafe(updated) });
  } catch (err) {
    console.error("Erro ao alternar status:", err);
    return res.status(500).json({ error: "Erro ao alternar status." });
  }
});

/* ================================
 * DELETE /api/admin/users/:id
 * ================================ */
router.delete("/:id", requireContAdminManage, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "ID inválido." });

    const u = await db.user.findUnique({
      where: { id },
      select: { id: true, email: true },
    });

    await writeUserLog({
      userId: id,
      action: "USER_DELETED",
      message: `Usuário excluído: ${u?.email || id}`,
      meta: {
        ...getAuditMeta(req), // ✅ NOVO
      },
      actor: getActorFromReq(req),
    });

    await db.user.delete({ where: { id } });
    deleteUserMeta(u);
    return res.json({ ok: true });
  } catch (err) {
    console.error("Erro ao excluir usuário:", err);
    return res.status(500).json({ error: "Erro ao excluir usuário." });
  }
});

module.exports = router;
