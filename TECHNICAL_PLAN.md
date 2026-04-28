# Technical Plan

## 1. Purpose

This project is a mini-game collection used to validate a realistic AODS deployment.

The app must exercise:

- Web frontend deployment
- API server deployment
- PostgreSQL database deployment
- Web to API networking
- API to DB networking
- Runtime environment configuration
- Authentication
- Persistent gameplay records
- Leaderboards

The frontend should feel like a polished retro pixel-art game service. See [FRONTEND_PLAN.md](./FRONTEND_PLAN.md).

## 2. Recommended Stack

### Web

- Vite
- React
- TypeScript
- Canvas for the game stage
- CSS modules or plain scoped CSS

Reasoning:

- Vite builds to static assets that nginx can serve on port `80`.
- React is useful for auth, lobby, ranking, and screen state.
- Canvas keeps game animation smooth and avoids per-frame DOM churn.
- TypeScript helps keep shared API contracts stable.

### API

- Node.js
- Express
- TypeScript
- `pg` for PostgreSQL
- Opaque bearer session tokens

Reasoning:

- Simple enough for a sample deployment app.
- Easy to containerize.
- Good fit for JSON APIs used by both web and future mobile clients.

### DB

- PostgreSQL

Reasoning:

- Better deployment validation than SQLite because it exercises real service networking.
- Familiar for auth, sessions, records, and leaderboards.

## 3. Repository Structure

Recommended structure:

```text
.
├── apps/
│   ├── web/
│   │   ├── src/
│   │   ├── public/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── vite.config.ts
│   └── api/
│       ├── src/
│       │   ├── config/
│       │   ├── db/
│       │   ├── routes/
│       │   ├── services/
│       │   ├── games/
│       │   ├── middleware/
│       │   └── server.ts
│       ├── package.json
│       └── tsconfig.json
├── db/
│   └── init.sql
├── docker/
│   ├── nginx.conf
│   └── postgres/
│       └── Dockerfile
├── Dockerfile.web
├── Dockerfile.api
├── docker-compose.yml
├── aolda_deploy.json
├── AODS_DEPLOYMENT.md
├── FRONTEND_PLAN.md
├── TECHNICAL_PLAN.md
└── AGENT_NOTES.md
```

Keep `docker/postgres/Dockerfile` and `docker-compose.yml` for local development and CI smoke tests only. DB is not deployed by AODS for this project.

## 4. Services

### `bear-feast-web`

Purpose:

- Serve the React/Vite frontend.

Container:

- Build web assets with Node.
- Serve `dist/` with nginx.
- Listen on port `80`.

Runtime env:

- `VITE_API_BASE_URL` at build time, or a runtime `config.json` loaded by the app.

Recommendation:

- Prefer runtime `config.json` if AODS makes runtime env easier than rebuilds.
- For the first version, `VITE_API_BASE_URL` is acceptable.

### `bear-feast-api`

Purpose:

- Auth
- Game sessions
- Round generation
- Guess validation
- Score calculation
- Result persistence
- Leaderboards
- Deployment diagnostics

Container:

- Node server.
- Listen on port `8080`.
- Bind to `0.0.0.0`.

Runtime env:

```text
NODE_ENV=production
PORT=8080
DATABASE_URL=postgres://bear_feast:<password>@<external-postgres-host>:5432/bear_feast
SESSION_TTL_DAYS=30
CORS_ORIGIN=<web-origin-or-*>
BUILD_SHA=<commit-sha>
API_VERSION=1.0.0
```

### PostgreSQL Database

Purpose:

- PostgreSQL database.

Deployment:

- Not deployed by AODS.
- Use an external or managed PostgreSQL instance.
- Inject the connection string into the API service as `DATABASE_URL`.
- Use `docker-compose.yml` DB only for local development and CI smoke tests.

Runtime env:

```text
DATABASE_URL=postgres://bear_feast:<password>@<external-postgres-host>:5432/bear_feast
```

Important AODS note:

- AODS deploy config should not include `bear-feast-db`.
- DB persistence and backups are handled outside AODS.
- API deploy will fail health checks if `DATABASE_URL` is missing or unreachable.

## 5. AODS Service IDs

Use DNS-1123 style lowercase service IDs:

