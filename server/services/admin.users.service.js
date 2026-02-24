// server/services/admin.users.service.js
const sqliteDb = require("../db");
const { getPrisma } = require("../prisma");

// Feature flag: 0 = SQLite (padrão), 1 = Prisma/Postgres
const usePrisma = String(process.env.USE_PRISMA || "").trim() === "1";

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function toActiveInt(active) {
  // SQLite usa 0/1
  return Number(active) ? 1 : 0;
}

async function listUsers() {
  if (usePrisma) {
    const prisma = getPrisma();
    return prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        lastLogin: true,
      },
      orderBy: { id: "asc" },
    });
  }

  const rows = sqliteDb
    .prepare(`
      SELECT
        id,
        name,
        email,
        role,
        active,
        last_login AS lastLogin
      FROM users
      ORDER BY id ASC
    `)
    .all();

  return rows;
}

async function createUser({ name, email, passwordHash, role = "user", active = 1 }) {
  if (!name || !email || !passwordHash) {
    throw new Error("Campos obrigatórios: name, email, passwordHash.");
  }

  const normalizedEmail = normalizeEmail(email);

  if (usePrisma) {
    const prisma = getPrisma();
    const user = await prisma.user.create({
      data: {
        name: String(name).trim(),
        email: normalizedEmail,
        passwordHash: String(passwordHash),
        role: String(role || "user"),
        active: Boolean(active),
      },
      select: { id: true },
    });
    return user.id;
  }

  const stmt = sqliteDb.prepare(`
    INSERT INTO users (name, email, password_hash, role, active)
    VALUES (?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    String(name).trim(),
    normalizedEmail,
    String(passwordHash),
    String(role || "user"),
    toActiveInt(active)
  );

  return result.lastInsertRowid;
}

async function updateUser(id, { name, email, role, active }) {
  const userId = Number(id);
  if (!userId) throw new Error("ID inválido.");

  const nextName = String(name || "").trim();
  const nextEmail = normalizeEmail(email);
  const nextRole = String(role || "user");
  const nextActiveBool = Boolean(active);

  if (usePrisma) {
    const prisma = getPrisma();
    await prisma.user.update({
      where: { id: userId },
      data: {
        name: nextName,
        email: nextEmail,
        role: nextRole,
        active: nextActiveBool,
      },
    });
    return;
  }

  sqliteDb
    .prepare(`
      UPDATE users
      SET name = ?, email = ?, role = ?, active = ?
      WHERE id = ?
    `)
    .run(nextName, nextEmail, nextRole, toActiveInt(active), userId);
}

async function resetPassword(id, newPasswordHash) {
  const userId = Number(id);
  if (!userId) throw new Error("ID inválido.");
  if (!newPasswordHash) throw new Error("newPasswordHash é obrigatório.");

  if (usePrisma) {
    const prisma = getPrisma();
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: String(newPasswordHash) },
    });
    return;
  }

  sqliteDb
    .prepare(`
      UPDATE users
      SET password_hash = ?
      WHERE id = ?
    `)
    .run(String(newPasswordHash), userId);
}

module.exports = {
  usePrisma,
  listUsers,
  createUser,
  updateUser,
  resetPassword,
};
