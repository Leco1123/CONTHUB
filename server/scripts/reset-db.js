const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const dbFile = path.join(__dirname, "..", "data", "conthub.sqlite");
const sqlDir = path.join(__dirname, "..", "sql");

function runFile(db, filename) {
  const full = path.join(sqlDir, filename);
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
