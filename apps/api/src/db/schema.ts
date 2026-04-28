import { query } from "./pool";

const schemaSql = `
CREATE TABLE IF NOT EXISTS players (
  id UUID PRIMARY KEY,
  nickname TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_players_nickname_lower
  ON players (lower(nickname));

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sessions_player ON sessions(player_id);

CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS game_sessions (
  id UUID PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  total_score INTEGER NOT NULL DEFAULT 0,
  reached_round INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  best_streak INTEGER NOT NULL DEFAULT 0,
  current_streak INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_game_sessions_player ON game_sessions(player_id);
CREATE INDEX IF NOT EXISTS idx_game_sessions_game_score
  ON game_sessions(game_id, total_score DESC);

CREATE TABLE IF NOT EXISTS rounds (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  seed TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  bear_count INTEGER NOT NULL,
  answer_bear_id TEXT NOT NULL,
  bear_counts_json JSONB NOT NULL,
  events_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(session_id, round_number)
);

CREATE INDEX IF NOT EXISTS idx_rounds_session ON rounds(session_id);

CREATE TABLE IF NOT EXISTS guesses (
  id UUID PRIMARY KEY,
  round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  selected_bear_id TEXT NOT NULL,
  correct BOOLEAN NOT NULL,
  score INTEGER NOT NULL,
  response_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(round_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_guesses_player ON guesses(player_id);

CREATE TABLE IF NOT EXISTS app_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

export async function ensureSchema(): Promise<void> {
  await query(schemaSql);
  await query(
    `INSERT INTO games (id, title, status)
     VALUES
       ('bear-feast', '고기왕 곰찾기', 'playable')
     ON CONFLICT (id) DO UPDATE
       SET title = EXCLUDED.title,
           status = EXCLUDED.status`
  );
  await query(`DELETE FROM games WHERE id <> 'bear-feast'`);
  await query(
    `INSERT INTO app_metadata (key, value)
     VALUES ('db_schema', '1')
     ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value,
           updated_at = now()`
  );
}

export async function waitForDatabase(maxAttempts = 30): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await query("SELECT 1");
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw lastError;
}
