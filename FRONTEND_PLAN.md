# Frontend Plan

## 1. Goal

This app is a mini-game collection built to validate AODS deployments while still feeling like a polished game service.

The frontend must not look like an infra demo. Users should experience it as a compact retro arcade app with login, a game lobby, one complete mini-game, records, and rankings.

V1 focuses on:

- Required nickname + password signup/login
- Mini-game lobby
- One complete mini-game: `고기왕 곰찾기`
- Player records and leaderboard
- AODS deployment status panel
- Mobile-first responsive layout
- Pixel-art visual direction inspired by early Korean feature-phone mini-games

## 2. Product Shape

The product is a mini-game collection, not a single-game page.

Initial game list:

| Game | Status | Notes |
| --- | --- | --- |
| `고기왕 곰찾기` | Playable | 15-second observation game where the player finds the bear that ate the most meat. |

The lobby should focus on the single playable V1 game. Do not show coming-soon cards.

## 3. Visual Direction

Target mood:

```text
Retro Korean feature-phone mini-game
+ pixel forest
+ compact arcade HUD
+ cute but not childish
+ colorful but readable
+ polished, not placeholder
```

The provided reference image should guide mood only. Do not copy exact assets, UI, characters, layouts, or text.

### Pixel Art Rules

- Use a fixed internal game resolution, recommended `320x480` or `360x540`.
- Scale the game area with integer-friendly sizing where possible.
- Use `image-rendering: pixelated` for canvas and sprite assets.
- Avoid blurry scaled raster images.
- Keep all sprites, UI borders, panels, and icons in the same pixel density.
- Avoid modern glassmorphism, soft bokeh, gradient blobs, or generic SaaS card styling.
- Use strong pixel borders, small HUD panels, compact labels, and arcade result text.

### Color Direction

Use a forest arcade palette:

- Leaf green and deep moss for background
- Warm tan and wood brown for panels
- Meat red as an accent
- Sky cyan or light blue for HUD highlights
- Cream or off-white for readable text
- Dark ink/navy for dialog boxes

Avoid making the entire UI one hue. The app should not become only green or only brown.

### Typography

- Prefer a pixel-style display font for headings and game HUD if available.
- Use a highly readable fallback for body text and forms.
- Do not let pixel styling make form labels, rankings, or error messages hard to read.
- Keep letter spacing at `0`.
- Do not scale font sizes directly with viewport width.

## 4. Screen Inventory

Recommended frontend screens:

```text
BootScreen
AuthScreen
LobbyScreen
GameDetailScreen
BearGameScreen
RoundResultScreen
FinalResultScreen
LeaderboardScreen
```

`BearGameScreen` owns these internal states:

```text
idle
loading_round
countdown
observing
choosing
submitting_guess
round_result
final_result
error
```

## 5. User Flow

### 5.1 App Boot

Purpose: confirm the service is reachable and decide where the user goes.

Flow:

1. Show compact pixel loading screen.
2. Check API health.
3. If a stored token exists, request current user.
4. If authenticated, route to lobby.
5. If unauthenticated, route to auth screen.
6. If API is unavailable, show retry state.

Required states:

- Loading
- API unavailable
- Session expired
- Retry

### 5.2 Auth

Purpose: users must sign up or log in before playing.

Tabs:

- Login
- Signup

Login fields:

- Nickname
- Password

Signup fields:

- Nickname
- Password
- Confirm password

Rules:

- No guest mode.
- No email login.
- No social login.
- No optional auth bypass.
- Successful auth routes to lobby.

UX requirements:

- Forms must be usable on small mobile screens.
- Submit button must show loading state.
- Errors should be short and specific.
- Password mismatch is handled before calling API.
- Nickname already exists is shown clearly.
- Invalid credentials does not reveal whether nickname or password was wrong.

### 5.3 Lobby

Purpose: establish this as a mini-game collection.

Layout:

- Top bar with app name, player nickname, logout button
- Main playable game card for `고기왕 곰찾기`
- My record summary
- Leaderboard preview
- Small AODS deployment status panel

Primary actions:

- Play `고기왕 곰찾기`
- View leaderboard
- Logout

Game card content:

- Pixel art preview
- Game title
- One-line rule
- My best score
- Play button

### 5.4 Game Detail

Purpose: prepare the player before starting.

Content:

