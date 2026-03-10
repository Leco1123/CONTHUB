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
    order: index,
    width: Number.isFinite(Number(col?.width)) ? Number(col.width) : 140,
  };
}

///////////////////////////////////////////////
//// CREATE SHEET
///////////////////////////////////////////////

router.post("/", async (req, res) => {
  try {
    const key = String(req.body?.key || "").trim();
    const name = String(req.body?.name || "").trim();
    const rawColumns = Array.isArray(req.body?.columns) ? req.body.columns : [];

    if (!key) {
      return res.status(400).json({ error: "key obrigatória." });
    }

    if (!name) {
      return res.status(400).json({ error: "name obrigatório." });
    }

    const exists = await db.sheet.findFirst({
      where: { key, deletedAt: null },
    });

    if (exists) {
      return res.status(409).json({ error: "Sheet já existe." });
    }

    const columns = rawColumns
      .map((col, index) => normalizeColumnInput(col, index))
      .filter((c) => c.key && c.label);

    const sheet = await db.sheet.create({
      data: {
        key,
        name,
        version: 1,
        active: true,
      },
    });

    if (columns.length > 0) {
      await db.sheetColumn.createMany({
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

    return res.json({
      ok: true,
      sheetId: sheet.id,
    });
  } catch (err) {
    console.error("Erro ao criar sheet:", err);
    return res.status(500).json({ error: "Erro ao criar sheet." });
  }
});

///////////////////////////////////////////////
//// GET SHEET
///////////////////////////////////////////////

router.get("/:key", async (req, res) => {
  try {
    const key = String(req.params.key || "").trim();

    const sheet = await db.sheet.findFirst({
      where: { key, deletedAt: null },
    });

    if (!sheet) {
      return res.status(404).json({ error: "Sheet não encontrada." });
    }

    const [columns, rows, cells] = await Promise.all([
      db.sheetColumn.findMany({
        where: { sheetId: sheet.id, deletedAt: null, active: true },
        orderBy: { order: "asc" },
      }),

      db.sheetRow.findMany({
        where: { sheetId: sheet.id, deletedAt: null, active: true },
        orderBy: { order: "asc" },
      }),

      db.sheetCell.findMany({
        where: { sheetId: sheet.id, deletedAt: null },
      }),
    ]);

    return res.json(
      normalizeSheetPayload(sheet, columns, rows, cells)
    );
  } catch (err) {
    console.error("Erro ao buscar sheet:", err);
    return res.status(500).json({ error: "Erro interno." });
  }
});

///////////////////////////////////////////////
//// UPDATE SHEET
///////////////////////////////////////////////

router.put("/:key", async (req, res) => {
  try {
    const key = String(req.params.key || "").trim();

    const sheet = await db.sheet.findFirst({
      where: { key, deletedAt: null },
    });

    if (!sheet) {
      return res.status(404).json({ error: "Sheet não encontrada." });
    }

    const rawColumns = Array.isArray(req.body?.columns)
      ? req.body.columns
      : [];

    const rawData = Array.isArray(req.body?.data)
      ? req.body.data
      : [];

    const columns = rawColumns
      .map((col, index) => normalizeColumnInput(col, index))
      .filter((c) => c.key && c.label);

    const result = await db.$transaction(async (tx) => {

      const updatedSheet = await tx.sheet.update({
        where: { id: sheet.id },
        data: {
          version: (sheet.version || 0) + 1,
        },
      });

      await tx.sheetCell.deleteMany({
        where: { sheetId: sheet.id },
      });

      await tx.sheetRow.deleteMany({
        where: { sheetId: sheet.id },
      });

      await tx.sheetColumn.deleteMany({
        where: { sheetId: sheet.id },
      });

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

      const createdColumns = await tx.sheetColumn.findMany({
        where: { sheetId: sheet.id, active: true },
      });

      const validColKeys = new Set(createdColumns.map((c) => c.key));

      for (let i = 0; i < rawData.length; i++) {

        const rowData = rawData[i];

        const row = await tx.sheetRow.create({
          data: {
            sheetId: sheet.id,
            clientRowId: rowData.__id || `row_${i}`,
            order: i,
            active: true,
          },
        });

        const cellData = [];

        for (const [colKey, value] of Object.entries(rowData)) {

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
        }
      }

      const [columnsFinal, rowsFinal, cellsFinal] = await Promise.all([
        tx.sheetColumn.findMany({
          where: { sheetId: sheet.id, active: true },
          orderBy: { order: "asc" },
        }),

        tx.sheetRow.findMany({
          where: { sheetId: sheet.id, active: true },
          orderBy: { order: "asc" },
        }),

        tx.sheetCell.findMany({
          where: { sheetId: sheet.id },
        }),
      ]);

      return {
        updatedSheet,
        columnsFinal,
        rowsFinal,
        cellsFinal,
      };
    });

    return res.json({
      ok: true,
      ...normalizeSheetPayload(
        result.updatedSheet,
        result.columnsFinal,
        result.rowsFinal,
        result.cellsFinal
      ),
    });

  } catch (err) {
    console.error("Erro ao atualizar sheet:");
    console.error(err);

    return res.status(500).json({
      error: "Erro interno ao atualizar sheet.",
      details: err?.message || String(err),
    });
  }
});

///////////////////////////////////////////////
//// IMPORT LOCAL STORAGE
///////////////////////////////////////////////

router.post("/:key/import-local", async (req, res) => {
  try {

    const key = String(req.params.key || "").trim();

    const incomingRows = Array.isArray(req.body?.rows)
      ? req.body.rows
      : [];

    const sheet = await db.sheet.findFirst({
      where: { key, deletedAt: null },
    });

    if (!sheet) {
      return res.status(404).json({ error: "Sheet não encontrada." });
    }

    const columns = await db.sheetColumn.findMany({
      where: { sheetId: sheet.id, active: true },
    });

    const validColKeys = new Set(columns.map((c) => c.key));

    await db.sheetCell.deleteMany({ where: { sheetId: sheet.id } });
    await db.sheetRow.deleteMany({ where: { sheetId: sheet.id } });

    for (let i = 0; i < incomingRows.length; i++) {

      const rowData = incomingRows[i];

      const row = await db.sheetRow.create({
        data: {
          sheetId: sheet.id,
          clientRowId: rowData.__id || `row_${i}`,
          order: i,
          active: true,
        },
      });

      const cellData = [];

      for (const [colKey, value] of Object.entries(rowData)) {

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
        await db.sheetCell.createMany({
          data: cellData,
        });
      }
    }

    return res.json({
      ok: true,
      importedRows: incomingRows.length,
    });

  } catch (err) {
    console.error("Erro ao importar sheet:", err);

    return res.status(500).json({
      error: "Erro interno ao importar sheet.",
    });
  }
});

module.exports = router;