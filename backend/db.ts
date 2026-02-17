import Database from "better-sqlite3";
import path from "path";

const dbPath = path.join(__dirname, "database.sqlite");
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

export interface User {
  id: number;
  email: string;
  google_refresh_token: string;
  created_at: string;
  updated_at: string;
}

export function findUserByEmail(email: string): User | undefined {
  const stmt = db.prepare("SELECT * FROM users WHERE email = ?");
  return stmt.get(email) as User | undefined;
}

export function findUserById(id: number): User | undefined {
  const stmt = db.prepare("SELECT * FROM users WHERE id = ?");
  return stmt.get(id) as User | undefined;
}

export function createUser(data: {
  email: string;
  google_refresh_token: string;
}): User {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO users (email, google_refresh_token, created_at, updated_at)
    VALUES (?, ?, ?, ?)
  `);
  const result = stmt.run(data.email, data.google_refresh_token, now, now);
  return findUserByEmail(data.email)!;
}

export function updateUserRefreshToken(
  email: string,
  google_refresh_token: string,
): void {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    UPDATE users
    SET google_refresh_token = ?, updated_at = ?
    WHERE email = ?
  `);
  stmt.run(google_refresh_token, now, email);
}
