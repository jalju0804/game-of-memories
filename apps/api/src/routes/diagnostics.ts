import { Router } from "express";
import { env } from "../config/env";
import { query } from "../db/pool";
import { asyncHandler } from "../services/errors";

export const diagnosticsRouter = Router();

diagnosticsRouter.get(
  "/diagnostics",
  asyncHandler(async (_req, res) => {
    let db = "ok";
    let dbSchema = "unknown";

    try {
      await query("SELECT 1");
      const result = await query<{ value: string }>(
        `SELECT value FROM app_metadata WHERE key = 'db_schema' LIMIT 1`
      );
      dbSchema = result.rows[0]?.value ?? "unknown";
    } catch {
      db = "error";
    }

    res.json({
      web: "ok",
      api: "ok",
      db,
      apiVersion: env.apiVersion,
      buildSha: env.buildSha,
      dbSchema
    });
  })
);
