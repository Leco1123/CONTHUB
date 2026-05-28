// server/routes/dashboard.routes.js
const express = require("express");
const router = express.Router();
const db = require("../db");
const clickupTickets = require("../services/clickup.service");
const NEXT_ACTIONS_COUNT = 6;

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
    ? arr.slice(0, NEXT_ACTIONS_COUNT).map((x) => String(x ?? "").slice(0, 220))
    : Array.from({ length: NEXT_ACTIONS_COUNT }, () => "");

  while (out.length < NEXT_ACTIONS_COUNT) out.push("");
  return out;
}

function normalizeChecks(arr) {
  const out = Array.isArray(arr)
    ? arr.slice(0, NEXT_ACTIONS_COUNT).map((x) => Boolean(x))
    : Array.from({ length: NEXT_ACTIONS_COUNT }, () => false);

  while (out.length < NEXT_ACTIONS_COUNT) out.push(false);
  return out;
}

function normalizeAccessProfile(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["ti", "gerencial", "coordenacao", "operacional", "consulta", "comercial"].includes(normalized)
    ? normalized
    : "operacional";
}

function legacyRoleToAccessProfile(role) {
  const normalized = String(role || "").trim().toLowerCase();
  if (normalized === "ti") return "ti";
  if (normalized === "admin") return "gerencial";
  return "operacional";
}

function getAccessProfileFromSession(req) {
  const user = req?.session?.user || {};
  return normalizeAccessProfile(
    user.accessProfile ||
    user.access_profile ||
    legacyRoleToAccessProfile(user.role)
  );
}

function canManageTickets(req) {
  const role = String(req?.session?.user?.role || "").trim().toLowerCase();
  const profile = getAccessProfileFromSession(req);
  return role === "ti" || role === "admin" || profile === "ti";
}

function getRequesterName(req) {
  return String(
    req?.session?.user?.nome ||
    req?.session?.user?.name ||
    "Usuário"
  ).trim();
}

function getRequesterEmail(req) {
  return String(req?.session?.user?.email || "").trim();
}

