import { randomUUID } from "crypto";
import { Router } from "express";
import { query } from "../db/pool";
import { generateBearFeastRound, scoreGuess } from "../games/bearFeast";
import { requireAuth } from "../middleware/auth";
import { AppError, asyncHandler } from "../services/errors";

interface SessionRow {
  id: string;
  game_id: string;
  player_id: string;
  status: string;
  total_score: number;
  reached_round: number;
  correct_count: number;
  best_streak: number;
  current_streak: number;
  started_at: string;
  finished_at: string | null;
}

interface RoundRow {
  id: string;
  session_id: string;
  round_number: number;
  seed: string;
  duration_ms: number;
  bear_count: number;
  answer_bear_id: string;
  bear_counts_json: Record<string, number>;
  events_json: {
    bears: unknown[];
    events: unknown[];
  };
}

interface GuessRow {
  id: string;
  correct: boolean;
}

export const bearFeastRouter = Router();
const TIMEOUT_BEAR_ID = "__timeout__";

function publicRound(row: RoundRow) {
  return {
    roundId: row.id,
    roundNumber: row.round_number,
    durationMs: row.duration_ms,
    bearCount: row.bear_count,
    bears: row.events_json.bears,
    events: row.events_json.events
  };
}

async function getOwnedSession(
  sessionId: string,
  playerId: string
): Promise<SessionRow> {
  const result = await query<SessionRow>(
    `SELECT *
     FROM game_sessions
     WHERE id = $1
       AND player_id = $2
       AND game_id = 'bear-feast'
     LIMIT 1`,
    [sessionId, playerId]
  );
  const session = result.rows[0];
  if (!session) {
    throw new AppError(404, "session_not_found", "게임 세션을 찾을 수 없습니다.");
  }
  return session;
}

bearFeastRouter.post(
  "/games/bear-feast/sessions",
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = randomUUID();
    const result = await query<SessionRow>(
      `INSERT INTO game_sessions (id, game_id, player_id, status)
       VALUES ($1, 'bear-feast', $2, 'active')
       RETURNING *`,
      [id, req.auth?.player.id]
    );
    res.status(201).json({ session: result.rows[0] });
  })
);

