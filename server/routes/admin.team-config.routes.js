const express = require("express");
const db = require("../db");
const { requireContAdminAccess, requireTeamConfigManage } = require("../middleware/auth");

const router = express.Router();

function cleanText(value) {
  return String(value ?? "").trim();
}

function normalizeTeamConfigInput(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const normalized = {};

  for (const [coordinator, teams] of Object.entries(source)) {
    const safeCoordinator = cleanText(coordinator);
    if (!safeCoordinator) continue;

    const cleanedTeams = (Array.isArray(teams) ? teams : [])
      .map((team) => cleanText(team))
      .filter(Boolean);

    normalized[safeCoordinator] = Array.from(new Set(cleanedTeams));
  }

  return normalized;
}

function rowsToConfig(rows) {
  const config = {};

  rows.forEach((row) => {
    const coordinator = cleanText(row.coordinator);
    const teamName = cleanText(row.teamName);
    if (!coordinator || !teamName) return;

    if (!config[coordinator]) config[coordinator] = [];
    config[coordinator].push(teamName);
  });

  return config;
}

router.get("/", requireContAdminAccess, async (req, res) => {
  try {
    const rows = await db.teamConfigEntry.findMany({
      where: { active: true },
      orderBy: [{ coordinator: "asc" }, { order: "asc" }, { teamName: "asc" }],
    });

    return res.json({ config: rowsToConfig(rows) });
  } catch (err) {
    console.error("Erro ao buscar configuração de equipes:", err);
    return res.status(500).json({ error: "Erro ao buscar configuração de equipes." });
  }
});

router.put("/", requireTeamConfigManage, async (req, res) => {
  try {
    const config = normalizeTeamConfigInput(req.body?.config ?? req.body);

    await db.$transaction(async (tx) => {
      await tx.teamConfigEntry.deleteMany({});

      const rows = [];
      Object.entries(config).forEach(([coordinator, teams]) => {
        teams.forEach((teamName, index) => {
          rows.push({
            coordinator,
            teamName,
            order: index,
            active: true,
          });
        });
      });

      if (rows.length) {
        await tx.teamConfigEntry.createMany({ data: rows });
      }
    });

    return res.json({ ok: true, config });
  } catch (err) {
    console.error("Erro ao salvar configuração de equipes:", err);
    return res.status(500).json({ error: "Erro ao salvar configuração de equipes." });
  }
});

module.exports = router;
