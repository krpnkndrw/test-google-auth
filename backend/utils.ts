export function buildGoogleAuthUrl(
  redirectUri: string,
  state?: string,
): string {
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

export const cookieOpts = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};
