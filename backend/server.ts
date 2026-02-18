import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { createUser, findUserByEmail, updateUserRefreshToken } from "./db";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import path from "path";
import { readFileSync } from "fs";
import { createKeyPair, writeByWriteKey, readByReadKey } from "./keystorage";

dotenv.config();
const app = express();
const port = Number(process.env.PORT) || 3000;

const allowedOrigins = [process.env.BACKEND_URL].filter(Boolean) as string[];

const cookieOpts = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

function buildGoogleAuthUrl(redirectUri: string, state?: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/userinfo.email",
    access_type: "offline",
    prompt: "consent",
    ...(state && { state }),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function exchangeCodeAndSign(
  code: string,
  redirectUri: string,
): Promise<{ token: string }> {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    code,
  });
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const tokenResponse = await tokenRes.json();
  const google_refresh_token = `${tokenResponse.refresh_token}`;
  const google_access_token = `${tokenResponse.access_token}`;

  const userInfoRes = await fetch(
    "https://www.googleapis.com/oauth2/v2/userinfo",
    {
      headers: { Authorization: `Bearer ${google_access_token}` },
    },
  );
  const userInfo = await userInfoRes.json();
  const email = `${userInfo.email}`;
  let user = findUserByEmail(email);
  if (!user) {
    user = createUser({ email, google_refresh_token });
  } else {
    updateUserRefreshToken(email, google_refresh_token);
  }
  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, {
    expiresIn: "7d",
  });
  return { token };
}

app.use(cookieParser());
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
  const { readKey, writeKey } = createKeyPair();
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

  res.cookie("oauth_write_key", state, cookieOpts);

  const googleAuthUrl = buildGoogleAuthUrl(
    process.env.GOOGLE_REDIRECT_URI_PLUGIN!,
    state,
  );

  const pluginAuthPage = `<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Authentication</title>
        </head>
        <body>
          <div id="root">
            <button id="singIn">Continue</button>
          </div>
          <script>
            document.getElementById("singIn").onclick = () => {
              window.location.href = "${googleAuthUrl}";
            };
          </script>
        </body>
      </html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(pluginAuthPage);
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

  try {
    const { token } = await exchangeCodeAndSign(
      code,
      process.env.GOOGLE_REDIRECT_URI_PLUGIN!,
    );

    const written = writeByWriteKey(state, JSON.stringify({ token }));
    if (!written) {
      return res.status(400);
    }

    const html = `<!doctype html>
<html>
  <head><meta charset="utf-8"><title>Authentication</title></head>
  <body>
    <p>Authentication complete. You can close this window and switch back to Figma.</p>
  </body>
</html>`;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (error) {
    console.error(error);
    res.status(500).send("Authentication failed");
  }
});

app.get("/auth/poll", (req, res) => {
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

app.listen(port, () => {
  console.log(`Listening ${port}`);
});
