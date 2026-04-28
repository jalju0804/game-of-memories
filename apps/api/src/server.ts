import cors from "cors";
import express from "express";
import { env } from "./config/env";
import { ensureSchema, waitForDatabase } from "./db/schema";
import { authRouter } from "./routes/auth";
import { bearFeastRouter } from "./routes/bearFeast";
import { diagnosticsRouter } from "./routes/diagnostics";
import { gamesRouter } from "./routes/games";
import { leaderboardsRouter } from "./routes/leaderboards";
import { errorHandler } from "./services/errors";

async function main() {
  await waitForDatabase();
  await ensureSchema();

  const app = express();
  app.use(
    cors({
      origin: env.corsOrigin === "*" ? true : env.corsOrigin,
      credentials: false
    })
  );
  app.use(express.json({ limit: "256kb" }));

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api/auth", authRouter);
  app.use("/api", diagnosticsRouter);
  app.use("/api", gamesRouter);
  app.use("/api", bearFeastRouter);
  app.use("/api", leaderboardsRouter);
  app.use(errorHandler);

  app.listen(env.port, "0.0.0.0", () => {
    console.log(`bear-feast-api listening on 0.0.0.0:${env.port}`);
  });
}

main().catch((error) => {
  console.error("failed to start api", error);
  process.exit(1);
});