bearFeastRouter.post(
  "/games/bear-feast/sessions/:sessionId/rounds",
  requireAuth,
  asyncHandler(async (req, res) => {
    const playerId = req.auth?.player.id;
    if (!playerId) throw new AppError(401, "auth_required", "로그인이 필요합니다.");
    const session = await getOwnedSession(req.params.sessionId, playerId);
    if (session.status !== "active") {
      throw new AppError(409, "session_finished", "이미 종료된 게임입니다.");
    }

    const latestRoundResult = await query<RoundRow>(
      `SELECT * FROM rounds
       WHERE session_id = $1
       ORDER BY round_number DESC
       LIMIT 1`,
      [session.id]
    );
    const latestRound = latestRoundResult.rows[0];

    if (latestRound) {
      const latestGuess = await query<GuessRow>(
        `SELECT id, correct FROM guesses
         WHERE round_id = $1 AND player_id = $2
         LIMIT 1`,
        [latestRound.id, playerId]
      );

      if (!latestGuess.rows[0]) {
        return res.json({ round: publicRound(latestRound) });
      }

      const nextRoundNumber = latestRound.round_number + 1;
      if (nextRoundNumber > 6 && !latestGuess.rows[0].correct) {
        await query(
          `UPDATE game_sessions
           SET status = 'completed', finished_at = COALESCE(finished_at, now())
           WHERE id = $1`,
          [session.id]
        );
        throw new AppError(409, "session_finished", "오답으로 게임이 종료되었습니다.");
      }
    }

    const roundNumber = latestRound ? latestRound.round_number + 1 : 1;
    const round = generateBearFeastRound(session.id, roundNumber);
    const inserted = await query<RoundRow>(
      `INSERT INTO rounds (
         id,
         session_id,
         round_number,
         seed,
         duration_ms,
         bear_count,
         answer_bear_id,
         bear_counts_json,
         events_json
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        round.id,
        session.id,
        round.roundNumber,
        round.seed,
        round.durationMs,
        round.bearCount,
        round.answerBearId,
        JSON.stringify(round.bearCounts),
        JSON.stringify(round.eventsPayload)
      ]
    );

    res.status(201).json({ round: publicRound(inserted.rows[0]) });
  })
);

bearFeastRouter.post(
  "/games/bear-feast/rounds/:roundId/guess",
  requireAuth,
  asyncHandler(async (req, res) => {
    const playerId = req.auth?.player.id;
    if (!playerId) throw new AppError(401, "auth_required", "로그인이 필요합니다.");
    const selectedBearId =
      typeof req.body?.selectedBearId === "string" ? req.body.selectedBearId : "";
    const responseMs =
      typeof req.body?.responseMs === "number" && Number.isFinite(req.body.responseMs)
        ? Math.max(0, Math.round(req.body.responseMs))
        : null;

    const roundResult = await query<RoundRow & SessionRow>(
      `SELECT
         r.*,
         gs.game_id,
         gs.player_id,
         gs.status,
         gs.total_score,
         gs.reached_round,
         gs.correct_count,
         gs.best_streak,
         gs.current_streak,
         gs.started_at,
         gs.finished_at
       FROM rounds r
       JOIN game_sessions gs ON gs.id = r.session_id
       WHERE r.id = $1
         AND gs.player_id = $2
         AND gs.game_id = 'bear-feast'
       LIMIT 1`,
      [req.params.roundId, playerId]
    );
    const round = roundResult.rows[0];
    if (!round) {
      throw new AppError(404, "round_not_found", "라운드를 찾을 수 없습니다.");
    }
    if (round.status !== "active") {
      throw new AppError(409, "session_finished", "이미 종료된 게임입니다.");
    }

    const bears = round.events_json.bears as Array<{ id: string }>;
    const timedOut = selectedBearId === TIMEOUT_BEAR_ID;
    if (!timedOut && !bears.some((bear) => bear.id === selectedBearId)) {
      throw new AppError(400, "invalid_bear", "선택한 곰이 올바르지 않습니다.");
    }

    const existingGuess = await query(
      `SELECT id FROM guesses WHERE round_id = $1 AND player_id = $2 LIMIT 1`,
      [round.id, playerId]
    );
    if (existingGuess.rows[0]) {
      throw new AppError(409, "already_guessed", "이미 제출한 라운드입니다.");
    }

    const correct = !timedOut && selectedBearId === round.answer_bear_id;
    const nextStreak = correct ? round.current_streak + 1 : 0;
    const score = scoreGuess(round.round_number, correct, nextStreak);
    const nextBestStreak = Math.max(round.best_streak, nextStreak);
    const nextCorrectCount = round.correct_count + (correct ? 1 : 0);
    const nextTotalScore = round.total_score + score;
    const runComplete = round.round_number >= 6 && !correct;

    await query(
      `INSERT INTO guesses (
         id,
         round_id,
         player_id,
         selected_bear_id,
         correct,
         score,
         response_ms
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        randomUUID(),
        round.id,
        playerId,
        selectedBearId,
        correct,
        score,
        responseMs
      ]
    );

    const updatedSession = await query<SessionRow>(
      `UPDATE game_sessions
       SET total_score = $2,
           reached_round = GREATEST(reached_round, $3),
           correct_count = $4,
           best_streak = $5,
           current_streak = $6,
           status = CASE WHEN $7 THEN 'completed' ELSE status END,
           finished_at = CASE WHEN $7 THEN now() ELSE finished_at END
       WHERE id = $1
       RETURNING *`,
      [
        round.session_id,
        nextTotalScore,
        round.round_number,
        nextCorrectCount,
        nextBestStreak,
        nextStreak,
        runComplete
      ]
    );

    res.json({
      correct,
      answerBearId: round.answer_bear_id,
      selectedBearId,
      score,
      counts: round.bear_counts_json,
      session: updatedSession.rows[0],
      runComplete,
      canContinue: !runComplete
    });
  })
);

bearFeastRouter.post(
  "/games/bear-feast/sessions/:sessionId/finish",
  requireAuth,
  asyncHandler(async (req, res) => {
    const playerId = req.auth?.player.id;
    if (!playerId) throw new AppError(401, "auth_required", "로그인이 필요합니다.");
    const session = await getOwnedSession(req.params.sessionId, playerId);
    const result = await query<SessionRow>(
      `UPDATE game_sessions
       SET status = 'completed', finished_at = COALESCE(finished_at, now())
       WHERE id = $1
       RETURNING *`,
      [session.id]
    );
    res.json({ session: result.rows[0] });
  })
);
