import express from "express";
import path from "path";
import { readFileSync } from "fs";
import passport from "passport";
import jwt from "jsonwebtoken";
import { createKeyPair, writeByWriteKey, readByReadKey } from "./db/keyStorage";
import {
  findAndConsumeRefreshToken,
  saveRefreshToken,
} from "./db/refreshToken";
import "./passport/googleStrategy";
import "./passport/jwtStrategy";
import { allowedOrigins } from "../utils";
import { cookieOpts } from "./utils";

const auth = express.Router();

// Создать пару ключей для polling (codeVerifier генерирует Passport в /auth/redirect)
auth.post("/login", (_req, res) => {
  const { readKey, writeKey } = createKeyPair();
  const authUrl =
    process.env.BACKEND_URL +
    "/auth/redirect?state=" +
    encodeURIComponent(writeKey);
  res.json({ readKey, authUrl });
});

// Редирект на Google OAuth с PKCE (Passport генерирует code_verifier через StateStore)
auth.get("/redirect", (req, res, next) => {
  const { state: writeKey } = req.query;
  if (!writeKey || typeof writeKey !== "string") {
    return res.status(400).send("Missing state");
  }
  res.cookie("oauth_write_key", writeKey, cookieOpts);
  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
  })(req, res, next);
});

// Google OAuth callback — Passport обменивает code + code_verifier
auth.get("/callback", (req, res, next) => {
  passport.authenticate(
    "google",
    { session: false },
    (
      err: Error | null,
      tokens: { accessToken: string; refreshToken: string } | false,
    ) => {
      if (err || !tokens) {
        console.error("Auth error:", err?.message ?? err);

        if (!tokens && !err) {
          console.error(
            "Auth failed: no tokens (possible state/cookie mismatch). Cookie present:",
            !!req.cookies?.oauth_write_key,
            "query.state:",
            !!req.query.state,
          );
        }
        return res.status(500).send("Authentication failed");
      }

      const state = req.query.state as string;
      const written = writeByWriteKey(state, JSON.stringify(tokens));
      if (!written) {
        return res.status(400).send("Failed to write auth key");
      }

      const successHtml = readFileSync(
        path.join(__dirname, "success_auth.html"),
        "utf-8",
      );

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(successHtml);
    },
  )(req, res, next);
});

// Polling — ожидание результата авторизации
auth.get("/poll", (req, res) => {
  const readKey = req.query.readKey;
  if (!readKey || typeof readKey !== "string") {
    return res.status(400).json({ error: "Missing readKey" });
  }

  const origin = req.get("Origin");
  if (origin && allowedOrigins.length && !allowedOrigins.includes(origin)) {
    return res.status(403).json({ error: "Origin not allowed" });
  }

  const value = readByReadKey(readKey);
  if (!value) {
    return res.status(204).send();
  }

  try {
    const tokens = JSON.parse(value) as {
      accessToken: string;
      refreshToken: string;
    };
    res.json(tokens);
  } catch {
    res.status(500).json({ error: "Invalid stored value" });
  }
});

// Обновить access token по refresh token (ротация)
auth.post("/refresh", (req, res) => {
  const { refreshToken } = req.body as { refreshToken?: string };
  if (!refreshToken || typeof refreshToken !== "string") {
    return res.status(400).json({ error: "Missing refreshToken" });
  }

  const row = findAndConsumeRefreshToken(refreshToken);
  if (!row) {
    return res.status(401).json({ error: "Invalid or expired refresh token" });
  }

  const newAccessToken = jwt.sign(
    { email: row.email },
    process.env.JWT_SECRET!,
    { expiresIn: "15m" },
  );
  const newRefreshToken = saveRefreshToken(row.email);

  res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
});

// Logout — инвалидировать refresh token
auth.post("/logout", (req, res) => {
  const { refreshToken } = req.body as { refreshToken?: string };
  if (refreshToken && typeof refreshToken === "string") {
    findAndConsumeRefreshToken(refreshToken); // удалит токен из БД
  }
  res.status(204).send();
});

export default auth;
