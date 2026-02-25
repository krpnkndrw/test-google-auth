import passport from "passport";
import {
  Strategy as JwtStrategy,
  ExtractJwt,
  StrategyOptions,
} from "passport-jwt";

export interface JwtPayload {
  email: string;
}

const opts: StrategyOptions = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: process.env.JWT_SECRET!,
};

passport.use(
  new JwtStrategy(opts, (payload: JwtPayload, done) => {
    if (!payload.email) {
      return done(null, false);
    }
    done(null, { email: payload.email });
  }),
);
