import { randomUUID } from "crypto";
import { Router } from "express";
import { query } from "../db/pool";
import { requireAuth } from "../middleware/auth";
import { AppError, asyncHandler } from "../services/errors";
import {
  createSession,
  hashPassword,
  normalizeNickname,
  publicPlayer,
  readPassword,
  verifyPassword
} from "../services/security";

interface PlayerRow {
  id: string;
  nickname: string;
  password_hash: string;
}

export const authRouter = Router();

authRouter.post(
  "/signup",
  asyncHandler(async (req, res) => {
    const nickname = normalizeNickname(req.body?.nickname);
    const password = readPassword(req.body?.password);
    const passwordHash = await hashPassword(password);
    const id = randomUUID();

    try {
      const inserted = await query<PlayerRow>(
        `INSERT INTO players (id, nickname, password_hash, last_login_at)
         VALUES ($1, $2, $3, now())
         RETURNING id, nickname, password_hash`,
        [id, nickname, passwordHash]
      );
      const player = publicPlayer(inserted.rows[0]);
      const session = await createSession(player.id);
      res.status(201).json({ token: session.token, player });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23505"
      ) {
        throw new AppError(409, "nickname_taken", "이미 사용 중인 닉네임입니다.");
      }
      throw error;
    }
  })
);

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const nickname = normalizeNickname(req.body?.nickname);
    const password = readPassword(req.body?.password);
    const result = await query<PlayerRow>(
      `SELECT id, nickname, password_hash
       FROM players
       WHERE lower(nickname) = lower($1)
       LIMIT 1`,
      [nickname]
    );
    const row = result.rows[0];
    if (!row || !(await verifyPassword(password, row.password_hash))) {
      throw new AppError(401, "invalid_credentials", "닉네임 또는 비밀번호가 올바르지 않습니다.");
    }

    await query(`UPDATE players SET last_login_at = now() WHERE id = $1`, [row.id]);
    const session = await createSession(row.id);
    res.json({ token: session.token, player: publicPlayer(row) });
  })
);

authRouter.post(
  "/logout",
  requireAuth,
  asyncHandler(async (req, res) => {
    await query(`UPDATE sessions SET revoked_at = now() WHERE id = $1`, [
      req.auth?.sessionId
    ]);
    res.status(204).send();
  })
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ player: req.auth?.player });
  })
);
