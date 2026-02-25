import dotenv from "dotenv";

dotenv.config();

import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import jwt from "jsonwebtoken";
import { saveRefreshToken } from "../db/refreshToken";
import { KeyStorageStateStore } from "./stateStore";

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL: process.env.GOOGLE_REDIRECT_URI!,
      pkce: true,
      state: true,
      store: new KeyStorageStateStore(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        if (!email) {
          return done(new Error("No email in Google profile"));
        }

        const ourAccessToken = jwt.sign({ email }, process.env.JWT_SECRET!, {
          expiresIn: "15m",
        });

        const ourRefreshToken = saveRefreshToken(email);

        const tokens: AuthTokens = {
          accessToken: ourAccessToken,
          refreshToken: ourRefreshToken,
        };

        done(null, tokens);
      } catch (err) {
        done(err as Error);
      }
    },
  ),
);
