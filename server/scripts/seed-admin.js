const bcrypt = require("bcryptjs");
const db = require("../db");

const email = "admin@conthub.local";
const password = "Admin@123";
const name = "Administrador";

const hash = bcrypt.hashSync(password, 10);

// cria tabela se não existir (segurança)
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    active INTEGER NOT NULL DEFAULT 1,
    last_login TEXT NULL
  );
`);

const exists = db.prepare("SELECT id FROM users WHERE email = ?").get(email);

if (exists) {
  db.prepare(`
    UPDATE users
       SET name = ?, password_hash = ?, role = 'admin', active = 1
     WHERE email = ?
  `).run(name, hash, email);

  console.log("✅ Admin atualizado:", email);
} else {
  db.prepare(`
    INSERT INTO users (name, email, password_hash, role, active)
    VALUES (?, ?, ?, 'admin', 1)
  `).run(name, email, hash);

  console.log("✅ Admin criado:", email);
}

console.log("🔑 Senha:", password);
