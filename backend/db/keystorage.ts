import crypto from "crypto";
import { db } from "./db";

const TTL_MS = 10 * 60 * 1000; // 10 минут

const insertStmt = db.prepare(`
  INSERT INTO plugin_auth_keys (read_key, write_key, code_verifier, value, created_at)
  VALUES (?, ?, NULL, NULL, ?)
`);

const selectByWriteKeyStmt = db.prepare(`
  SELECT value, created_at FROM plugin_auth_keys WHERE write_key = ?
`);

const updateByWriteKeyStmt = db.prepare(`
  UPDATE plugin_auth_keys
  SET value = ?
  WHERE write_key = ? AND value IS NULL AND (?) - created_at <= (?)
`);

const selectByReadKeyStmt = db.prepare(`
  SELECT value, created_at FROM plugin_auth_keys WHERE read_key = ?
`);

const deleteByReadKeyStmt = db.prepare(`
  DELETE FROM plugin_auth_keys WHERE read_key = ?
`);

const deleteByWriteKeyStmt = db.prepare(`
  DELETE FROM plugin_auth_keys WHERE write_key = ?
`);

const selectCodeVerifierByWriteKeyStmt = db.prepare(`
  SELECT code_verifier, created_at FROM plugin_auth_keys WHERE write_key = ?
`);

const updateCodeVerifierStmt = db.prepare(`
  UPDATE plugin_auth_keys SET code_verifier = ? WHERE write_key = ?
`);

const deleteExpiredStmt = db.prepare(`
  DELETE FROM plugin_auth_keys WHERE created_at < ?
`);

export function createKeyPair(): { readKey: string; writeKey: string } {
  deleteExpiredStmt.run(Date.now() - TTL_MS);
  const readKey = crypto.randomBytes(32).toString("hex");
  const writeKey = crypto.randomBytes(32).toString("hex");
  insertStmt.run(readKey, writeKey, Date.now());
  return { readKey, writeKey };
}

export function storeCodeVerifier(writeKey: string, codeVerifier: string): void {
  updateCodeVerifierStmt.run(codeVerifier, writeKey);
}

export function writeByWriteKey(writeKey: string, value: string): boolean {
  const now = Date.now();
  const row = selectByWriteKeyStmt.get(writeKey) as
    | { value: string | null; created_at: number }
    | undefined;
  if (!row) {
    return false;
  }
  if (row.value !== null) {
    return false;
  }
  if (now - row.created_at > TTL_MS) {
    deleteByWriteKeyStmt.run(writeKey);
    return false;
  }
  const result = updateByWriteKeyStmt.run(value, writeKey, now, TTL_MS);
  return (result as { changes: number }).changes > 0;
}

export function readByReadKey(readKey: string): string | null {
  const row = selectByReadKeyStmt.get(readKey) as
    | { value: string | null; created_at: number }
    | undefined;
  if (!row) return null;
  if (Date.now() - row.created_at > TTL_MS) {
    deleteByReadKeyStmt.run(readKey);
    return null;
  }
  const value = row.value ?? null;
  if (value === null) return null;
  deleteByReadKeyStmt.run(readKey);
  return value;
}

export function getCodeVerifierByWriteKey(writeKey: string): string | null {
  const row = selectCodeVerifierByWriteKeyStmt.get(writeKey) as
    | { code_verifier: string | null; created_at: number }
    | undefined;
  if (!row) return null;
  if (Date.now() - row.created_at > TTL_MS) {
    deleteByWriteKeyStmt.run(writeKey);
    return null;
  }
  return row.code_verifier ?? null;
}
