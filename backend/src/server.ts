import dotenv from "dotenv";

dotenv.config();

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import { readFileSync } from "fs";
import passport from "passport";

import auth from "./auth/routes";
import { allowedOrigins, htmlDir } from "./utils";

const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(cookieParser());
app.use(express.json());
app.use(passport.initialize());
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) cb(null, true);
      else cb(null, false);
    },
    credentials: true,
  }),
);
app.use("/auth", auth);

app.get("/plugin/ui", (_req, res) => {
  const pluginUiHtml = readFileSync(
    path.join(htmlDir, "plugin-ui.html"),
    "utf-8",
  );
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(pluginUiHtml);
});

// Защищённый маршрут — возвращает email из JWT
app.get(
  "/plugin/me",
  passport.authenticate("jwt", { session: false }),
  (req, res) => {
    res.json({ email: (req.user as { email: string }).email });
  },
);

app.listen(port, () => {
  console.log(`Listening ${port}`);
});
