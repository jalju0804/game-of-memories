import bcrypt from "bcryptjs";
import { createHash, randomBytes, randomUUID } from "crypto";
import { env } from "../config/env";
import { query } from "../db/pool";
import { AppError } from "./errors";

export interface Player {
  id: string;
  nickname: string;
}

export interface SessionRecord {
  id: string;
  playerId: string;
  token: string;
  expiresAt: Date;
}

export function normalizeNickname(input: unknown): string {
  if (typeof input !== "string") {
    throw new AppError(400, "invalid_nickname", "닉네임을 입력해주세요.");
  }
  const nickname = input.trim();
  const isValid = /^[\p{Script=Hangul}A-Za-z0-9_]{2,16}$/u.test(nickname);
  if (!isValid) {
    throw new AppError(
      400,
      "invalid_nickname",
      "닉네임은 2-16자의 한글, 영문, 숫자, 밑줄만 사용할 수 있습니다."
    );
  }
  return nickname;
}

export function readPassword(input: unknown): string {
  if (typeof input !== "string") {
    throw new AppError(400, "invalid_password", "비밀번호를 입력해주세요.");
  }
  if (input.length < 4 || input.length > 128) {
    throw new AppError(
      400,
      "invalid_password",
      "비밀번호는 4-128자로 입력해주세요."
    );
  }
  return input;
}

export function publicPlayer(row: { id: string; nickname: string }): Player {
  return {
    id: row.id,
    nickname: row.nickname
  };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(
  password: string,
  passwordHash: string
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export async function createSession(playerId: string): Promise<SessionRecord> {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(
    Date.now() + env.sessionTtlDays * 24 * 60 * 60 * 1000
  );
  const id = randomUUID();

  await query(
    `INSERT INTO sessions (id, player_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [id, playerId, tokenHash, expiresAt]
  );

  return {
    id,
    playerId,
    token,
    expiresAt
  };
}
