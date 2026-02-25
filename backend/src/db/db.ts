import Database from "better-sqlite3";
import path from "path";

const dbPath = path.resolve(__dirname, "database.sqlite");
const db = new Database(dbPath);

// Удалить старую таблицу users (данные не нужны)
db.exec(`DROP TABLE IF EXISTS users`);

db.exec(`
  CREATE TABLE IF NOT EXISTS plugin_auth_keys (
    read_key TEXT PRIMARY KEY,
    write_key TEXT NOT NULL UNIQUE,
    code_verifier TEXT,
    value TEXT,
    created_at INTEGER NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )
`);

try {
  db.exec(`ALTER TABLE plugin_auth_keys ADD COLUMN code_verifier TEXT`);
} catch (err) {
  if (!(err instanceof Error && err.message.includes("duplicate column name"))) {
    throw err;
  }
}

export { db };
