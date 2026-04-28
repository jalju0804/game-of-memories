# Agent Notes

This file records user feedback that should affect future work in this repository.
Read this before planning or implementing changes so repeated mistakes are not reintroduced.

## Standing Feedback

- Do not implement immediately when the user explicitly asks to discuss planning or implementation approach first.
- For this project, treat the app as a mini-game collection for AODS deployment validation, not as a single-game standalone app.
- `고기왕 곰찾기` is one mini-game inside the collection, not the whole product.
- Remove `순간 고기 반응` and `곰 카드 기억`; do not show coming-soon mini-game cards unless the user asks to add them back.
- The intended runtime architecture should include web, API server, and database persistence, even if that looks functionally excessive for a small game.
- Do not deploy the database through AODS for this project. AODS should deploy only `bear-feast-web` and `bear-feast-api`; the API must connect to the external/shared DB via `DATABASE_URL`. Keep the compose DB only for local development and CI smoke tests.
- Target production DB is the shared PXC/MySQL service `aolda-games-haproxy.shared.svc.cluster.local:3306`; do not document it as PostgreSQL. Current API code still uses PostgreSQL `pg`, so production DB support requires a MySQL adapter migration before deploying against that service.
- Keep AODS deployment concerns visible while planning: service IDs, container ports, multi-service configuration, registry images, and runtime environment settings.
- CI should continue to cover `npm ci`, `npm run check`, `npm run build`, Docker compose smoke testing, and manual GHCR image publishing for web/api only.
- Keep deployment env documentation in sync: `DEPLOY_ENV.md`, `apps/api/.env.example`, and `apps/web/.env.example`.
- Design the frontend and API so a future mobile app can reuse the same backend and game flow. Web is first, but avoid web-only assumptions in core game/session APIs.
- Frontend quality is a first-class requirement: polished visual design, smooth interactions, no noticeable jank, strong mobile responsiveness, clear loading/error/empty states, and game animations that feel intentional rather than placeholder-like.
- Preferred visual direction: retro Korean feature-phone mini-game feel with pixel art, inspired by early mobile games. Do not copy exact reference assets or UI, but pursue the same compact, colorful, forest-game, pixel-art mood.
- User-facing product branding should feel like `추억의 게임`, not `AOLDA Games`. Keep AODS/AOLDA naming only where it refers to deployment infrastructure or repository/service identifiers.
- Bear sprites and eating animations should be detailed enough to feel like real game art: clear pixel silhouettes, multiple eating frames, visible paws/mouth/meat motion, and readable urgency states.
- Before calling frontend implementation complete, run the actual web app in a browser and QA it with screenshots/captures, including at least auth/lobby/game screens and mobile-sized layout.
- When the user points out a mistake or preference, add it to this file so other agents can follow the same constraint later.

## Project Direction

- Build a browser mini-game collection. One included mini-game is `고기왕 곰찾기`, where bears eat meat during a timed animation, then the player identifies the bear that ate the most.
- Store gameplay results through the API and database so the deployment exercises web-to-api and api-to-db paths.
- Authentication scope is limited to required nickname + password signup/login. Do not add guest mode, social login, email login, or extra auth flows unless the user asks later.
- Prefer this AODS deployment shape:
  - `bear-feast-web`
  - `bear-feast-api`
- Keep [AODS_DEPLOYMENT.md](./AODS_DEPLOYMENT.md) as the deployment reference.

## Mini-Game: 고기왕 곰찾기

- The player watches bears eating meat for a fixed observation window, around 15 seconds.
- The answer choice UI should appear only after the observation timer ends.
- After observation ends, the player has a 5-second timed choice window. The UI should feel urgent and submit a timeout miss if no bear is selected.
- Eating animations should get faster as time passes within a round.
- A run should have about 5 normal rounds.
- Across the 5 rounds, the average eating interval should get faster each round.
- In later rounds, bear eating counts should become flatter and closer together so the correct bear is harder to identify.
- The player can continue to the next round only after a correct answer. Any wrong answer or timeout immediately completes the run and saves the record.
- Which bear eats the most must be randomized per round. Avoid fixed or easily learnable answer patterns.
- Use seeded randomness for round generation when possible so the server can own the answer while the client can replay the same eating animation deterministically.
