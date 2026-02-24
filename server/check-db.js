const db = require("./db");

const sql =
  "SELECT name, sql " +
  "FROM sqlite_master " +
  "WHERE type='table' " +
  "AND name NOT LIKE 'sqlite_%' " +
  "ORDER BY name";

console.log(db.prepare(sql).all());
