const express = require("express");
const fs = require("fs");
const path = require("path");
const router = express.Router();
const db = require("../db");

const SHEET_BACKUP_ROOT = path.join(__dirname, "..", "data", "sheet-backups");
const MAX_BACKUPS_PER_SHEET = 100;

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

function ensureBackupRoot() {
  fs.mkdirSync(SHEET_BACKUP_ROOT, { recursive: true });
}

function safePathPart(value, fallback = "sheet") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function getSheetBackupDir(sheetKey) {
  ensureBackupRoot();
  const dir = path.join(SHEET_BACKUP_ROOT, safePathPart(sheetKey, "sheet"));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function loadFullSheetPayload(sheet) {
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

  return normalizeSheetPayload(sheet, columns, rows, cells);
}

function pruneSheetBackups(sheetKey) {
  const dir = getSheetBackupDir(sheetKey);
  const files = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => ({
      name: entry.name,
      fullPath: path.join(dir, entry.name),
      mtimeMs: fs.statSync(path.join(dir, entry.name)).mtimeMs,
    }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  files.slice(MAX_BACKUPS_PER_SHEET).forEach((file) => {
    try {
      fs.unlinkSync(file.fullPath);
    } catch (err) {
      console.warn("Falha ao remover backup antigo da sheet:", file.fullPath, err?.message || err);
    }
  });
}

function createSheetBackup(sheet, payload, actor, reason = "update") {
  const dir = getSheetBackupDir(sheet.key);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupId = `${stamp}__v${Number(sheet.version || 0)}`;
  const fileName = `${backupId}.json`;
  const fullPath = path.join(dir, fileName);

  const backupEnvelope = {
    backupId,
    sheetKey: sheet.key,
    sheetId: sheet.id,
    reason,
    createdAt: new Date().toISOString(),
    actor: actor
      ? {
          id: actor.id ?? null,
          email: actor.email ?? null,
          role: actor.role ?? null,
        }
      : null,
    snapshotVersion: Number(sheet.version || 0),
    snapshot: payload,
  };

  fs.writeFileSync(fullPath, JSON.stringify(backupEnvelope, null, 2), "utf8");
  pruneSheetBackups(sheet.key);

  return {
    backupId,
    fileName,
    fullPath,
    createdAt: backupEnvelope.createdAt,
    snapshotVersion: backupEnvelope.snapshotVersion,
  };
}

function readSheetBackupEnvelope(sheetKey, backupId) {
  const cleanBackupId = String(backupId || "").trim();
  if (!cleanBackupId) {
    throw new Error("backupId obrigatório.");
  }

  const filePath = path.join(getSheetBackupDir(sheetKey), `${cleanBackupId}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error("Backup não encontrado.");
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const envelope = JSON.parse(raw);

  if (!envelope || typeof envelope !== "object") {
    throw new Error("Backup inválido.");
  }

  return {
    envelope,
    filePath,
  };
}

function listSheetBackups(sheetKey) {
  const dir = getSheetBackupDir(sheetKey);
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => {
      const fullPath = path.join(dir, entry.name);
      const stat = fs.statSync(fullPath);
      let envelope = null;

      try {
        envelope = JSON.parse(fs.readFileSync(fullPath, "utf8"));
      } catch (err) {
        envelope = null;
      }

      return {
        backupId: String(envelope?.backupId || entry.name.replace(/\.json$/i, "")),
        fileName: entry.name,
        fullPath,
        size: stat.size,
        updatedAt: String(envelope?.createdAt || stat.mtime.toISOString()),
        createdAt: String(envelope?.createdAt || stat.mtime.toISOString()),
        snapshotVersion: Number(envelope?.snapshotVersion || 0),
        reason: String(envelope?.reason || ""),
        actor: envelope?.actor || null,
      };
    })
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

function extractDocumentPayloadFromSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    throw new Error("Snapshot de backup inválido.");
  }

  if (Array.isArray(snapshot.columns) && Array.isArray(snapshot.data)) {
    return {
      columns: snapshot.columns,
      data: snapshot.data,
    };
  }

  if (
    Array.isArray(snapshot.columns) &&
    Array.isArray(snapshot.rows) &&
    Array.isArray(snapshot.cells)
  ) {
    const orderedColumns = snapshot.columns
      .slice()
      .sort((a, b) => Number(a?.order || 0) - Number(b?.order || 0));

    const rowMap = new Map();

    snapshot.rows
      .slice()
      .sort((a, b) => Number(a?.order || 0) - Number(b?.order || 0))
      .forEach((row) => {
        const rowId = Number(row?.id);
        const rowObj = { __id: String(row?.clientRowId || `row_${rowId}`) };
        orderedColumns.forEach((col) => {
          rowObj[String(col?.key || "").trim()] = "";
        });
        rowMap.set(rowId, rowObj);
      });

    snapshot.cells.forEach((cell) => {
      const rowObj = rowMap.get(Number(cell?.rowId));
      const colKey = String(cell?.colKey || "").trim();
      if (!rowObj || !colKey || !(colKey in rowObj)) return;
      rowObj[colKey] = cell?.value == null ? "" : String(cell.value);
    });

    return {
      columns: orderedColumns.map((col) => ({
        key: String(col?.key || "").trim(),
        label: String(col?.label || col?.key || "").trim(),
        width: Number.isFinite(Number(col?.width)) ? Number(col.width) : 140,
      })),
      data: Array.from(rowMap.values()),
    };
  }

  throw new Error("Formato de snapshot não suportado para restauração.");
}

async function replaceSheetData(tx, sheet, columns, rawData, nextVersion) {
  const updatedSheet = await tx.sheet.update({
    where: { id: sheet.id },
    data: {
      version: nextVersion,
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

router.get("/:key/backups", async (req, res) => {
  try {
    const key = String(req.params.key || "").trim();
    const sheet = await db.sheet.findFirst({
      where: { key, deletedAt: null },
      select: { id: true, key: true, name: true, version: true, updatedAt: true },
    });

    if (!sheet) {
      return res.status(404).json({ error: "Sheet não encontrada." });
    }

    return res.json({
      ok: true,
      sheet,
      backups: listSheetBackups(key),
    });
  } catch (err) {
    console.error("Erro ao listar backups da sheet:", err);
    return res.status(500).json({ error: "Erro ao listar backups da sheet." });
  }
});

router.post("/:key/backups/:backupId/restore", async (req, res) => {
  try {
    const key = String(req.params.key || "").trim();
    const backupId = String(req.params.backupId || "").trim();

    const sheet = await db.sheet.findFirst({
      where: { key, deletedAt: null },
    });

    if (!sheet) {
      return res.status(404).json({ error: "Sheet não encontrada." });
    }

    const { envelope } = readSheetBackupEnvelope(key, backupId);
    if (String(envelope?.sheetKey || "").trim() !== key) {
      return res.status(400).json({ error: "Backup incompatível com a sheet." });
    }

    const restorePayload = extractDocumentPayloadFromSnapshot(envelope?.snapshot);
    const columns = (Array.isArray(restorePayload?.columns) ? restorePayload.columns : [])
      .map((col, index) => normalizeColumnInput(col, index))
      .filter((c) => c.key && c.label);
    const rawData = Array.isArray(restorePayload?.data) ? restorePayload.data : [];

    const currentPayload = await loadFullSheetPayload(sheet);
    const backupMeta = createSheetBackup(sheet, currentPayload, req.currentUser, "before_restore");

    const result = await db.$transaction(async (tx) =>
      replaceSheetData(tx, sheet, columns, rawData, (sheet.version || 0) + 1)
    );

    return res.json({
      ok: true,
      backup: backupMeta,
      restoredFrom: {
        backupId: String(envelope?.backupId || backupId),
        createdAt: String(envelope?.createdAt || ""),
        snapshotVersion: Number(envelope?.snapshotVersion || 0),
        reason: String(envelope?.reason || ""),
      },
      ...normalizeSheetPayload(
        result.updatedSheet,
        result.columnsFinal,
        result.rowsFinal,
        result.cellsFinal
      ),
    });
  } catch (err) {
    console.error("Erro ao restaurar backup da sheet:", err);
    return res.status(500).json({
      error: "Erro ao restaurar backup da sheet.",
      details: err?.message || String(err),
    });
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

    let backupMeta = null;
    if (key === "contflow") {
      const previousPayload = await loadFullSheetPayload(sheet);
      backupMeta = createSheetBackup(sheet, previousPayload, req.currentUser, "before_update");
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

    const result = await db.$transaction(async (tx) =>
      replaceSheetData(tx, sheet, columns, rawData, (sheet.version || 0) + 1)
    );

    return res.json({
      ok: true,
      backup: backupMeta,
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
