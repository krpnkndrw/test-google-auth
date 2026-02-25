import crypto from "crypto";
import { db } from "./db";

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 дней

const insertStmt = db.prepare(`
  INSERT INTO refresh_tokens (email, token, expires_at, created_at)
  VALUES (?, ?, ?, ?)
`);

const selectByTokenStmt = db.prepare(`
  SELECT id, email, token, expires_at, created_at FROM refresh_tokens WHERE token = ?
`);

const deleteByTokenStmt = db.prepare(`
  DELETE FROM refresh_tokens WHERE token = ?
`);

const deleteExpiredStmt = db.prepare(`
  DELETE FROM refresh_tokens WHERE expires_at < ?
`);

export interface RefreshTokenRow {
  id: number;
  email: string;
  token: string;
  expires_at: number;
  created_at: number;
}

export function saveRefreshToken(email: string): string {
  deleteExpiredStmt.run(Date.now());
  const token = crypto.randomBytes(64).toString("hex");
  const now = Date.now();
  insertStmt.run(email, token, now + REFRESH_TTL_MS, now);
  return token;
}

export function findAndConsumeRefreshToken(token: string): RefreshTokenRow | null {
  const row = selectByTokenStmt.get(token) as RefreshTokenRow | undefined;
  if (!row) return null;
  if (Date.now() > row.expires_at) {
    deleteByTokenStmt.run(token);
    return null;
  }
  // Ротация: удаляем использованный токен
  deleteByTokenStmt.run(token);
  return row;
}

export function deleteRefreshToken(token: string): void {
  deleteByTokenStmt.run(token);
}
