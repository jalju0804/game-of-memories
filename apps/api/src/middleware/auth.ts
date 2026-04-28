import type { NextFunction, Request, Response } from "express";
import { query } from "../db/pool";
import { AppError } from "../services/errors";
import { hashToken, publicPlayer } from "../services/security";

interface AuthRow {
  session_id: string;
  token_hash: string;
  player_id: string;
  nickname: string;
}

export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const header = req.header("authorization");
    const match = header?.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      throw new AppError(401, "auth_required", "로그인이 필요합니다.");
    }

    const tokenHash = hashToken(match[1]);
    const result = await query<AuthRow>(
      `SELECT
         s.id AS session_id,
         s.token_hash,
         p.id AS player_id,
         p.nickname
       FROM sessions s
       JOIN players p ON p.id = s.player_id
       WHERE s.token_hash = $1
         AND s.revoked_at IS NULL
         AND s.expires_at > now()
       LIMIT 1`,
      [tokenHash]
    );

    const row = result.rows[0];
    if (!row) {
      throw new AppError(401, "session_expired", "세션이 만료되었습니다.");
    }

    req.auth = {
      player: publicPlayer({ id: row.player_id, nickname: row.nickname }),
      sessionId: row.session_id,
      tokenHash: row.token_hash
    };
    next();
  } catch (error) {
    next(error);
  }
}
