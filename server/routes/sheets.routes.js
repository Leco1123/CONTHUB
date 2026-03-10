// server/routes/sheets.routes.js
const express = require("express");
const router = express.Router();
const db = require("../db");

function normalizeSheetPayload(sheet, columns, rows, cells) {
  return {
    sheet: {
      id: sheet.id,
      key: sheet.key,
      name: sheet.name,
      version: sheet.version,
      active: sheet.active,
      createdAt: sheet.createdAt,
      updatedAt: sheet.updatedAt,
    },
    columns: columns.map((c) => ({
      id: c.id,
      key: c.key,
      label: c.label,
      order: c.order,
      width: c.width,
      active: c.active,
    })),
    rows: rows.map((r) => ({
      id: r.id,
      clientRowId: r.clientRowId,
      order: r.order,
      active: r.active,
    })),
    cells: cells.map((c) => ({
      id: c.id,
      rowId: c.rowId,
      colKey: c.colKey,
      value: c.value ?? "",
      type: c.type ?? "text",
      updatedAt: c.updatedAt,
    })),
  };
}

function normalizeColumnInput(col, index) {
  return {
    key: String(col?.key || "").trim(),
    label: String(col?.label || "").trim(),
    order: Number.isFinite(Number(col?.order)) ? Number(col.order) : index,
    width: Number.isFinite(Number(col?.width)) ? Number(col.width) : 140,
  };
}

/**
 * POST /api/sheets
 * Cria uma sheet nova
 * body: { key, name, columns? }
 */
router.post("/", async (req, res) => {
  try {
    const key = String(req.body?.key || "").trim();
    const name = String(req.body?.name || "").trim();
    const rawColumns = Array.isArray(req.body?.columns) ? req.body.columns : [];

    const createdById = Number(req.session?.user?.id || 0) || null;

    if (!key) {
      return res.status(400).json({ error: "key obrigatória." });
    }

    if (!name) {
      return res.status(400).json({ error: "name obrigatório." });
    }

    const exists = await db.sheet.findFirst({
      where: {
        key,
        deletedAt: null,
      },
    });

    if (exists) {
      return res.status(409).json({ error: "Já existe uma sheet com essa key." });
    }

    const columns = rawColumns
      .map((col, index) => normalizeColumnInput(col, index))
      .filter((col) => col.key && col.label);

    const created = await db.$transaction(async (tx) => {
      const sheet = await tx.sheet.create({
        data: {
          key,
          name,
          version: 1,
          active: true,
          createdById,
        },
      });

      if (columns.length > 0) {
        await tx.sheetColumn.createMany({
          data: columns.map((col) => ({
            sheetId: sheet.id,
            key: col.key,
            label: col.label,
            order: col.order,
            width: col.width,
            active: true,
          })),
        });
      }

      return sheet;
    });

    return res.status(201).json({
      ok: true,
      sheetId: created.id,
      key: created.key,
      name: created.name,
    });
  } catch (err) {
    console.error("Erro ao criar sheet:", err);
    return res.status(500).json({ error: "Erro interno ao criar sheet." });
  }
});

/**
 * GET /api/sheets/:key
 * Ex.: /api/sheets/contflow
 */
router.get("/:key", async (req, res) => {
  try {
    const key = String(req.params.key || "").trim();
    if (!key) {
      return res.status(400).json({ error: "Sheet key obrigatória." });
    }

    const sheet = await db.sheet.findFirst({
      where: {
        key,
        deletedAt: null,
      },
    });

    if (!sheet) {
      return res.status(404).json({ error: "Sheet não encontrada." });
    }

    const [columns, rows, cells] = await Promise.all([
      db.sheetColumn.findMany({
        where: {
          sheetId: sheet.id,
          deletedAt: null,
          active: true,
        },
        orderBy: { order: "asc" },
      }),
      db.sheetRow.findMany({
        where: {
          sheetId: sheet.id,
          deletedAt: null,
          active: true,
        },
        orderBy: { order: "asc" },
      }),
      db.sheetCell.findMany({
        where: {
          sheetId: sheet.id,
          deletedAt: null,
        },
      }),
    ]);

    return res.json(normalizeSheetPayload(sheet, columns, rows, cells));
  } catch (err) {
    console.error("Erro ao buscar sheet:", err);
    return res.status(500).json({ error: "Erro interno ao buscar sheet." });
  }
});

/**
 * POST /api/sheets/:key/import-local
 * Importa linhas vindas do localStorage
 * body: { rows: [...] }
 */
router.post("/:key/import-local", async (req, res) => {
  try {
    const key = String(req.params.key || "").trim();
    const incomingRows = Array.isArray(req.body?.rows) ? req.body.rows : [];

    if (!key) {
      return res.status(400).json({ error: "Sheet key obrigatória." });
    }

    const sheet = await db.sheet.findFirst({
      where: {
        key,
        deletedAt: null,
      },
    });

    if (!sheet) {
      return res.status(404).json({ error: "Sheet não encontrada." });
    }

    if (!incomingRows.length) {
      return res.status(400).json({ error: "Nenhuma linha enviada para importação." });
    }

    const columns = await db.sheetColumn.findMany({
      where: {
        sheetId: sheet.id,
        deletedAt: null,
        active: true,
      },
      orderBy: { order: "asc" },
    });

    const validColKeys = new Set(columns.map((c) => c.key));

    const result = await db.$transaction(async (tx) => {
      await tx.sheetCell.deleteMany({
        where: { sheetId: sheet.id },
      });

      await tx.sheetRow.deleteMany({
        where: { sheetId: sheet.id },
      });

      let rowsCreated = 0;
      let cellsCreated = 0;

      for (let i = 0; i < incomingRows.length; i++) {
        const rawRow =
          incomingRows[i] && typeof incomingRows[i] === "object"
            ? incomingRows[i]
            : {};

        const clientRowId =
          String(rawRow.__id || "").trim() ||
          `row_${Date.now()}_${i}`;

        const row = await tx.sheetRow.create({
          data: {
            sheetId: sheet.id,
            clientRowId,
            order: i,
            active: true,
          },
        });

        rowsCreated += 1;

        const cellData = [];

        for (const [colKey, value] of Object.entries(rawRow)) {
          if (colKey === "__id") continue;
          if (!validColKeys.has(colKey)) continue;

          cellData.push({
            sheetId: sheet.id,
            rowId: row.id,
            colKey,
            value: value == null ? "" : String(value),
            type: "text",
          });
        }

        if (cellData.length > 0) {
          await tx.sheetCell.createMany({
            data: cellData,
          });
          cellsCreated += cellData.length;
        }
      }

      return { rowsCreated, cellsCreated };
    });

    return res.json({
      ok: true,
      importedRows: result.rowsCreated,
      importedCells: result.cellsCreated,
    });
  } catch (err) {
    console.error("Erro ao importar sheet:", err);
    return res.status(500).json({ error: "Erro interno ao importar sheet." });
  }
});

module.exports = router;