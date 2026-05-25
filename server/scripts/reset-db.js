const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const dbFile = path.join(__dirname, "..", "data", "conthub.sqlite");
const sqlDir = path.join(__dirname, "..", "sql");
const ALLOWED_SQL_FILES = new Set(["001_init.sql", "002_seed.sql"]);

function runFile(db, filename) {
  if (!ALLOWED_SQL_FILES.has(filename)) {
    throw new Error(`Arquivo SQL não permitido: ${filename}`);
  }

  // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal
  const full = path.resolve(sqlDir, filename);
  const sql = fs.readFileSync(full, "utf8");
  db.exec(sql);
  console.log("✅ aplicado:", filename);
}

console.log("🧹 recriando banco:", dbFile);
fs.mkdirSync(path.dirname(dbFile), { recursive: true });

const db = new Database(dbFile);
db.pragma("foreign_keys = ON");

runFile(db, "001_init.sql");
runFile(db, "002_seed.sql");

db.close();
console.log("✅ banco pronto.");
