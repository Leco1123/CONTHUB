PRAGMA foreign_keys = ON;

DROP TABLE IF EXISTS modules;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  active INTEGER NOT NULL DEFAULT 1,
  last_login TEXT NULL
);

CREATE INDEX idx_users_email ON users(email);

CREATE TABLE modules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  "order" INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'Base',
  access TEXT NOT NULL DEFAULT 'user+admin',
  active INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_modules_order ON modules("order");
