// scripts/db-seed.js
const bcrypt = require("bcrypt");
const db = require("../server/db");
const { runMigrations } = require("../server/db/migrations");

async function seed() {
  runMigrations(db);

  const adminEmail = "admin@local";
  const adminPass = "admin123";

  const exists = db
    .prepare("SELECT id FROM users WHERE email = ?")
    .get(adminEmail);

  if (!exists) {
    const hash = await bcrypt.hash(adminPass, 10);

    db.prepare(`
      INSERT INTO users (name, email, password_hash, role, active, last_login)
      VALUES (?, ?, ?, 'admin', 1, NULL)
    `).run("Admin", adminEmail, hash);

    console.log("✅ Admin criado: admin@local / admin123");
  } else {
    console.log("ℹ️ Admin já existe, não vou recriar.");
  }

  const modules = [
    { name: "Dashboard", slug: "dashboard", order: 1, status: "Online", access: "user+admin", active: 1 },
    { name: "ContFlow", slug: "contflow", order: 2, status: "Base", access: "user+admin", active: 1 },
    { name: "ContAnalytics", slug: "contanalytics", order: 3, status: "Base", access: "user+admin", active: 1 },
    { name: "ContDocs", slug: "contdocs", order: 4, status: "Base", access: "user+admin", active: 1 },
    { name: "ContMIT", slug: "contmit", order: 5, status: "Base", access: "user+admin", active: 1 },
    { name: "ContRelatórios", slug: "contrels", order: 6, status: "Base", access: "user+admin", active: 1 },
    { name: "ContConfig", slug: "contconfig", order: 7, status: "Base", access: "admin-only", active: 1 },
    { name: "ContAdmin Hub", slug: "contadmin", order: 8, status: "Base", access: "admin-only", active: 1 }
  ];

  const insert = db.prepare(`
    INSERT INTO modules (name, slug, "order", status, access, active)
    VALUES (@name, @slug, @order, @status, @access, @active)
  `);

  const tx = db.transaction((arr) => {
    for (const m of arr) {
      const ex = db.prepare("SELECT id FROM modules WHERE slug = ?").get(m.slug);
      if (!ex) insert.run(m);
    }
  });

  tx(modules);
  console.log("✅ Módulos seed ok.");
}

seed().catch((err) => {
  console.error("❌ Erro no seed:", err);
  process.exit(1);
});
