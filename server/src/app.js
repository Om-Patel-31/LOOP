import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import mongoose from "mongoose";
import cookieParser from "cookie-parser";
import { config } from "./config.js";
import { requireAuth } from "./middleware/auth.js";
import authRouter from "./routes/auth.js";
import usersRouter from "./routes/users.js";
import groupsRouter from "./routes/groups.js";
import challengesRouter from "./routes/challenges.js";
import postsRouter from "./routes/posts.js";

const app = express();

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());
app.use(morgan("dev"));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "loop-api" });
});

app.use("/api/auth", authRouter);
app.use("/api/users", requireAuth, usersRouter);
app.use("/api/groups", requireAuth, groupsRouter);
app.use("/api/groups/:groupId/challenges", requireAuth, challengesRouter);
app.use("/api", requireAuth, postsRouter);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Unexpected server error" });
});

export async function startServer() {
  await mongoose.connect(config.mongoUri);
  app.listen(config.port, () => {
    console.log(`Loop API listening on http://localhost:${config.port}`);
  });
}

export default app;
