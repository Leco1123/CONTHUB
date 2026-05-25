const CORE_MODULES = [
  { slug: "dashboard", name: "Dashboard", order: 1, status: "online", access: "user+admin", active: true, aliases: [] },
  { slug: "contcomercial", name: "ContComercial", order: 2, status: "online", access: "user+admin", active: true, aliases: [] },
  { slug: "contflow", name: "ContFlow", order: 3, status: "online", access: "user+admin", active: true, aliases: [] },
  { slug: "contanalytics", name: "ContAnalytics", order: 4, status: "online", access: "ti+gerencial+coordenacao", active: true, aliases: [] },
  { slug: "contdocs", name: "ContDocs", order: 5, status: "dev", access: "admin", active: true, aliases: [] },
  { slug: "contrelatorios", name: "ContRelatórios", order: 6, status: "dev", access: "admin", active: true, aliases: ["contrels"] },
  { slug: "contconfig", name: "ContConfig", order: 7, status: "dev", access: "admin", active: true, aliases: [] },
  { slug: "contadmin", name: "ContAdmin Hub", order: 8, status: "online", access: "admin", active: true, aliases: [] },
];

function cleanText(value) {
  return String(value ?? "").trim();
}

function normalizeSlug(value) {
  return cleanText(value).toLowerCase();
}

async function syncCoreModules(db) {
  if (!db?.module) return [];

  const currentRows = await db.module.findMany({
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
  });

  const bySlug = new Map(currentRows.map((row) => [normalizeSlug(row.slug), row]));

  for (const definition of CORE_MODULES) {
    const canonicalSlug = normalizeSlug(definition.slug);
    const existing = bySlug.get(canonicalSlug);
    if (existing) {
      await db.module.update({
        where: { id: existing.id },
        data: {
          name: definition.name,
          order: definition.order,
        },
      });
      continue;
    }

    const aliasMatch = definition.aliases
      .map((alias) => bySlug.get(normalizeSlug(alias)))
      .find(Boolean);

    if (aliasMatch) {
      await db.module.update({
        where: { id: aliasMatch.id },
        data: {
          slug: canonicalSlug,
          name: definition.name,
          order: definition.order,
        },
      });
      continue;
    }

    await db.module.create({
      data: {
        slug: canonicalSlug,
        name: definition.name,
        order: definition.order,
        status: definition.status,
        access: definition.access,
        active: definition.active,
      },
    });
  }

  const syncedRows = await db.module.findMany({
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

  const syncedMap = new Map(syncedRows.map((row) => [normalizeSlug(row.slug), row]));
  return CORE_MODULES.map((definition) => syncedMap.get(normalizeSlug(definition.slug))).filter(Boolean);
}

module.exports = {
  CORE_MODULES,
  normalizeSlug,
  syncCoreModules,
};