- `고기왕 곰찾기` title
- Pixel game preview
- Rules summary
- My best result
- Today or all-time leaderboard preview
- Start button

Rules text should be compact:

```text
15초 동안 곰들을 관찰하세요.
시간이 끝나면 5초 안에 가장 많이 먹은 곰을 고릅니다.
5라운드 이후는 정답일 때만 계속 진행됩니다.
```

### 5.5 Bear Game: Countdown

Purpose: focus the player before observation starts.

Display:

- Round number
- Difficulty hint
- Large `3, 2, 1`
- Bears may appear in position before the timer starts

The countdown should feel like a game, not a web loading spinner.

### 5.6 Bear Game: Observing

Purpose: core gameplay.

Display:

- Top HUD
  - Round number
  - 15-second timer
  - Current score
  - Streak
- Pixel forest stage
- Bears in clear positions
- Meat eating animations
- No selection UI
- No visible eaten count

Rules:

- Observation duration is around 15 seconds.
- Eating animations get faster within the same round.
- Average eating interval gets faster each round.
- Later rounds flatten bear counts so the winning bear is harder to identify.
- The bear that eats the most is randomized per round.
- Client renders the server-provided seeded pattern.

Interaction:

- Player should not be able to choose during observation.
- Taps/clicks on bears during observation may produce harmless feedback, but must not submit an answer.

Animation requirements:

- Each eating event must be visually readable.
- Bear body or mouth should pop/twitch on eating.
- Meat icon should appear/disappear or move into the bear.
- Use short frame-based animation, not vague pulsing.
- Later speed increases should be felt without becoming unreadable.

### 5.7 Bear Game: Choosing

Purpose: player chooses the bear that ate the most.

Display:

- Prompt: `가장 많이 먹은 곰은?`
- Same bear positions as observation
- Clear selectable bear buttons or hit areas
- Required 5-second choice timer
- Urgent animation as the timer runs down

Rules:

- Counts remain hidden until after submission.
- Selected bear should get immediate visual feedback.
- Submit once only.
- While submitting, disable all choices.
- If time reaches 0 before selection, submit a timeout miss.

### 5.8 Round Result

Purpose: make the outcome understandable and fair.

Display:

- `GOOD` for correct, `MISS` for wrong
- Selected bear
- Correct bear
- Bear-by-bear meat count
- Score gained
- Current total score
- Current streak
- Next action

Recommended visual:

- Pixel result stamp
- Small bar chart for counts
- Correct bear highlighted
- Player choice marker

Progression:

- Rounds 1 to 5: continue regardless of correctness.
- Round 6 and later: continue only when correct.
- Wrong answer after round 5 ends the run.

### 5.9 Final Result

Purpose: show achievement and push replay.

Display:

- Total score
- Highest reached round
- Correct answer count
- Best streak
- New personal best indicator
- Leaderboard rank if available

Actions:

- Play again
- Back to lobby
- View leaderboard

The final result must be saved through the API before showing the run as complete. If saving fails, show a clear retry state.

### 5.10 Leaderboard

Purpose: give the game replay value and prove DB persistence.

Tabs:

- All-time
- My records
- Recent plays

Columns:

- Rank
- Nickname
- Score
- Reached round
- Correct count
- Date

Mobile:

- Use stacked rows or compact cards instead of a wide table.
- Keep rank, nickname, and score most prominent.

### 5.11 AODS Status Panel

Purpose: make deployment health visible without turning the app into an admin tool.

Location:

- Lobby footer or small diagnostics drawer

Display:

```text
Web OK
API OK
DB OK
Build sha: <sha>
API version: <version>
DB schema: <version>
```

Rules:

- Keep it small.
- It should help debugging AODS deployments.
- It should not dominate the game UI.

## 6. Component Plan

Core UI components:

- `PixelShell`
- `PixelPanel`
- `PixelButton`
- `PixelInput`
- `PixelTabs`
- `StatusBadge`
- `GameCard`
- `LeaderboardList`
- `RecordSummary`
- `AodsStatusPanel`
- `ErrorNotice`
- `LoadingPanel`

Game-specific components:

- `GameHud`
- `PixelStage`
- `BearSprite`
- `MeatSprite`
- `CountdownOverlay`
- `ChoiceOverlay`
- `RoundResultPanel`
- `CountBarChart`

