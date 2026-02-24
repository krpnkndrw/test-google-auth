import { db } from "./db";
import jwt from "jsonwebtoken";

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
  stmt.run(data.email, data.google_refresh_token, now, now);
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

export async function exchangeCodeAndSign(
  code: string,
  redirectUri: string,
  codeVerifier: string,
): Promise<{ token: string }> {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    code,
    code_verifier: codeVerifier,
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
