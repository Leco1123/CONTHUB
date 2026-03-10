// server/routes/admin.modules.routes.js
const express = require("express");
const db = require("../db");
const { requireAuth, requireAdmin } = require("../middleware/auth");

const router = express.Router();

/**
 * Garante que o Prisma Client tem o model Module
 */
function ensureModuleModel(res) {
  if (!db?.module) {
    res.status(501).json({
      error:
        "Model 'Module' não existe no Prisma Client. Adicione o model Module no schema.prisma e rode migrate/generate.",
    });
    return false;
  }
  return true;
}

function normalizeStatus(status, active) {
  const s = String(status || "").trim().toLowerCase();

  if (active === false) return "offline";
  if (s === "offline" || s === "off") return "offline";
  if (s === "dev") return "dev";
  if (s === "admin") return "admin";
  return "online";
}

function normalizeAccess(access) {
  const a = String(access || "").trim();
  return a || "user+admin";
}

// ================================
// LISTAR módulos
// GET /api/admin/modules
// ✅ qualquer usuário autenticado pode consultar
// ================================
router.get("/", requireAuth, async (req, res) => {
  try {
    if (!ensureModuleModel(res)) return;

    const rows = await db.module.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        order: true,
        status: true,
        access: true,
        active: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { order: "asc" },
    });

    return res.json({ modules: rows });
  } catch (err) {
    console.error("Erro ao listar módulos:", err);
    return res.status(500).json({ error: "Erro ao listar módulos." });
  }
});

// ================================
// ATUALIZAR em lote
// PUT /api/admin/modules
// ✅ só admin/TI altera
// ✅ usa upsert para não quebrar se slug ainda não existir
// ================================
router.put("/", requireAdmin, async (req, res) => {
  try {
    if (!ensureModuleModel(res)) return;

    const { modules } = req.body || {};

    if (!Array.isArray(modules)) {
      return res.status(400).json({ error: "modules precisa ser um array." });
    }

    const cleaned = modules
      .map((m, idx) => {
        const slug = String(m?.slug || "").trim().toLowerCase();
        const name = String(m?.name || slug || `module_${idx + 1}`).trim();
        const order = Number(m?.order);
        const active = Boolean(m?.active);
        const status = normalizeStatus(m?.status, active);
        const access = normalizeAccess(m?.access);

        return {
          slug,
          name,
          order: Number.isFinite(order) ? order : idx + 1,
          status,
          access,
          active,
        };
      })
      .filter((m) => m.slug);

    if (!cleaned.length) {
      return res.status(400).json({ error: "Nenhum módulo válido para atualizar." });
    }

    await db.$transaction(
      cleaned.map((m) =>
        db.module.upsert({
          where: { slug: m.slug },
          update: {
            name: m.name,
            order: m.order,
            status: m.status,
            access: m.access,
            active: m.active,
          },
          create: {
            slug: m.slug,
            name: m.name,
            order: m.order,
            status: m.status,
            access: m.access,
            active: m.active,
          },
        })
      )
    );

    const rows = await db.module.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        order: true,
        status: true,
        access: true,
        active: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { order: "asc" },
    });

    return res.json({ ok: true, modules: rows });
  } catch (err) {
    console.error("Erro ao atualizar módulos:", err);
    return res.status(500).json({ error: "Erro ao atualizar módulos." });
  }
});

module.exports = router;