Implementation note:

The game animation loop should not depend on frequent React or DOM state updates. Keep high-frequency animation in Canvas or transform-driven sprite layers. UI state can update on meaningful transitions only.

## 7. Layout And Responsiveness

Primary target is mobile portrait.

Recommended breakpoints:

```text
small: 320px to 480px
medium: 481px to 768px
large: 769px and above
```

Mobile rules:

- Single-column layout.
- Full-width auth form within safe margins.
- Large touch targets, minimum 44px height.
- Game stage centered and scaled to fit.
- Important actions near the bottom.
- No horizontal scrolling.
- No text clipped inside buttons or cards.

Desktop rules:

- Center a phone-like game frame.
- Use side panels for records or leaderboard previews.
- Do not stretch the game canvas until it looks blurry.
- Keep the retro handheld-game feeling.

Game stage sizing:

```text
Internal game size: 320x480 or 360x540
Displayed size: max that fits viewport while preserving aspect ratio
Scaling: pixelated
```

## 8. API State Handling

Frontend must handle:

- Initial API offline
- Login failure
- Signup nickname conflict
- Session expired
- Round creation failure
- Guess submission failure
- Result save failure
- Leaderboard loading failure
- Empty leaderboard

The app should never show a blank screen for API errors.

Error UI should provide:

- What happened
- Whether the player can retry
- A safe navigation path back to lobby or auth

## 9. Performance Standards

The game should feel smooth on mobile.

Requirements:

- Use `requestAnimationFrame` for game animation.
- Avoid per-frame layout reads and writes.
- Avoid per-frame React state updates.
- Preload sprites and audio before a round starts.
- Keep animation assets small.
- Use CSS transforms for UI transitions.
- Keep canvas internal resolution modest.
- Do not block the main thread during a round.

Quality target:

- No noticeable jank during observation.
- No layout shift when API data arrives.
- Button taps should respond immediately.
- Screen transitions should feel intentional.

## 10. Mobile App Compatibility

Web comes first, but the design should not block a future mobile app.

Rules:

- Keep API client logic separate from UI components.
- Keep game state model explicit and serializable.
- Keep auth token handling abstracted.
- Do not tie server APIs to browser route names.
- Keep server-owned game rules. Clients render and submit, server validates.
- Avoid web-only assumptions in game session data.

Future mobile app should be able to reuse:

- Auth API
- Game list API
- Session API
- Round API
- Guess submission API
- Leaderboard API
- Game state machine

## 11. Accessibility And Usability

Even with pixel styling, the app must remain usable.

Requirements:

- High contrast text on panels.
- Clear focus states for form controls and buttons.
- Buttons have readable labels.
- Error messages are visible near the relevant form.
- Touch targets are large enough.
- Game color differences should not be the only way to identify bears.

Bear differentiation should combine:

- Color
- Position
- Small accessory or mark
- Label shown during choosing if needed

## 12. Sound

Sound is optional for V1, but the design should allow it later.

If included:

- Meat eating blip
- Countdown tick
- Correct result sound
- Miss result sound
- Mute toggle

Do not require sound to play the game.

## 13. V1 Cut Line

Must include:

- Login and signup
- Lobby
- Playable `고기왕 곰찾기`
- 15-second observation
- Round progression
- Result screen
- Final result
- Leaderboard and my records
- AODS status panel
- Mobile-responsive layout
- Pixel-art visual direction

Do not include in V1:

- Guest mode
- Social login
- Email verification
- Real-time multiplayer
- Chat
- Avatar shop
- Currency system
- Full native mobile app
- Multiple playable mini-games

## 14. Implementation Checklist

Before calling the frontend complete, verify:

- Auth flow works on mobile and desktop.
- User cannot play without login.
- Lobby clearly looks like a mini-game collection.
- `고기왕 곰찾기` can be completed from start to final result.
- Observation phase has no answer buttons.
- Choice UI appears only after observation ends.
- Rounds get faster over time.
- Later rounds produce closer bear counts.
- Correct bear is not predictable by position.
- Result screen explains the outcome.
- Leaderboard data persists after refresh.
- API offline state is understandable.
- DB failure appears in diagnostics.
- No visible layout overlap on mobile.
- No clipped button text.
- No noticeable animation jank during a round.
- Pixel art remains crisp when scaled.
