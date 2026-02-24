// scripts/db-init.js
const db = require("../server/db");
const { runMigrations } = require("../server/db/migrations");

try {
  runMigrations(db);
  console.log("✅ Banco inicializado + migrations rodadas.");
} catch (err) {
  console.error("❌ Erro ao rodar migrations:", err);
  process.exit(1);
}
