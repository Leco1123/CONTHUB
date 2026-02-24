// server/routes/admin.modules.routes.js
const express = require("express");
const db = require("../db"); // ✅ PrismaClient (server/db/index.js)
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();
router.use(requireAdmin);

/**
 * ✅ Helper: garante que o Prisma Client tem o model Module
 * (se você ainda não adicionou model Module no schema.prisma, db.module será undefined)
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

// ================================
// LISTAR módulos
// GET /api/admin/modules
// ================================
router.get("/", async (req, res) => {
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
// body: { modules: [...] }
// ================================
router.put("/", async (req, res) => {
  try {
    if (!ensureModuleModel(res)) return;

    const { modules } = req.body || {};
    if (!Array.isArray(modules)) {
      return res.status(400).json({ error: "modules precisa ser um array." });
    }

    // validação leve (evita update zoado)
    const cleaned = modules
      .map((m) => ({
        slug: String(m?.slug || "").trim(),
        name: String(m?.name || "").trim(),
        order: Number(m?.order),
        status: String(m?.status || "Base").trim(),
        access: String(m?.access || "user+admin").trim(),
        active: Boolean(m?.active),
      }))
      .filter((m) => m.slug);

    if (!cleaned.length) {
      return res.status(400).json({ error: "Nenhum módulo válido para atualizar." });
    }

    await db.$transaction(
      cleaned.map((m) =>
        db.module.update({
          where: { slug: m.slug },
          data: {
            name: m.name,
            order: Number.isFinite(m.order) ? m.order : 1,
            status: m.status,
            access: m.access,
            active: m.active,
          },
        })
      )
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error("Erro ao atualizar módulos:", err);

    // Se slug não existir, Prisma costuma estourar P2025 (record not found)
    return res.status(500).json({ error: "Erro ao atualizar módulos." });
  }
});

module.exports = router;
