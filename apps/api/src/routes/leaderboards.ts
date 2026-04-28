import { Router } from "express";
import { query } from "../db/pool";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../services/errors";

interface LeaderboardRow {
  id: string;
  nickname: string;
  total_score: number;
  reached_round: number;
  correct_count: number;
  best_streak: number;
  finished_at: string;
}

interface StatsRow {
  best_score: number | null;
  best_round: number | null;
  best_streak: number | null;
  plays: string;
}

interface SessionListRow {
  id: string;
  total_score: number;
  reached_round: number;
  correct_count: number;
  best_streak: number;
  status: string;
  started_at: string;
  finished_at: string | null;
}

export const leaderboardsRouter = Router();

leaderboardsRouter.get(
  "/leaderboards",
  requireAuth,
  asyncHandler(async (req, res) => {
    const gameId =
      typeof req.query.gameId === "string" ? req.query.gameId : "bear-feast";
    const result = await query<LeaderboardRow>(
      `SELECT
         gs.id,
         p.nickname,
         gs.total_score,
         gs.reached_round,
         gs.correct_count,
         gs.best_streak,
         gs.finished_at
       FROM game_sessions gs
       JOIN players p ON p.id = gs.player_id
       WHERE gs.game_id = $1
         AND gs.status = 'completed'
       ORDER BY
         gs.total_score DESC,
         gs.reached_round DESC,
         gs.correct_count DESC,
         gs.finished_at ASC
       LIMIT 20`,
      [gameId]
    );

    res.json({
      leaderboard: result.rows.map((row, index) => ({
        rank: index + 1,
        sessionId: row.id,
        nickname: row.nickname,
        totalScore: row.total_score,
        reachedRound: row.reached_round,
        correctCount: row.correct_count,
        bestStreak: row.best_streak,
        finishedAt: row.finished_at
      }))
    });
  })
);

leaderboardsRouter.get(
  "/me/stats",
  requireAuth,
  asyncHandler(async (req, res) => {
    const playerId = req.auth?.player.id;
    const result = await query<StatsRow>(
      `SELECT
         MAX(total_score) AS best_score,
         MAX(reached_round) AS best_round,
         MAX(best_streak) AS best_streak,
         COUNT(*) AS plays
       FROM game_sessions
       WHERE player_id = $1
         AND game_id = 'bear-feast'
         AND status = 'completed'`,
      [playerId]
    );
    const row = result.rows[0];
    res.json({
      stats: {
        bestScore: row?.best_score ?? 0,
        bestRound: row?.best_round ?? 0,
        bestStreak: row?.best_streak ?? 0,
        plays: Number(row?.plays ?? 0)
      }
    });
  })
);

leaderboardsRouter.get(
  "/me/sessions",
  requireAuth,
  asyncHandler(async (req, res) => {
    const playerId = req.auth?.player.id;
    const gameId =
      typeof req.query.gameId === "string" ? req.query.gameId : "bear-feast";
    const result = await query<SessionListRow>(
      `SELECT
         id,
         total_score,
         reached_round,
         correct_count,
         best_streak,
         status,
         started_at,
         finished_at
       FROM game_sessions
       WHERE player_id = $1
         AND game_id = $2
       ORDER BY started_at DESC
       LIMIT 10`,
      [playerId, gameId]
    );

    res.json({
      sessions: result.rows.map((row) => ({
        id: row.id,
        totalScore: row.total_score,
        reachedRound: row.reached_round,
        correctCount: row.correct_count,
        bestStreak: row.best_streak,
        status: row.status,
        startedAt: row.started_at,
        finishedAt: row.finished_at
      }))
    });
  })
);
