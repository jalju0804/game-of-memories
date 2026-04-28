import { Router } from "express";
import { query } from "../db/pool";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../services/errors";

interface GameRow {
  id: string;
  title: string;
  status: string;
}

export const gamesRouter = Router();

gamesRouter.get(
  "/games",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const result = await query<GameRow>(
      `SELECT id, title, status
       FROM games
       WHERE id = 'bear-feast'
       ORDER BY created_at ASC`
    );
    res.json({ games: result.rows });
  })
);

gamesRouter.get(
  "/games/:gameId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await query<GameRow>(
      `SELECT id, title, status FROM games WHERE id = $1 LIMIT 1`,
      [req.params.gameId]
    );
    res.json({ game: result.rows[0] ?? null });
  })
);
