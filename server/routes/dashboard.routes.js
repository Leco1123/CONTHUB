// server/routes/dashboard.routes.js
const express = require("express");
const router = express.Router();
const db = require("../db");

// ===================================================
// HELPERS
// ===================================================

/**
 * Como o app já usa requireAuth no mount:
 * app.use("/api/dashboard", requireAuth, dashboardRoutes)
 *
 * aqui basta extrair o id com segurança.
 * Aceita:
 * - number
 * - string numérica ("1")
 * - string id (uuid/cuid/etc), caso o schema use string
 */
function getUserId(req) {
  const rawId = req?.session?.user?.id;

  if (rawId === null || rawId === undefined) {
    return null;
  }

  if (typeof rawId === "number" && Number.isFinite(rawId)) {
    return rawId;
  }

  const asString = String(rawId).trim();
  if (!asString) return null;

  if (/^\d+$/.test(asString)) {
    return Number(asString);
  }

  return asString;
}

// helper: normaliza arrays fixos
function normalizeManual(arr) {
  const out = Array.isArray(arr)
    ? arr.slice(0, 4).map((x) => String(x ?? "").slice(0, 220))
    : ["", "", "", ""];

  while (out.length < 4) out.push("");
  return out;
}

function normalizeChecks(arr) {
  const out = Array.isArray(arr)
    ? arr.slice(0, 4).map((x) => Boolean(x))
    : [false, false, false, false];

  while (out.length < 4) out.push(false);
  return out;
}

// ===================================================
// NEXT ACTIONS
// GET/PUT no formato do front: { manual: [4], checks: [4] }
// ===================================================

/**
 * GET /api/dashboard/next-actions
 * Retorna { manual: string[4], checks: boolean[4] }
 */
router.get("/next-actions", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (userId === null) {
      return res.status(401).json({ error: "Não autenticado." });
    }

    const rows = await db.dashboardNextAction.findMany({
      where: { userId },
      orderBy: { position: "asc" },
    });

    const manual = ["", "", "", ""];
    const checks = [false, false, false, false];

    for (const r of rows) {
      const p = Number(r.position);
      if (p >= 0 && p <= 3) {
        manual[p] = String(r.text ?? "").slice(0, 220);
        checks[p] = Boolean(r.done);
      }
    }

    return res.json({ manual, checks });
  } catch (err) {
    console.error("Erro ao buscar next-actions:", err);
    return res.status(500).json({ error: "Erro interno." });
  }
});

/**
 * PUT /api/dashboard/next-actions
 * Body: { manual: string[4], checks: boolean[4] }
 */
router.put("/next-actions", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (userId === null) {
      return res.status(401).json({ error: "Não autenticado." });
    }

    const manual = normalizeManual(req.body?.manual);
    const checks = normalizeChecks(req.body?.checks);

    const ops = [];
    for (let position = 0; position < 4; position++) {
      ops.push(
        db.dashboardNextAction.upsert({
          where: { userId_position: { userId, position } },
          update: {
            text: manual[position],
            done: checks[position],
          },
          create: {
            userId,
            position,
            text: manual[position],
            done: checks[position],
          },
        })
      );
    }

    await db.$transaction(ops);

    return res.json({ manual, checks });
  } catch (err) {
    console.error("Erro ao salvar next-actions:", err);
    return res.status(500).json({ error: "Erro interno." });
  }
});

/**
 * POST /api/dashboard/next-actions/reset
 */
router.post("/next-actions/reset", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (userId === null) {
      return res.status(401).json({ error: "Não autenticado." });
    }

    await db.dashboardNextAction.deleteMany({
      where: { userId },
    });

    return res.json({ success: true });
  } catch (err) {
    console.error("Erro ao resetar ações:", err);
    return res.status(500).json({ error: "Erro interno." });
  }
});

// ===================================================
// CONTFLOW SNAPSHOT
// GET/PUT
// ===================================================

/**
 * GET /api/dashboard/contflow-snapshot
 * Retorna { ts, count, data } (ou null)
 */
router.get("/contflow-snapshot", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (userId === null) {
      return res.status(401).json({ error: "Não autenticado." });
    }

    const snap = await db.contflowDashboardSnapshot.findUnique({
      where: { userId },
    });

    if (!snap) {
      return res.json(null);
    }

    return res.json({
      ts: snap.ts ? snap.ts.toISOString() : null,
      count: snap.count ?? 0,
      data: Array.isArray(snap.data) ? snap.data : [],
    });
  } catch (err) {
    console.error("Erro ao buscar contflow-snapshot:", err);
    return res.status(500).json({ error: "Erro interno." });
  }
});

/**
 * PUT /api/dashboard/contflow-snapshot
 * Body: { ts, count, data }
 */
router.put("/contflow-snapshot", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (userId === null) {
      return res.status(401).json({ error: "Não autenticado." });
    }

    const ts = req.body?.ts ? new Date(req.body.ts) : new Date();
    const count = Number(req.body?.count ?? 0);
    const data = Array.isArray(req.body?.data) ? req.body.data : [];

    const saved = await db.contflowDashboardSnapshot.upsert({
      where: { userId },
      update: {
        ts,
        count: Number.isFinite(count) ? count : 0,
        data,
      },
      create: {
        userId,
        ts,
        count: Number.isFinite(count) ? count : 0,
        data,
      },
    });

    return res.json({
      ts: saved.ts ? saved.ts.toISOString() : null,
      count: saved.count ?? 0,
      data: Array.isArray(saved.data) ? saved.data : [],
    });
  } catch (err) {
    console.error("Erro ao salvar contflow-snapshot:", err);
    return res.status(500).json({ error: "Erro interno." });
  }
});

// ===================================================
// CONTFLOW FEED
// GET/POST
// ===================================================

/**
 * GET /api/dashboard/contflow-feed
 * Retorna itens no formato { ts, title, desc }
 */
router.get("/contflow-feed", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (userId === null) {
      return res.status(401).json({ error: "Não autenticado." });
    }

    const items = await db.contflowFeed.findMany({
      where: { createdById: userId },
      orderBy: { createdAt: "desc" },
      take: 12,
    });

    return res.json(
      items.map((x) => ({
        ts: x.createdAt ? x.createdAt.toISOString() : null,
        title: x.title ?? "Atualização",
        desc: x.description ?? "",
      }))
    );
  } catch (err) {
    console.error("Erro ao buscar contflow-feed:", err);
    return res.status(500).json({ error: "Erro interno." });
  }
});

/**
 * POST /api/dashboard/contflow-feed
 * Body: { ts?, title, desc?, sheetId? }
 */
router.post("/contflow-feed", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (userId === null) {
      return res.status(401).json({ error: "Não autenticado." });
    }

    const title = String(req.body?.title ?? "").trim();
    const desc = String(req.body?.desc ?? "").trim();
    const sheetIdRaw = req.body?.sheetId;

    if (!title) {
      return res.status(400).json({ error: "title obrigatório" });
    }

    const sheetId =
      sheetIdRaw === null || sheetIdRaw === undefined
        ? null
        : Number(sheetIdRaw);

    const created = await db.contflowFeed.create({
      data: {
        title: title.slice(0, 120),
        description: desc ? desc.slice(0, 400) : null,
        createdById: userId,
        sheetId: Number.isFinite(sheetId) ? sheetId : null,
      },
    });

    return res.json({
      ts: created.createdAt ? created.createdAt.toISOString() : null,
      title: created.title,
      desc: created.description ?? "",
    });
  } catch (err) {
    console.error("Erro ao criar contflow-feed:", err);
    return res.status(500).json({ error: "Erro interno." });
  }
});

module.exports = router;