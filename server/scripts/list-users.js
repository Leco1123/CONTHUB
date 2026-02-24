const db = require("../db");

const users = db.prepare(`
  SELECT id, name, email, role, active, last_login
  FROM users
  ORDER BY id
`).all();

console.table(users);
