import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { findUserById, type User } from "./db/user";

export interface AuthedRequest extends Request {
  user?: User;
}

export function pluginAuthMiddleware(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
) {
  const authHeader = req.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing token" });
  }
  const rawToken = authHeader.slice("Bearer ".length).trim();

  try {
    const payload = jwt.verify(rawToken, process.env.JWT_SECRET!) as {
      userId: number;
    };

    const user = findUserById(payload.userId);
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid token" });
  }
}