```text
bear-feast-web
bear-feast-api
```

Initial `aolda_deploy.json` target:

```json
{
  "services": [
    {
      "serviceId": "bear-feast-web",
      "image": "ghcr.io/<github-org>/bear-feast-web:sha-<commit>",
      "port": 80,
      "replicas": 1,
      "strategy": "Rollout"
    },
    {
      "serviceId": "bear-feast-api",
      "image": "ghcr.io/<github-org>/bear-feast-api:sha-<commit>",
      "port": 8080,
      "replicas": 1,
      "strategy": "Rollout"
    }
  ]
}
```

Open question before production deployment:

- How AODS injects service environment variables.
- How AODS provides secrets.
- Which external PostgreSQL host will be used for production.
- How `DATABASE_URL` is stored and rotated in AODS secrets.

## 6. Authentication

V1 auth scope:

- Required signup/login.
- Nickname + password only.
- No guest mode.
- No social login.
- No email login.

### Password Storage

- Store password hashes only.
- Use bcrypt-compatible hashing with a cost appropriate for the runtime.
- Never store plain text passwords.

### Session Tokens

Use opaque bearer tokens:

```http
Authorization: Bearer <session_token>
```

Server behavior:

1. Generate a random token on login/signup.
2. Store only a SHA-256 hash of the token in `sessions`.
3. Return the plain token once to the client.
4. Client stores the token.
5. API middleware hashes incoming token and finds an active session.

This works for both web and future mobile clients.

### Auth Endpoints

```http
POST /api/auth/signup
POST /api/auth/login
POST /api/auth/logout
GET  /api/me
```

Signup request:

```json
{
  "nickname": "player1",
  "password": "secret"
}
```

Auth success response:

```json
{
  "token": "<session-token>",
  "player": {
    "id": "uuid",
    "nickname": "player1"
  }
}
```

## 7. Database Schema

Use UUID primary keys.

### `players`

```sql
CREATE TABLE players (
  id UUID PRIMARY KEY,
  nickname TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);
```

### `sessions`

```sql
CREATE TABLE sessions (
  id UUID PRIMARY KEY,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);
```

### `games`

