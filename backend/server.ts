import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { exchangeCodeAndSign, findUserById } from "./db/user";
import cookieParser from "cookie-parser";
import path from "path";
import { readFileSync } from "fs";
import { createKeyPair, writeByWriteKey, readByReadKey, getCodeVerifierByWriteKey } from "./db/keystorage";
import { buildGoogleAuthUrl, cookieOpts } from "./utils";
import { AuthedRequest, pluginAuthMiddleware } from "./authMiddleware";
import crypto from "crypto";

dotenv.config();
const app = express();
const port = Number(process.env.PORT) || 3000;

const allowedOrigins = [process.env.BACKEND_URL].filter(Boolean) as string[];

app.use(cookieParser());
app.use(express.json());
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) cb(null, true);
      else cb(null, false);
    },
    credentials: true,
  }),
);

app.get("/plugin/ui", (req, res) => {
  const pluginUiHtml = readFileSync(
    path.join(__dirname, "plugin-ui.html"),
    "utf-8",
  );
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(pluginUiHtml);
});

app.post("/plugin/keys", (req, res) => {
  const { codeVerifier } = req.body as { codeVerifier?: string };

  if (!codeVerifier || typeof codeVerifier !== "string" || codeVerifier.length < 43) {
    return res.status(400).json({ error: "Missing or invalid codeVerifier" });
  }

  const { readKey, writeKey } = createKeyPair(codeVerifier);

  const authUrl =
    process.env.BACKEND_URL +
    "/plugin/auth?state=" +
    encodeURIComponent(writeKey);

  res.json({ readKey, authUrl });
});

app.get("/plugin/auth", (req, res) => {
  const { state } = req.query;

  if (!state || typeof state !== "string") {
    return res.status(400).send("Missing state");
  }

  const codeVerifier = getCodeVerifierByWriteKey(state);
  if (!codeVerifier) {
    return res.status(400).send("Invalid or expired state");
  }

  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  res.cookie("oauth_write_key", state, cookieOpts);

  const googleAuthUrl = buildGoogleAuthUrl(
    process.env.GOOGLE_REDIRECT_URI_PLUGIN!,
    state,
    codeChallenge,
  );
  res.redirect(302, googleAuthUrl);
});

app.get("/plugin/callback", async (req, res) => {
  const { code, state: rawState } = req.query;

  if (!code || typeof code !== "string") {
    return res.status(400).send("Missing code");
  }
  if (!rawState || typeof rawState !== "string") {
    return res.status(400).send("Missing state");
  }
  const state = rawState.trim();

  const cookieWriteKey = req.cookies?.oauth_write_key;
  if (!cookieWriteKey || cookieWriteKey.trim() !== state) {
    return res.status(400).send("Invalid state");
  }

  const codeVerifier = getCodeVerifierByWriteKey(state);
  if (!codeVerifier) {
    return res.status(400).send("Code verifier not found or expired");
  }

  try {
    const { token } = await exchangeCodeAndSign(
      code,
      process.env.GOOGLE_REDIRECT_URI_PLUGIN!,
      codeVerifier,
    );

    const written = writeByWriteKey(state, JSON.stringify({ token }));
    if (!written) {
      return res.status(400).send("Failed to write auth key");
    }

    const successHtml = readFileSync(
      path.join(__dirname, "success_auth.html"),
      "utf-8",
    );
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(successHtml);
  } catch (error) {
    console.error(error);
    res.status(500).send("Authentication failed");
  }
});

app.get("/plugin/poll", (req, res) => {
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
    const data = JSON.parse(value) as { token: string };
    res.json({ token: data.token });
  } catch {
    res.status(500).json({ error: "Invalid stored value" });
  }
});

app.get(
  "/plugin/me",
  pluginAuthMiddleware,
  (req: AuthedRequest, res: express.Response) => {
    res.json({ email: req.user!.email });
  },
);

app.listen(port, () => {
  console.log(`Listening ${port}`);
});
