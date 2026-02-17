import jwt from "jsonwebtoken";
import { findUserById } from "./db";
import express from "express";

const clearCookie = (res: express.Response) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
};

export function requireAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  const token = req.cookies?.token;
  if (!token) {
    clearCookie(res);
    return res.status(401).json({ error: "Not logged in" });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
      userId: number;
    };
    const user = findUserById(decoded.userId);
    if (!user) {
      clearCookie(res);
      return res.status(401).json({ error: "User not found" });
    }
    (req as any).user = user;
    next();
  } catch (e) {
    clearCookie(res);
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
