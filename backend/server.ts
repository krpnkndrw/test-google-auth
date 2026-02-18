import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { createUser, findUserByEmail, updateUserRefreshToken } from "./db";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import { requireAuth } from "./jwt";
import path from "path";
import { readFileSync } from "fs";

dotenv.config();
const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(cookieParser());
app.use(
  cors({
    origin: process.env.FRONT_URL,
    credentials: true,
  }),
);

app.get("/", (req, res) => {
  res.send("ok");
});

app.get("/plugin-ui", (req, res) => {
  const pluginUiHtml = readFileSync(
    path.join(__dirname, "plugin-ui.html"),
    "utf-8",
  );
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(pluginUiHtml);
});

app.get("/me", requireAuth, (req, res) => {
  const user = (req as any).user;
  res.json({
    id: user.id,
    email: user.email,
  });
});

app.get("/auth/callback", async (req, res) => {
  const { code } = req.query;

  if (!code || typeof code !== "string") {
    return res.status(400).send("Missing code");
  }

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
    grant_type: "authorization_code",
    code,
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  try {
    const tokenResponse = await response.json();

    const google_refresh_token = `${tokenResponse.refresh_token}`;
    const google_access_token = `${tokenResponse.access_token}`;

    const emailResponse = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        method: "GET",
        headers: { Authorization: `Bearer ${google_access_token}` },
      },
    );
    const userInfo = await emailResponse.json();
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

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 дней в миллисекундах
    });

    res.redirect(process.env.FRONT_URL!);
  } catch (error) {
    console.log(error);
    res.redirect(process.env.FRONT_URL!);
  }
});

app.post("/auth", (req, res) => {
  const authUrl =
    "https://accounts.google.com/o/oauth2/v2/auth?" +
    "client_id=" +
    process.env.GOOGLE_CLIENT_ID +
    "&redirect_uri=" +
    process.env.GOOGLE_REDIRECT_URI +
    "&response_type=code" +
    "&scope=https://www.googleapis.com/auth/userinfo.email" +
    "&access_type=offline" +
    "&prompt=consent";

  res.json({ authUrl });
});

app.post("/logout", (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
  res.json({ ok: true });
});

app.listen(port, () => {
  console.log(`Listening ${port}`);
});
