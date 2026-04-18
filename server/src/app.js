import fs from "fs";
import path from "path";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import mongoose from "mongoose";
import { config } from "./config.js";
import { mockAuth } from "./middleware/auth.js";
import groupsRouter from "./routes/groups.js";
import challengesRouter from "./routes/challenges.js";
import postsRouter from "./routes/posts.js";

const app = express();

if (!fs.existsSync(config.uploadDir)) {
  fs.mkdirSync(config.uploadDir, { recursive: true });
}

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));
app.use(mockAuth);

app.use("/uploads", express.static(path.resolve(config.uploadDir)));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "loop-api" });
});

app.use("/api/groups", groupsRouter);
app.use("/api/groups/:groupId/challenges", challengesRouter);
app.use("/api", postsRouter);

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