```sql
CREATE TABLE games (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Seed row for V1:

```text
id: bear-feast
title: 고기왕 곰찾기
status: playable
```

### `game_sessions`

One row per play run.

```sql
CREATE TABLE game_sessions (
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
```

Statuses:

```text
active
completed
abandoned
```

### `rounds`

One row per generated round.

```sql
CREATE TABLE rounds (
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
```

### `guesses`

```sql
CREATE TABLE guesses (
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
```

Recommended indexes:

```sql
CREATE INDEX idx_game_sessions_player ON game_sessions(player_id);
CREATE INDEX idx_game_sessions_game_score ON game_sessions(game_id, total_score DESC);
CREATE INDEX idx_rounds_session ON rounds(session_id);
CREATE INDEX idx_guesses_player ON guesses(player_id);
```

## 8. API Design

### Health And Diagnostics

```http
GET /healthz
GET /api/diagnostics
```

`/healthz`:

- Returns `200` if the API process is alive.
- Should be lightweight.

`/api/diagnostics`:

- Checks API version.
- Checks DB connectivity with a simple query.
- Returns build SHA and DB schema version if available.

Example:

```json
{
  "web": "unknown",
  "api": "ok",
  "db": "ok",
  "apiVersion": "1.0.0",
  "buildSha": "abc1234",
  "dbSchema": "1"
}
```

### Games

```http
GET /api/games
GET /api/games/:gameId
```

Returns the playable V1 game for the lobby. Do not return coming-soon games unless they are added back intentionally.

### Bear Feast Session Flow

```http
POST /api/games/bear-feast/sessions
POST /api/games/bear-feast/sessions/:sessionId/rounds
POST /api/games/bear-feast/rounds/:roundId/guess
POST /api/games/bear-feast/sessions/:sessionId/finish
```

All require auth.

The client starts a 5-second choice timer after the observation phase. If it reaches
zero, submit `selectedBearId: "__timeout__"` so the server records a validated miss
instead of leaving the round unsubmitted.

### Records And Leaderboards

```http
GET /api/leaderboards?gameId=bear-feast
GET /api/me/stats
GET /api/me/sessions?gameId=bear-feast
```

Leaderboard ranking:

1. Highest total score
2. Highest reached round
3. Highest correct count
4. Earliest finished time as tie-breaker

## 9. Bear Feast Round Generation

The server owns game rules and answers.

The client renders only the round data returned by the server.

### Round Parameters

Observation duration:

```text
15000ms
```

Bear count:

```text
Rounds 1-2: 3 bears
Rounds 3-4: 4 bears
Round 5+: 5 bears
```

Base speed:

- Increases each round.
- Also accelerates inside each round.

Count spread:

- Early rounds have clearer differences.
- Later rounds flatten counts.
- Round 5+ should often have only 1-2 meat difference between top bears.

### Seeded Randomness

Each round gets a unique seed:

```text
<sessionId>:<roundNumber>:<serverRandom>
```

Use a deterministic PRNG from the seed to generate:

- Winning bear
- Bear count targets
- Eating event timings
- Minor timing jitter

Important:

- Winning bear must be randomized.
- Avoid answer patterns based on fixed position.
- Avoid always making the center bear strongest.

### Event Shape

API returns event data for animation:

```json
{
  "roundId": "uuid",
  "roundNumber": 3,
  "durationMs": 15000,
  "bears": [
    {
      "id": "bear-1",
      "label": "1",
      "skin": "brown",
      "accessory": "leaf"
    }
  ],
  "events": [
    {
      "t": 820,
      "bearId": "bear-2",
      "type": "eat"
    }
  ]
}
```

Do not include `answerBearId` or final counts in the round creation response.

Counts are revealed only after the guess is submitted.

### Flattening Strategy

Recommended target count spread:

```text
Round 1: winner ahead by 4-5
Round 2: winner ahead by 3-4
Round 3: winner ahead by 2-3
Round 4: winner ahead by 1-2
Round 5+: winner ahead by 1, sometimes tied non-winners just below
```

Avoid exact ties for first place in V1. Ties make the result feel unfair unless multi-answer support is added.

## 10. Scoring

Keep scoring easy to explain.

Recommended formula:

```text
if wrong:
  round_score = 0

if correct:
  round_score =
    100
    + round_number * 20
    + current_streak_after_guess * 10
```

Examples:

```text
Round 1 correct with streak 1: 130
Round 3 correct with streak 2: 180
Round 6 correct with streak 4: 260
```

Rationale:

- Round progress matters.
- Streak matters.
- Response-time scoring is intentionally omitted in V1 because the main skill is observation, not fast clicking.

Optional future extension:

- Add a small response-time bonus after the choosing phase exists and feels fair.

## 11. Game Progression

Rules:

```text
Rounds 1-5:
  Continue regardless of correctness.

Rounds 6+:
  Correct answer -> next round.
  Wrong answer -> finish run.
```

Session completion:

- A run ends after a wrong answer on round 6+.
- A user may also leave, creating an abandoned session.
- Final result page should show saved session stats.

## 12. Web Rendering Strategy

Use React for screens and UI.

Use Canvas for the game stage:

- Pixel forest background
- Bears
- Meat events
- Eating animation
- Countdown overlay if convenient

Avoid:

- Per-frame React state updates.
- Per-frame DOM layout changes.
- Rendering each meat event as a large DOM tree.

Recommended game loop:

```text
load round data
preload sprites
countdown
start requestAnimationFrame loop
render events according to elapsed time
stop at durationMs
show choice UI with 5s timer and urgent animation
submit guess or timeout miss
show result
```

## 13. Local Development

Recommended ports:

```text
web: http://localhost:5173
api: http://localhost:8080
db:  localhost:5432
```

Docker Compose should run:

- `web`
- `api`
- `db`

Local web env:

```text
VITE_API_BASE_URL=http://localhost:8080
```

Local API env:

```text
DATABASE_URL=postgres://bear_feast:bear_feast@db:5432/bear_feast
CORS_ORIGIN=http://localhost:5173
```

## 14. Docker Plan

### `Dockerfile.web`

Stages:

1. Install dependencies.
2. Build Vite app.
3. Copy `dist/` into nginx.
4. Expose port `80`.

Nginx must support SPA fallback:

```text
try_files $uri $uri/ /index.html;
```

### `Dockerfile.api`

Stages:

1. Install dependencies.
2. Build TypeScript.
3. Run production server.
4. Expose port `8080`.

Server must bind:

```text
0.0.0.0:8080
```

### DB Image

For AODS image-based deployment:

- Use a small custom image based on `postgres`.
- Copy `db/init.sql` into `/docker-entrypoint-initdb.d/`.

For local development:

- Official `postgres` image is fine.

## 15. Migrations

V1 can use simple SQL initialization:

```text
db/init.sql
```

The API should also run idempotent startup checks:

- Ensure required tables exist.
- Seed `games` rows.
- Record schema version.

For later versions, move to a proper migration system.

## 16. Security Baseline

This is a game, but auth still needs basic correctness.

Requirements:

- Hash passwords.
- Hash session tokens in DB.
- Validate nickname length and characters.
- Validate request bodies.
- Use parameterized SQL only.
- Do not leak stack traces in production responses.
- Use CORS allowlist in production.
- Rate limit auth endpoints if practical.

Nickname validation:

```text
2-16 characters
Korean, English letters, numbers, underscore allowed
Trim whitespace
Unique case-insensitively if feasible
```

Password validation:

```text
Minimum 4 or 6 characters for V1
Maximum 128 characters
```

## 17. Testing Plan

### API

Test:

- Signup success
- Duplicate nickname
- Login success
- Invalid login
- Auth middleware
- Create session
- Create round
- Guess correct
- Guess wrong
- Round 1-5 continue behavior
- Round 6+ wrong ends run
- Leaderboard ordering
- Diagnostics DB failure handling

### Web

Test manually or with browser automation:

- Mobile auth flow
- Login required before lobby
- Lobby loads games and records
- Game starts
- Observation phase hides choices
- Choices appear after timer
- Guess submits once
- Result screen shows counts
- Final result saves
- Leaderboard persists after refresh
- API offline state is visible

### Deployment

Test:

- `docker-compose up` works locally.
- Web can call API.
- API can call DB.
- DB data persists across API restart.
- AODS `serviceId` matches `repositoryServiceId`.
- Container ports match `aolda_deploy.json`.
- Frontend does not use localhost in production.

## 18. V1 Cut Line

V1 includes:

- Web, API, DB services
- Required nickname/password auth
- Mini-game lobby
- Playable `고기왕 곰찾기`
- Server-generated rounds
- Server-validated guesses
- Saved sessions and guesses
- Leaderboard
- My stats
- AODS diagnostics panel
- Docker Compose
- AODS deploy config

V1 excludes:

- Native mobile app
- Multiple playable mini-games
- Social login
- Email verification
- Payment
- Realtime multiplayer
- Admin panel
- Complex anti-cheat
- Production-grade migration framework

## 19. Known Risks

### AODS DB persistence

If AODS does not support persistent volumes for DB services, leaderboard data may disappear on redeploy.

Decision:

- Accept for deployment validation.
- Document as not production-persistent.

### Runtime API URL

If the web image is built with a fixed API URL, the same image may not move cleanly across environments.

Decision:

- V1 can use `VITE_API_BASE_URL`.
- Prefer runtime config later.

### Game fairness

If later rounds flatten counts too aggressively, users may feel the result is random.

Decision:

- Avoid first-place ties.
- Reveal counts after guesses.
- Keep eating events visually readable.

### Pixel art quality

Bad pixel art will look worse than clean simple UI.

Decision:

- Keep sprite scope small.
- Use consistent pixel density.
- Prioritize readability and smoothness.

## 20. Implementation Order

Recommended order:

1. Scaffold `apps/web`, `apps/api`, and DB init.
2. Implement API health and diagnostics.
3. Implement DB connection and schema setup.
4. Implement auth.
5. Implement lobby APIs.
6. Implement Bear Feast round generation.
7. Implement guess validation and scoring.
8. Implement web auth screens.
9. Implement lobby.
10. Implement Canvas game loop.
11. Implement result and leaderboard screens.
12. Add Dockerfiles and `docker-compose.yml`.
13. Add `aolda_deploy.json`.
14. Run local full-stack verification.
15. Polish mobile layout and animation smoothness.
