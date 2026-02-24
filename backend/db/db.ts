import Database from "better-sqlite3";
import path from "path";

const dbPath = path.resolve(__dirname, "database.sqlite");
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    google_refresh_token TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS plugin_auth_keys (
    read_key TEXT PRIMARY KEY,
    write_key TEXT NOT NULL UNIQUE,
    value TEXT,
    created_at INTEGER NOT NULL
  )
`);

try {
  db.exec(`ALTER TABLE plugin_auth_keys ADD COLUMN code_verifier TEXT`);
} catch (err) {
  if (!(err instanceof Error && err.message.includes("duplicate column name"))) {
    throw err;
  }
  // column already exists — ok
}

export { db };