function normalizeIdentity(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeIdentityToken(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildIdentityAliases(...values) {
  const aliases = new Set();

  values.forEach((value) => {
    const raw = String(value || "").trim();
    if (!raw) return;

    const normalized = normalizeIdentity(raw);
    if (normalized) aliases.add(normalized);

    const tokenized = normalizeIdentityToken(raw);
    if (tokenized) aliases.add(tokenized);

    if (normalized.includes("@")) {
      const [localPart] = normalized.split("@");
      if (localPart) {
        aliases.add(localPart);
        const collapsed = localPart.replace(/[._-]+/g, " ").trim();
        if (collapsed) aliases.add(collapsed);
      }
    }

    tokenized
      .split(" ")
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((part) => aliases.add(part));
  });

  return Array.from(aliases).filter(Boolean);
}

function hasSharedIdentity(leftAliases, rightAliases) {
  const right = new Set((Array.isArray(rightAliases) ? rightAliases : []).filter(Boolean));
  return (Array.isArray(leftAliases) ? leftAliases : []).some((alias) => right.has(alias));
}

function isNextActionForSessionUser(req, item) {
  const currentUser = req?.currentUser || req?.session?.user || {};
  const sessionAliases = buildIdentityAliases(
    currentUser.email || "",
    currentUser.nome || currentUser.name || ""
  );
  const assigneeAliases = buildIdentityAliases(
    ...(Array.isArray(item?.assigneeEmails) ? item.assigneeEmails : []),
    ...(Array.isArray(item?.assigneeNames) ? item.assigneeNames : []),
    item?.assigneeName || ""
  );

  return sessionAliases.length > 0 && hasSharedIdentity(sessionAliases, assigneeAliases);
}

function decorateNextActionForSessionUser(req, item) {
  const currentUser = req?.currentUser || req?.session?.user || {};
  const assigneeEmails = Array.isArray(item?.assigneeEmails) ? item.assigneeEmails.filter(Boolean) : [];
  const assigneeNames = Array.isArray(item?.assigneeNames) ? item.assigneeNames.filter(Boolean) : [];
  const responsibleCount = Math.max(assigneeEmails.length, assigneeNames.length, 1);
  const sessionAliases = buildIdentityAliases(
    currentUser.email || "",
    currentUser.nome || currentUser.name || ""
  );
  const assigneeAliases = buildIdentityAliases(
    ...assigneeEmails,
    ...assigneeNames,
    item?.assigneeName || ""
  );

  return {
    ...item,
    assignedToSessionUser: true,
    responsibleCount,
    assigneeDisplay:
      assigneeNames.join(" • ") ||
      assigneeEmails.join(" • ") ||
      "Responsável não identificado",
    debugMatch: {
      sessionAliases,
      assigneeAliases,
    },
  };
}

function isClickupNotConfigured(err) {
  return err?.code === "CLICKUP_NOT_CONFIGURED";
}

function buildFallbackTicket({
  funcao = "Contábil",
  descricao = "",
  urgencia = "media",
  solicitanteNome = "",
  solicitanteEmail = "",
  imagem = "",
} = {}) {
  const now = new Date().toISOString();
  const normalizedPriority = ["baixa", "media", "alta", "critica"].includes(String(urgencia || "").trim().toLowerCase())
    ? String(urgencia || "").trim().toLowerCase()
    : "media";

  return {
    id: `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    funcao: String(funcao || "").trim() || "Contábil",
    descricao: String(descricao || "").trim(),
    urgencia: normalizedPriority,
    status: "aberto",
    solicitanteNome: String(solicitanteNome || "").trim(),
    solicitanteEmail: String(solicitanteEmail || "").trim(),
    assigneeName: "",
    imagem: String(imagem || "").trim(),
    dueAt: "",
    createdAt: now,
    updatedAt: now,
    provider: "local",
    degraded: true,
  };
}

// ===================================================
// NEXT ACTIONS
// GET/PUT no formato do front: { manual: [6], checks: [6] }
// ===================================================

/**
 * GET /api/dashboard/next-actions
 * Retorna { manual: string[6], checks: boolean[6] }
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

    const manual = Array.from({ length: NEXT_ACTIONS_COUNT }, () => "");
    const checks = Array.from({ length: NEXT_ACTIONS_COUNT }, () => false);

    for (const r of rows) {
      const p = Number(r.position);
      if (p >= 0 && p < NEXT_ACTIONS_COUNT) {
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
 * Body: { manual: string[6], checks: boolean[6] }
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
    for (let position = 0; position < NEXT_ACTIONS_COUNT; position++) {
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
// TICKETS / CHAMADOS
// ===================================================

router.get("/tickets", async (req, res) => {
  try {
    if (!clickupTickets.isClickUpNextActionsEnabled()) {
      return res.json({
        provider: "clickup",
        configured: false,
        degraded: true,
        error: "Integração ClickUp não configurada.",
        code: "CLICKUP_NOT_CONFIGURED",
        savedAt: new Date().toISOString(),
        data: [],
      });
    }

    const items = await clickupTickets.listAllTasks();
    return res.json({
      provider: "clickup",
      configured: true,
      savedAt: new Date().toISOString(),
      data: Array.isArray(items) ? items : [],
    });
  } catch (err) {
    if (isClickupNotConfigured(err)) {
      return res.json({
        provider: "clickup",
        configured: false,
        degraded: true,
        error: "Integração ClickUp não configurada.",
        code: "CLICKUP_NOT_CONFIGURED",
        savedAt: new Date().toISOString(),
        data: [],
      });
    }

    console.error("Erro ao listar chamados no ClickUp:", err);
    return res.json({
      provider: "clickup",
      configured: false,
      degraded: true,
      error: "Falha ao sincronizar chamados com o ClickUp.",
      code: "CLICKUP_SYNC_FAILED",
      savedAt: new Date().toISOString(),
      data: [],
    });
  }
});

router.get("/clickup-next-actions", async (req, res) => {
  try {
    res.set({
      "Cache-Control": "private, no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
      Vary: "Cookie",
    });

    if (!clickupTickets.isClickUpNextActionsEnabled()) {
      return res.json({
        provider: "clickup",
        configured: false,
        degraded: true,
        error: "Integração ClickUp não configurada.",
        code: "CLICKUP_NOT_CONFIGURED",
        savedAt: new Date().toISOString(),
        data: [],
        debug: null,
      });
    }

    const rawItems = await clickupTickets.listNextActionsTasks();
    const items = Array.isArray(rawItems) ? rawItems : [];
    const decoratedItems = items.map((item) => {
      const assignedToSessionUser = isNextActionForSessionUser(req, item);
      return {
        ...decorateNextActionForSessionUser(req, item),
        assignedToSessionUser,
      };
    });
    const matchedCount = decoratedItems.filter((item) => item.assignedToSessionUser).length;
    const currentUser = req?.currentUser || req?.session?.user || {};
    return res.json({
      provider: "clickup",
      configured: true,
      savedAt: new Date().toISOString(),
      data: decoratedItems,
      debug: {
        sessionEmail: String(currentUser.email || "").trim().toLowerCase(),
        sessionName: String(currentUser.nome || currentUser.name || "").trim(),
        sessionAliases: buildIdentityAliases(
          currentUser.email || "",
          currentUser.nome || currentUser.name || ""
        ),
        fetchedCount: items.length,
        matchedCount,
        assigneeEmails: Array.from(
          new Set(
            items
              .flatMap((item) => (Array.isArray(item?.assigneeEmails) ? item.assigneeEmails : []))
              .map((entry) => String(entry || "").trim().toLowerCase())
              .filter(Boolean)
          )
        ),
        assigneeNames: Array.from(
          new Set(
            items
              .flatMap((item) => (Array.isArray(item?.assigneeNames) ? item.assigneeNames : []))
              .map((entry) => String(entry || "").trim())
              .filter(Boolean)
          )
        ),
      },
    });
  } catch (err) {
    if (isClickupNotConfigured(err)) {
      return res.json({
        provider: "clickup",
        configured: false,
        degraded: true,
        error: "Integração ClickUp não configurada.",
        code: "CLICKUP_NOT_CONFIGURED",
        savedAt: new Date().toISOString(),
        data: [],
        debug: null,
      });
    }

    console.error("Erro ao listar próximas ações no ClickUp:", err);
    return res.json({
      provider: "clickup",
      configured: false,
      degraded: true,
      error: "Falha ao sincronizar próximas ações com o ClickUp.",
      code: "CLICKUP_NEXT_ACTIONS_SYNC_FAILED",
      detail: String(err?.payload?.err || err?.message || "").trim(),
      savedAt: new Date().toISOString(),
      data: [],
      debug: null,
    });
  }
});

router.post("/tickets", async (req, res) => {
  const funcao = String(req.body?.funcao || "").trim();
  const descricao = String(req.body?.descricao || "").trim().slice(0, 1000);
  const urgencia = String(req.body?.urgencia || "media").trim().toLowerCase();
  const imagem = String(req.body?.imagem || "").trim();
  const fallbackTicket = buildFallbackTicket({
    funcao,
    descricao,
    urgencia,
    imagem,
    solicitanteNome: getRequesterName(req),
    solicitanteEmail: getRequesterEmail(req),
  });

  try {
    if (!clickupTickets.isClickUpTicketsEnabled()) {
      return res.status(201).json({
        provider: "local",
        configured: false,
        degraded: true,
        code: "CLICKUP_NOT_CONFIGURED",
        warning: "Integração ClickUp não configurada. Chamado salvo no fallback local.",
        ticket: fallbackTicket,
      });
    }

    if (!descricao) {
      return res.status(400).json({ error: "Descrição do chamado é obrigatória." });
    }

    const created = await clickupTickets.createTicket({
      funcao,
      descricao,
      urgencia,
      imagem,
      solicitanteNome: getRequesterName(req),
      solicitanteEmail: getRequesterEmail(req),
    });

    return res.status(201).json({
      provider: "clickup",
      ticket: created,
    });
  } catch (err) {
    if (isClickupNotConfigured(err)) {
      return res.status(201).json({
        provider: "local",
        configured: false,
        degraded: true,
        code: "CLICKUP_NOT_CONFIGURED",
        warning: "Integração ClickUp não configurada. Chamado salvo no fallback local.",
        ticket: fallbackTicket,
      });
    }

    console.error("Erro ao criar chamado no ClickUp:", err);
    return res.status(201).json({
      provider: "local",
      configured: false,
      degraded: true,
      code: "CLICKUP_CREATE_FAILED",
      warning: "Falha ao criar chamado no ClickUp. Chamado salvo no fallback local.",
      ticket: fallbackTicket,
    });
  }
});

router.patch("/tickets/:id/status", async (req, res) => {
  try {
    if (!canManageTickets(req)) {
      return res.status(403).json({ error: "Apenas TI pode alterar status dos chamados." });
    }

    if (!clickupTickets.isClickUpTicketsEnabled()) {
      return res.status(503).json({
        error: "Integração ClickUp não configurada.",
        code: "CLICKUP_NOT_CONFIGURED",
      });
    }

    const ticketId = String(req.params?.id || "").trim();
    const status = String(req.body?.status || "").trim().toLowerCase();
    if (!ticketId || !status) {
      return res.status(400).json({ error: "Chamado e status são obrigatórios." });
    }

    await clickupTickets.updateTicketStatus(ticketId, status);
    return res.json({ success: true });
  } catch (err) {
    if (isClickupNotConfigured(err)) {
      return res.status(503).json({
        error: "Integração ClickUp não configurada.",
        code: "CLICKUP_NOT_CONFIGURED",
      });
    }

    console.error("Erro ao atualizar status do chamado no ClickUp:", err);
    return res.status(502).json({
      error: "Falha ao atualizar status do chamado no ClickUp.",
      code: "CLICKUP_UPDATE_FAILED",
    });
  }
});

router.delete("/tickets/:id", async (req, res) => {
  try {
    if (!canManageTickets(req)) {
      return res.status(403).json({ error: "Apenas TI pode excluir chamados." });
    }

    if (!clickupTickets.isClickUpTicketsEnabled()) {
      return res.status(503).json({
        error: "Integração ClickUp não configurada.",
        code: "CLICKUP_NOT_CONFIGURED",
      });
    }

    const ticketId = String(req.params?.id || "").trim();
    if (!ticketId) {
      return res.status(400).json({ error: "Chamado inválido." });
    }

    await clickupTickets.deleteTicket(ticketId);
    return res.json({ success: true });
  } catch (err) {
    if (isClickupNotConfigured(err)) {
      return res.status(503).json({
        error: "Integração ClickUp não configurada.",
        code: "CLICKUP_NOT_CONFIGURED",
      });
    }

    console.error("Erro ao excluir chamado no ClickUp:", err);
    return res.status(502).json({
      error: "Falha ao excluir chamado no ClickUp.",
      code: "CLICKUP_DELETE_FAILED",
    });
  }
});

router.post("/tickets/clear-closed", async (req, res) => {
  try {
    if (!canManageTickets(req)) {
      return res.status(403).json({ error: "Apenas TI pode limpar chamados concluídos." });
    }

    if (!clickupTickets.isClickUpTicketsEnabled()) {
      return res.status(503).json({
        error: "Integração ClickUp não configurada.",
        code: "CLICKUP_NOT_CONFIGURED",
      });
    }

    const items = await clickupTickets.listAllTasks();
    const closed = Array.isArray(items)
      ? items.filter((ticket) => String(ticket?.status || "").trim().toLowerCase() === "concluido")
      : [];

    await Promise.all(
      closed.map((ticket) => clickupTickets.deleteTicket(String(ticket.id || "").trim()))
    );

    return res.json({
      success: true,
      deleted: closed.length,
    });
  } catch (err) {
    if (isClickupNotConfigured(err)) {
      return res.status(503).json({
        error: "Integração ClickUp não configurada.",
        code: "CLICKUP_NOT_CONFIGURED",
      });
    }

    console.error("Erro ao limpar chamados concluídos no ClickUp:", err);
    return res.status(502).json({
      error: "Falha ao limpar chamados concluídos no ClickUp.",
      code: "CLICKUP_CLEAR_FAILED",
    });
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
