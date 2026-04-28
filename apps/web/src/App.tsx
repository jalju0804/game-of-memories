import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiClient, ApiError, tokenStore } from "./api";
import type {
  BearInfo,
  Diagnostics,
  EatEvent,
  GameInfo,
  GameSession,
  GuessResult,
  LeaderboardEntry,
  Player,
  PlayerStats,
  RecentSession,
  RoundData
} from "./types";

type Screen = "boot" | "auth" | "lobby" | "detail" | "game" | "leaderboard";
type AuthMode = "login" | "signup";
type GamePhase =
  | "loading_round"
  | "countdown"
  | "observing"
  | "choosing"
  | "submitting_guess"
  | "round_result"
  | "final_result"
  | "error";

const CHOICE_DURATION_MS = 5000;
const TIMEOUT_BEAR_ID = "__timeout__";

const emptyStats: PlayerStats = {
  bestScore: 0,
  bestRound: 0,
  bestStreak: 0,
  plays: 0
};

export function App() {
  const [token, setToken] = useState<string | null>(() => tokenStore.get());
  const api = useMemo(() => new ApiClient(token), []);
  const [screen, setScreen] = useState<Screen>("boot");
  const [player, setPlayer] = useState<Player | null>(null);
  const [games, setGames] = useState<GameInfo[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [stats, setStats] = useState<PlayerStats>(emptyStats);
  const [recent, setRecent] = useState<RecentSession[]>([]);
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [bootError, setBootError] = useState("");

  useEffect(() => {
    api.setToken(token);
  }, [api, token]);

  const loadDashboard = useCallback(async () => {
    const [gamesData, leaderboardData, statsData, recentData, diagnosticsData] =
      await Promise.all([
        api.games(),
        api.leaderboard(),
        api.stats(),
        api.recentSessions(),
        api.diagnostics()
      ]);
    setGames(gamesData.games);
    setLeaderboard(leaderboardData.leaderboard);
    setStats(statsData.stats);
    setRecent(recentData.sessions);
    setDiagnostics(diagnosticsData);
  }, [api]);

  const boot = useCallback(async () => {
    setBootError("");
    try {
      await api.health();
      const storedToken = tokenStore.get();
      if (!storedToken) {
        setScreen("auth");
        return;
      }
      api.setToken(storedToken);
      setToken(storedToken);
      const me = await api.me();
      setPlayer(me.player);
      await loadDashboard();
      setScreen("lobby");
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        tokenStore.clear();
        setToken(null);
        setPlayer(null);
        setScreen("auth");
        return;
      }
      setBootError("API에 연결할 수 없습니다. 서버와 DB가 떠 있는지 확인해주세요.");
      setScreen("boot");
    }
  }, [api, loadDashboard]);

  useEffect(() => {
    void boot();
  }, [boot]);

  async function handleAuthenticated(nextToken: string, nextPlayer: Player) {
    tokenStore.set(nextToken);
    setToken(nextToken);
    api.setToken(nextToken);
    setPlayer(nextPlayer);
    await loadDashboard();
    setScreen("lobby");
  }

  async function handleLogout() {
    try {
      await api.logout();
    } catch {
      // Local logout still matters if the API session is already gone.
    }
    tokenStore.clear();
    setToken(null);
    setPlayer(null);
    setScreen("auth");
  }

  if (screen === "boot") {
    return <BootScreen error={bootError} onRetry={boot} />;
  }

  if (!player || screen === "auth") {
    return <AuthScreen api={api} onAuthenticated={handleAuthenticated} />;
  }

  return (
    <PixelShell
      player={player}
      screen={screen}
      onLobby={() => setScreen("lobby")}
      onLeaderboard={() => setScreen("leaderboard")}
      onLogout={handleLogout}
    >
      {screen === "lobby" && (
        <LobbyScreen
          games={games}
          stats={stats}
          leaderboard={leaderboard}
          diagnostics={diagnostics}
          onPlay={() => setScreen("detail")}
          onLeaderboard={() => setScreen("leaderboard")}
        />
      )}
      {screen === "detail" && (
        <GameDetailScreen
          stats={stats}
          leaderboard={leaderboard}
          onBack={() => setScreen("lobby")}
          onStart={() => setScreen("game")}
        />
      )}
      {screen === "game" && (
        <BearGameScreen
          api={api}
          recent={recent}
          onExit={async () => {
            await loadDashboard();
            setScreen("lobby");
          }}
          onFinished={loadDashboard}
        />
      )}
      {screen === "leaderboard" && (
        <LeaderboardScreen
          leaderboard={leaderboard}
          recent={recent}
          stats={stats}
          onRefresh={loadDashboard}
        />
      )}
    </PixelShell>
  );
}

function BootScreen({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <main className="boot-screen">
      <section className="boot-card pixel-panel">
        <div className="app-mark">추억</div>
        <h1>추억의 게임</h1>
        <p>배포 상태를 깨우는 중...</p>
        {error ? <p className="error-text">{error}</p> : <div className="pixel-loader" />}
        {error && (
          <button className="pixel-button primary" onClick={onRetry}>
            다시 연결
          </button>
        )}
      </section>
    </main>
  );
}

function AuthScreen({
  api,
  onAuthenticated
}: {
  api: ApiClient;
  onAuthenticated: (token: string, player: Player) => Promise<void>;
}) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (mode === "signup" && password !== confirm) {
      setError("비밀번호 확인이 일치하지 않습니다.");
      return;
    }
    setLoading(true);
    try {
      const result =
        mode === "signup"
          ? await api.signup(nickname, password)
          : await api.login(nickname, password);
      await onAuthenticated(result.token, result.player);
    } catch (err) {
      setError(err instanceof Error ? err.message : "인증에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-screen">
      <section className="phone-frame auth-frame">
        <div className="pixel-hud">
          <span>RETRO GAME</span>
          <span>9:02</span>
        </div>
        <div className="auth-hero">
          <div className="pixel-logo">추억</div>
          <h1>추억의 게임</h1>
          <p>닉네임과 비밀번호로 입장하세요.</p>
        </div>

        <div className="pixel-tabs">
          <button
            className={mode === "login" ? "active" : ""}
            onClick={() => setMode("login")}
          >
            로그인
          </button>
          <button
            className={mode === "signup" ? "active" : ""}
            onClick={() => setMode("signup")}
          >
            회원가입
          </button>
        </div>

        <form className="auth-form" onSubmit={submit}>
          <label>
            닉네임
            <input
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              autoComplete="username"
              placeholder="곰사냥꾼"
              required
            />
          </label>
          <label>
            비밀번호
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              placeholder="4자 이상"
              required
            />
          </label>
          {mode === "signup" && (
            <label>
              비밀번호 확인
              <input
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                type="password"
                autoComplete="new-password"
                required
              />
            </label>
          )}
          {error && <p className="error-text">{error}</p>}
          <button className="pixel-button primary" disabled={loading}>
            {loading ? "처리 중..." : mode === "signup" ? "가입하고 입장" : "입장"}
          </button>
        </form>
      </section>
    </main>
  );
}

function PixelShell({
  player,
  screen,
  children,
  onLobby,
  onLeaderboard,
  onLogout
}: {
  player: Player;
  screen: Screen;
  children: React.ReactNode;
  onLobby: () => void;
  onLeaderboard: () => void;
  onLogout: () => void;
}) {
  return (
    <main className="app-shell">
      <header className="top-nav">
        <button className="brand-button" onClick={onLobby}>
          <span className="brand-dot" />
          추억의 게임
        </button>
        <div className="nav-actions">
          <button
            className={screen === "leaderboard" ? "nav-link active" : "nav-link"}
            onClick={onLeaderboard}
          >
            랭킹
          </button>
          <span className="player-chip">{player.nickname}</span>
          <button className="nav-link" onClick={onLogout}>
            로그아웃
          </button>
        </div>
      </header>
      {children}
    </main>
  );
}

function LobbyScreen({
  games,
  stats,
  leaderboard,
  diagnostics,
  onPlay,
  onLeaderboard
}: {
  games: GameInfo[];
  stats: PlayerStats;
  leaderboard: LeaderboardEntry[];
  diagnostics: Diagnostics | null;
  onPlay: () => void;
  onLeaderboard: () => void;
}) {
  return (
    <div className="dashboard-grid">
      <section className="hero-panel pixel-panel">
        <div>
          <p className="eyebrow">RETRO MINI GAME</p>
          <h1>오늘의 고기왕을 찾아라</h1>
          <p>
            15초 동안 곰들의 폭식을 관찰하고, 가장 많이 먹은 곰을 골라 기록을
            남기세요.
          </p>
        </div>
        <button className="pixel-button primary" onClick={onPlay}>
          바로 플레이
        </button>
      </section>

      <section className="game-list">
        {games.map((game) => (
          <article
            key={game.id}
            className={game.status === "playable" ? "game-card playable" : "game-card"}
          >
            <MiniPreview />
            <div>
              <h2>{game.title}</h2>
              <p>가장 많이 먹은 곰을 찾는 관찰 게임</p>
            </div>
            <button
              className="pixel-button"
              onClick={onPlay}
            >
              선택
            </button>
          </article>
        ))}
      </section>

      <aside className="side-stack">
        <RecordSummary stats={stats} />
        <LeaderboardPreview leaderboard={leaderboard} onOpen={onLeaderboard} />
        <AodsStatus diagnostics={diagnostics} />
      </aside>
    </div>
  );
}

function MiniPreview() {
  return (
    <div className="game-preview bear-feast" aria-hidden="true">
      <span className="mini-tree left" />
      <span className="mini-tree right" />
      <span className="mini-bear a" />
      <span className="mini-bear b" />
      <span className="mini-meat" />
    </div>
  );
}

function GameDetailScreen({
  stats,
  leaderboard,
  onBack,
  onStart
}: {
  stats: PlayerStats;
  leaderboard: LeaderboardEntry[];
  onBack: () => void;
  onStart: () => void;
}) {
  return (
    <div className="detail-layout">
      <section className="phone-frame detail-phone">
        <div className="pixel-hud">
          <span>ROUND READY</span>
          <span>15 SEC</span>
        </div>
        <div className="forest-preview">
          <div className="preview-bear one" />
          <div className="preview-bear two" />
          <div className="preview-bear three" />
          <div className="preview-meat" />
        </div>
        <div className="pixel-dialog">
          가장 고기를 많이 먹은 곰을 선택하라!
        </div>
      </section>
      <section className="pixel-panel detail-copy">
        <p className="eyebrow">PLAYABLE MINI GAME</p>
        <h1>고기왕 곰찾기</h1>
        <p>15초 동안 곰들을 관찰하세요. 시간이 끝나면 5초 안에 가장 많이 먹은 곰을 고릅니다.</p>
        <ul className="rule-list">
          <li>5라운드까지는 기본 코스입니다.</li>
          <li>라운드가 올라갈수록 먹는 속도가 빨라집니다.</li>
          <li>6라운드부터는 오답이면 기록이 확정됩니다.</li>
        </ul>
        <div className="detail-stats">
          <span>최고 점수 {stats.bestScore}</span>
          <span>최고 라운드 {stats.bestRound}</span>
          <span>최고 연속 {stats.bestStreak}</span>
        </div>
        <div className="button-row">
          <button className="pixel-button" onClick={onBack}>
            허브로
          </button>
          <button className="pixel-button primary" onClick={onStart}>
            게임 시작
          </button>
        </div>
        <LeaderboardPreview leaderboard={leaderboard.slice(0, 3)} compact />
      </section>
    </div>
  );
}

function BearGameScreen({
  api,
  recent,
  onExit,
  onFinished
}: {
  api: ApiClient;
  recent: RecentSession[];
  onExit: () => Promise<void>;
  onFinished: () => Promise<void>;
}) {
  const [phase, setPhase] = useState<GamePhase>("loading_round");
  const [session, setSession] = useState<GameSession | null>(null);
  const [round, setRound] = useState<RoundData | null>(null);
  const [result, setResult] = useState<GuessResult | null>(null);
  const [selectedBearId, setSelectedBearId] = useState("");
  const [observeStartedAt, setObserveStartedAt] = useState<number | null>(null);
  const [choiceStartedAt, setChoiceStartedAt] = useState<number | null>(null);
  const [countdown, setCountdown] = useState(3);
  const [remainingMs, setRemainingMs] = useState(15000);
  const [choiceRemainingMs, setChoiceRemainingMs] = useState(CHOICE_DURATION_MS);
  const [error, setError] = useState("");
  const startedRef = useRef(false);
  const guessInFlightRef = useRef(false);

  const beginCountdown = useCallback((nextRound: RoundData) => {
    setRound(nextRound);
    setResult(null);
    setSelectedBearId("");
    setObserveStartedAt(null);
    setChoiceStartedAt(null);
    guessInFlightRef.current = false;
    setCountdown(3);
    setRemainingMs(nextRound.durationMs);
    setChoiceRemainingMs(CHOICE_DURATION_MS);
    setPhase("countdown");
  }, []);

  const createNextRound = useCallback(
    async (sessionId: string) => {
      setPhase("loading_round");
      setError("");
      const roundData = await api.createBearRound(sessionId);
      beginCountdown(roundData.round);
    },
    [api, beginCountdown]
  );

  const startNewRun = useCallback(async () => {
    setPhase("loading_round");
    setError("");
    const sessionData = await api.createBearSession();
    setSession(sessionData.session);
    await createNextRound(sessionData.session.id);
  }, [api, createNextRound]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    async function start() {
      try {
        await startNewRun();
      } catch (err) {
        setError(err instanceof Error ? err.message : "게임을 시작하지 못했습니다.");
        setPhase("error");
      }
    }
    void start();
  }, [startNewRun]);

  useEffect(() => {
    if (phase !== "countdown") return;
    const endAt = performance.now() + 3000;
    const interval = window.setInterval(() => {
      setCountdown(Math.max(1, Math.ceil((endAt - performance.now()) / 1000)));
    }, 100);
    const timeout = window.setTimeout(() => {
      setObserveStartedAt(performance.now());
      setPhase("observing");
    }, 3000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [phase, round?.roundId]);

  useEffect(() => {
    if (phase !== "observing" || !round || observeStartedAt === null) return;
    const interval = window.setInterval(() => {
      const remaining = Math.max(
        0,
        round.durationMs - (performance.now() - observeStartedAt)
      );
      setRemainingMs(remaining);
    }, 100);
    const timeout = window.setTimeout(() => {
      setRemainingMs(0);
      setChoiceStartedAt(performance.now());
      setChoiceRemainingMs(CHOICE_DURATION_MS);
      setPhase("choosing");
    }, round.durationMs);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [phase, round, observeStartedAt]);

  const submitGuess = useCallback(async (bearId: string) => {
    if (!round || !choiceStartedAt || phase !== "choosing" || guessInFlightRef.current) {
      return;
    }
    guessInFlightRef.current = true;
    setSelectedBearId(bearId);
    setPhase("submitting_guess");
    try {
      const responseMs =
        bearId === TIMEOUT_BEAR_ID
          ? CHOICE_DURATION_MS
          : performance.now() - choiceStartedAt;
      const guess = await api.submitBearGuess(round.roundId, bearId, responseMs);
      setResult(guess);
      setSession(guess.session);
      setPhase("round_result");
      await onFinished();
    } catch (err) {
      guessInFlightRef.current = false;
      setError(err instanceof Error ? err.message : "정답 제출에 실패했습니다.");
      setPhase("error");
    }
  }, [api, choiceStartedAt, onFinished, phase, round]);

  useEffect(() => {
    if (phase !== "choosing" || !round || choiceStartedAt === null) return;
    const interval = window.setInterval(() => {
      const remaining = Math.max(
        0,
        CHOICE_DURATION_MS - (performance.now() - choiceStartedAt)
      );
      setChoiceRemainingMs(remaining);
    }, 50);
    const timeout = window.setTimeout(() => {
      setChoiceRemainingMs(0);
      void submitGuess(TIMEOUT_BEAR_ID);
    }, CHOICE_DURATION_MS);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [choiceStartedAt, phase, round, submitGuess]);

  async function continueGame() {
    if (!session) return;
    try {
      await createNextRound(session.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "다음 라운드를 만들지 못했습니다.");
      setPhase("error");
    }
  }

  async function finishRun() {
    if (!session) return;
    try {
      const finished = await api.finishBearSession(session.id);
      setSession(finished.session);
      setPhase("final_result");
      await onFinished();
    } catch (err) {
      setError(err instanceof Error ? err.message : "기록 확정에 실패했습니다.");
      setPhase("error");
    }
  }

  if (phase === "loading_round" || !round) {
    return (
      <section className="game-page">
        <div className="phone-frame game-phone loading-stage">
          <div className="pixel-loader" />
          <p>라운드를 준비하는 중...</p>
        </div>
      </section>
    );
  }

  const isChoosing = phase === "choosing" || phase === "submitting_guess";
  const showResult = phase === "round_result" && result;
  const hudMs = isChoosing ? choiceRemainingMs : remainingMs;
  const choiceSeconds = Math.max(0, Math.ceil(choiceRemainingMs / 1000));
  const choiceUrgent = isChoosing && choiceRemainingMs <= 2000;

  return (
    <section className="game-page">
      <div className="game-column">
        <div className="phone-frame game-phone">
          <div className="pixel-hud">
            <span>R {round.roundNumber}</span>
            <span>{Math.ceil(hudMs / 1000).toString().padStart(2, "0")} SEC</span>
            <span>{session?.total_score ?? 0} P</span>
          </div>
          <GameCanvas
            round={round}
            phase={phase}
            observeStartedAt={observeStartedAt}
            choiceRemainingMs={choiceRemainingMs}
            result={result}
            selectedBearId={selectedBearId}
          />
          {phase === "countdown" && (
            <div className="game-overlay countdown-overlay">
              <span>ROUND {round.roundNumber}</span>
              <strong>{countdown}</strong>
            </div>
          )}
          {phase === "observing" && (
            <div className="observe-banner">곰들이 먹는 모습을 기억하세요</div>
          )}
          {isChoosing && (
            <div className={choiceUrgent ? "choice-panel urgent" : "choice-panel"}>
              <div className="choice-head">
                <h2>가장 많이 먹은 곰은?</h2>
                <strong>{choiceSeconds}</strong>
              </div>
              <div className="choice-timer" aria-hidden="true">
                <span style={{ width: `${(choiceRemainingMs / CHOICE_DURATION_MS) * 100}%` }} />
              </div>
              <div className="choice-grid">
                {round.bears.map((bear) => (
                  <button
                    key={bear.id}
                    className="bear-choice"
                    disabled={phase === "submitting_guess"}
                    onClick={() => submitGuess(bear.id)}
                  >
                    곰 {bear.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {showResult && (
          <RoundResultPanel
            round={round}
            result={result}
            onContinue={continueGame}
            onFinish={() => setPhase("final_result")}
            onCashOut={finishRun}
          />
        )}

        {phase === "final_result" && session && (
          <FinalResultPanel
            session={session}
            recent={recent}
            onExit={onExit}
            onAgain={() => {
              void startNewRun();
            }}
          />
        )}

        {phase === "error" && (
          <div className="pixel-panel error-panel">
            <h2>문제가 생겼습니다</h2>
            <p>{error}</p>
            <div className="button-row">
              <button className="pixel-button" onClick={onExit}>
                허브로
              </button>
              {session && (
                <button className="pixel-button primary" onClick={continueGame}>
                  다시 시도
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function GameCanvas({
  round,
  phase,
  observeStartedAt,
  choiceRemainingMs,
  result,
  selectedBearId
}: {
  round: RoundData;
  phase: GamePhase;
  observeStartedAt: number | null;
  choiceRemainingMs: number;
  result: GuessResult | null;
  selectedBearId: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const context = ctx;
    context.imageSmoothingEnabled = false;
    let raf = 0;

    function drawFrame() {
      const now = performance.now();
      const elapsed =
        observeStartedAt && (phase === "observing" || phase === "choosing")
          ? Math.min(round.durationMs, now - observeStartedAt)
          : phase === "round_result"
            ? round.durationMs
            : 0;
      drawScene(context, round, elapsed, phase, result, selectedBearId, choiceRemainingMs, now);
      raf = requestAnimationFrame(drawFrame);
    }

    drawFrame();
    return () => cancelAnimationFrame(raf);
  }, [round, phase, observeStartedAt, choiceRemainingMs, result, selectedBearId]);

  return <canvas className="game-canvas" width={320} height={480} ref={canvasRef} />;
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  round: RoundData,
  elapsed: number,
  phase: GamePhase,
  result: GuessResult | null,
  selectedBearId: string,
  choiceRemainingMs: number,
  sceneTime: number
) {
  ctx.clearRect(0, 0, 320, 480);
  drawForest(ctx);
  const positions = bearPositions(round.bears.length);
  const recentEvents = recentEatEvents(round.events, elapsed);
  const choiceMode = phase === "choosing" || phase === "submitting_guess";
  const urgency = choiceMode
    ? Math.max(0, Math.min(1, 1 - choiceRemainingMs / CHOICE_DURATION_MS))
    : 0;

  for (const [index, bear] of round.bears.entries()) {
    const position = positions[index];
    const lastEat = recentEvents.get(bear.id) ?? -9999;
    const pulse = Math.max(0, 1 - (elapsed - lastEat) / 260);
    const isAnswer = result?.answerBearId === bear.id;
    const isSelected = selectedBearId === bear.id || result?.selectedBearId === bear.id;
    const jitter = urgency > 0.62 && index % 2 === 0
      ? (Math.floor(sceneTime / 70) % 2 === 0 ? -2 : 2)
      : 0;
    drawBear(
      ctx,
      bear,
      position.x + jitter,
      position.y,
      pulse,
      isAnswer,
      isSelected,
      phase,
      index,
      sceneTime,
      urgency
    );
  }

  for (const event of round.events) {
    const age = elapsed - event.t;
    if (age >= 0 && age <= 380) {
      const bearIndex = round.bears.findIndex((bear) => bear.id === event.bearId);
      const position = positions[bearIndex];
      drawMeat(ctx, position.x + 20, position.y - 20 - age / 9, 1 - age / 380);
    }
  }

  if (phase === "round_result" && result) {
    drawResultStamp(ctx, result.correct);
  }

  if (choiceMode) {
    drawChoiceUrgency(ctx, choiceRemainingMs, sceneTime);
  }
}

function drawForest(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "#6fc451";
  ctx.fillRect(0, 0, 320, 480);
  ctx.fillStyle = "#4d9f42";
  for (let y = 16; y < 480; y += 18) {
    for (let x = (y / 18) % 2 === 0 ? 0 : 8; x < 320; x += 24) {
      ctx.fillRect(x, y, 12, 5);
      ctx.fillRect(x + 5, y - 4, 6, 9);
    }
  }
  ctx.fillStyle = "#2e7d35";
  ctx.fillRect(0, 0, 320, 95);
  ctx.fillStyle = "#3f9b43";
  for (let x = 0; x < 340; x += 28) {
    ctx.fillRect(x, 16, 20, 34);
    ctx.fillRect(x - 8, 38, 32, 34);
    ctx.fillRect(x + 3, 63, 18, 30);
  }
  ctx.fillStyle = "#b97337";
  ctx.fillRect(0, 258, 320, 76);
  ctx.fillStyle = "#8b4a24";
  ctx.fillRect(0, 322, 320, 13);
  ctx.fillStyle = "#2f6f35";
  ctx.fillRect(0, 386, 320, 94);
}

function bearPositions(count: number) {
  if (count === 3) {
    return [
      { x: 64, y: 220 },
      { x: 150, y: 220 },
      { x: 236, y: 220 }
    ];
  }
  if (count === 4) {
    return [
      { x: 50, y: 204 },
      { x: 126, y: 232 },
      { x: 198, y: 232 },
      { x: 270, y: 204 }
    ];
  }
  return [
    { x: 38, y: 206 },
    { x: 102, y: 232 },
    { x: 162, y: 210 },
    { x: 222, y: 232 },
    { x: 284, y: 206 }
  ];
}

function recentEatEvents(events: EatEvent[], elapsed: number) {
  const recent = new Map<string, number>();
  for (const event of events) {
    if (event.t <= elapsed) {
      recent.set(event.bearId, event.t);
    }
  }
  return recent;
}

function drawBear(
  ctx: CanvasRenderingContext2D,
  bear: BearInfo,
  x: number,
  y: number,
  pulse: number,
  isAnswer: boolean,
  isSelected: boolean,
  phase: GamePhase,
  index: number,
  sceneTime: number,
  urgency: number
) {
  const colors: Record<string, string> = {
    brown: "#9b6240",
    honey: "#c88b48",
    rose: "#b96863",
    moss: "#6f7f4a",
    night: "#62506b"
  };
  const body = colors[bear.skin] ?? "#9b6240";
  const outline = "#3b2118";
  const dark = "#5b321f";
  const cream = "#fff0c4";
  const highlight = "#e0b074";
  const chewing = pulse > 0.05;
  const chewFrame = chewing ? Math.floor(sceneTime / 85) % 4 : 0;
  const idleBob = Math.round(Math.sin(sceneTime / 230 + index) * 1.5);
  const panicBob = urgency > 0.35
    ? Math.round(Math.sin(sceneTime / 48 + index * 1.7) * urgency * 3)
    : 0;
  const lift = Math.round(pulse * 8) + idleBob + panicBob;
  const width = 50 + (chewFrame === 2 ? 4 : 0);
  const left = Math.round(x - width / 2);
  const top = Math.round(y - 66 - lift);
  const center = left + Math.round(width / 2);

  if (isSelected || isAnswer) {
    ctx.fillStyle = isAnswer ? "#74e2ff" : "#ffd763";
    ctx.fillRect(left - 9, top - 12, width + 18, 95);
    ctx.fillStyle = isAnswer ? "#d9fbff" : "#fff2b2";
    ctx.fillRect(left - 5, top - 8, width + 10, 87);
  }

  ctx.fillStyle = "#352015";
  ctx.fillRect(left + 7, top + 72, width - 14, 7);

  // Feet and body outline.
  ctx.fillStyle = outline;
  ctx.fillRect(left + 8, top + 62, 14, 13);
  ctx.fillRect(left + width - 22, top + 62, 14, 13);
  ctx.fillRect(left + 4, top + 28, width - 8, 42);
  ctx.fillStyle = body;
  ctx.fillRect(left + 11, top + 64, 8, 8);
  ctx.fillRect(left + width - 19, top + 64, 8, 8);
  ctx.fillRect(left + 8, top + 32, width - 16, 36);
  ctx.fillStyle = dark;
  ctx.fillRect(left + 11, top + 34, 5, 30);
  ctx.fillRect(left + width - 16, top + 34, 5, 30);
  ctx.fillStyle = highlight;
  ctx.fillRect(left + 16, top + 34, 6, 5);
  ctx.fillRect(left + width - 23, top + 37, 5, 4);
  ctx.fillStyle = "#d2a06a";
  ctx.fillRect(left + 17, top + 47, width - 34, 18);
  ctx.fillStyle = "#f1c68e";
  ctx.fillRect(left + 21, top + 50, width - 42, 5);
  ctx.fillStyle = dark;
  ctx.fillRect(left + 15, top + 42, 4, 4);
  ctx.fillRect(left + width - 19, top + 45, 4, 4);
  ctx.fillRect(left + 22, top + 60, 4, 3);
  ctx.fillRect(left + width - 26, top + 58, 4, 3);

  // Animated arms. Eating frames pull paws toward the mouth in alternating beats.
  const leftPawLift = chewing ? [0, 8, 13, 5][chewFrame] : 0;
  const rightPawLift = chewing ? [8, 2, 10, 14][chewFrame] : 0;
  ctx.fillStyle = outline;
  ctx.fillRect(left - 1, top + 39 - leftPawLift, 14, 29);
  ctx.fillRect(left + width - 13, top + 39 - rightPawLift, 14, 29);
  ctx.fillStyle = body;
  ctx.fillRect(left + 2, top + 41 - leftPawLift, 8, 22);
  ctx.fillRect(left + width - 10, top + 41 - rightPawLift, 8, 22);
  ctx.fillStyle = cream;
  if (chewing) {
    ctx.fillRect(left + 8, top + 38 - leftPawLift, 7, 7);
    ctx.fillRect(left + width - 15, top + 38 - rightPawLift, 7, 7);
  }

  // Head outline.
  ctx.fillStyle = outline;
  ctx.fillRect(left + 7, top + 8, width - 14, 34);
  ctx.fillRect(left + 4, top + 3, 13, 14);
  ctx.fillRect(left + width - 17, top + 3, 13, 14);
  ctx.fillStyle = body;
  ctx.fillRect(left + 11, top + 12, width - 22, 26);
  ctx.fillRect(left + 7, top + 6, 8, 9);
  ctx.fillRect(left + width - 15, top + 6, 8, 9);
  ctx.fillStyle = highlight;
  ctx.fillRect(left + 14, top + 13, 8, 4);
  ctx.fillRect(left + 11, top + 8, 4, 5);
  ctx.fillRect(left + width - 15, top + 8, 4, 5);
  ctx.fillStyle = "#f1bd83";
  ctx.fillRect(left + 10, top + 9, 4, 4);
  ctx.fillRect(left + width - 14, top + 9, 4, 4);

  // Face.
  ctx.fillStyle = "#1c1110";
  ctx.fillRect(left + 16, top + 20, 4, 4);
  ctx.fillRect(left + width - 20, top + 20, 4, 4);
  ctx.fillRect(center - 3, top + 27, 6, 4);
  ctx.fillStyle = "#f5a1a1";
  ctx.fillRect(left + 12, top + 27, 5, 3);
  ctx.fillRect(left + width - 17, top + 27, 5, 3);
  ctx.fillStyle = cream;
  ctx.fillRect(center - 11, top + 31, 22, 14);
  ctx.fillStyle = "#1c1110";
  if (!chewing || chewFrame === 0) {
    ctx.fillRect(center - 5, top + 37, 10, 3);
  } else if (chewFrame === 1) {
    ctx.fillRect(center - 6, top + 36, 12, 6);
    ctx.fillStyle = "#e85a48";
    ctx.fillRect(center - 3, top + 39, 6, 3);
  } else if (chewFrame === 2) {
    ctx.fillRect(center - 8, top + 35, 16, 9);
    ctx.fillStyle = "#e85a48";
    ctx.fillRect(center - 5, top + 40, 10, 3);
  } else {
    ctx.fillRect(center - 4, top + 36, 8, 7);
    ctx.fillStyle = "#ffd7a3";
    ctx.fillRect(center + 5, top + 39, 4, 3);
  }

  if (chewing) {
    ctx.fillStyle = "#ffd7a3";
    ctx.fillRect(center - 16, top + 39 - chewFrame, 4, 4);
    ctx.fillRect(center + 12, top + 37 + (chewFrame % 2), 3, 3);
    ctx.fillStyle = "#e54b4b";
    ctx.fillRect(center - 13, top + 42, 4, 3);
  }

  drawAccessory(ctx, bear.accessory, left, top, width);

  ctx.fillStyle = "#101725";
  ctx.font = "12px monospace";
  ctx.fillRect(center - 10, top - 20, 20, 14);
  ctx.fillStyle = "#85ebff";
  ctx.fillRect(center - 8, top - 18, 16, 10);
  ctx.fillStyle = "#101725";
  ctx.fillText(bear.label, center - 4, top - 10);

  if (phase === "choosing" || phase === "submitting_guess") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(left + 6, top + 77, width - 12, 14);
    ctx.fillStyle = "#14213d";
    ctx.fillText(`곰 ${bear.label}`, left + 11, top + 87);
    if (urgency > 0.58 && Math.floor(sceneTime / 110) % 2 === 0) {
      ctx.fillStyle = "#ffea63";
      ctx.fillRect(center - 3, top - 36, 6, 13);
      ctx.fillRect(center - 3, top - 18, 6, 5);
    }
  }
}

function drawAccessory(
  ctx: CanvasRenderingContext2D,
  accessory: string,
  left: number,
  top: number,
  width: number
) {
  if (accessory === "leaf") {
    ctx.fillStyle = "#2f9b4f";
    ctx.fillRect(left + width - 15, top - 2, 9, 5);
    ctx.fillRect(left + width - 12, top - 6, 5, 9);
    return;
  }
  if (accessory === "scarf") {
    ctx.fillStyle = "#2f8ee5";
    ctx.fillRect(left + 13, top + 39, width - 26, 5);
    ctx.fillRect(left + width - 15, top + 42, 5, 10);
    return;
  }
  if (accessory === "cap") {
    ctx.fillStyle = "#ffd763";
    ctx.fillRect(left + 12, top + 3, width - 24, 5);
    ctx.fillRect(left + width - 14, top + 6, 10, 4);
    return;
  }
  if (accessory === "flower") {
    ctx.fillStyle = "#ff7bbd";
    ctx.fillRect(left + 6, top - 3, 5, 5);
    ctx.fillRect(left + 2, top + 1, 5, 5);
    ctx.fillRect(left + 10, top + 1, 5, 5);
    ctx.fillStyle = "#ffd763";
    ctx.fillRect(left + 7, top + 1, 4, 4);
    return;
  }
  if (accessory === "star") {
    ctx.fillStyle = "#ffd763";
    ctx.fillRect(left + width - 12, top - 4, 5, 13);
    ctx.fillRect(left + width - 16, top, 13, 5);
  }
}

function drawMeat(ctx: CanvasRenderingContext2D, x: number, y: number, alpha: number) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#4b2419";
  ctx.fillRect(Math.round(x - 10), Math.round(y - 7), 20, 14);
  ctx.fillStyle = "#e54b4b";
  ctx.fillRect(Math.round(x - 8), Math.round(y - 5), 16, 10);
  ctx.fillStyle = "#ff8a72";
  ctx.fillRect(Math.round(x - 4), Math.round(y - 3), 7, 3);
  ctx.fillStyle = "#ffd7a3";
  ctx.fillRect(Math.round(x - 13), Math.round(y - 3), 5, 5);
  ctx.fillRect(Math.round(x + 8), Math.round(y - 3), 5, 5);
  ctx.restore();
}

function drawChoiceUrgency(
  ctx: CanvasRenderingContext2D,
  choiceRemainingMs: number,
  sceneTime: number
) {
  const progress = 1 - Math.max(0, Math.min(1, choiceRemainingMs / CHOICE_DURATION_MS));
  const blink = Math.floor(sceneTime / 120) % 2 === 0;
  const edge = progress > 0.62 && blink ? "#ff4e4e" : "#ffd763";
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, 320, 6);
  ctx.fillRect(0, 474, 320, 6);
  ctx.fillRect(0, 0, 6, 480);
  ctx.fillRect(314, 0, 6, 480);

  ctx.fillStyle = "#101725";
  ctx.fillRect(78, 102, 164, 31);
  ctx.fillStyle = edge;
  ctx.fillRect(82, 106, Math.max(0, Math.round(156 * (1 - progress))), 23);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 16px monospace";
  ctx.fillText("PICK NOW", 116, 124);

  if (progress > 0.7 && blink) {
    ctx.fillStyle = "rgba(255, 78, 78, 0.18)";
    ctx.fillRect(6, 6, 308, 468);
  }
}

function drawResultStamp(ctx: CanvasRenderingContext2D, correct: boolean) {
  ctx.fillStyle = correct ? "#41d6ff" : "#ff5f5f";
  ctx.fillRect(78, 160, 164, 48);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 30px monospace";
  ctx.fillText(correct ? "GOOD" : "MISS", correct ? 118 : 116, 193);
}

function RoundResultPanel({
  round,
  result,
  onContinue,
  onFinish,
  onCashOut
}: {
  round: RoundData;
  result: GuessResult;
  onContinue: () => void;
  onFinish: () => void;
  onCashOut: () => void;
}) {
  const maxCount = Math.max(...Object.values(result.counts));
  return (
    <div className="pixel-panel result-panel">
      <div className={result.correct ? "result-title good" : "result-title miss"}>
        {result.correct ? "GOOD!" : "MISS!"}
      </div>
      <p>
        선택: {selectionLabel(round.bears, result.selectedBearId)} / 정답: 곰{" "}
        {labelOf(round.bears, result.answerBearId)}
      </p>
      <div className="count-bars">
        {round.bears.map((bear) => {
          const count = result.counts[bear.id] ?? 0;
          return (
            <div className="count-row" key={bear.id}>
              <span>곰 {bear.label}</span>
              <div className="bar-track">
                <div
                  className={bear.id === result.answerBearId ? "bar-fill answer" : "bar-fill"}
                  style={{ width: `${(count / maxCount) * 100}%` }}
                />
              </div>
              <strong>{count}</strong>
            </div>
          );
        })}
      </div>
      <div className="score-strip">
        <span>획득 {result.score}</span>
        <span>총점 {result.session.total_score}</span>
        <span>연속 {result.session.current_streak}</span>
      </div>
      <div className="button-row">
        {result.runComplete ? (
          <button className="pixel-button primary" onClick={onFinish}>
            최종 결과
          </button>
        ) : (
          <>
            <button className="pixel-button primary" onClick={onContinue}>
              다음 라운드
            </button>
            {round.roundNumber >= 5 && (
              <button className="pixel-button" onClick={onCashOut}>
                기록 확정
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function FinalResultPanel({
  session,
  recent,
  onExit,
  onAgain
}: {
  session: GameSession;
  recent: RecentSession[];
  onExit: () => Promise<void>;
  onAgain: () => void;
}) {
  return (
    <div className="pixel-panel result-panel final-panel">
      <p className="eyebrow">RUN SAVED</p>
      <h2>최종 기록</h2>
      <div className="final-grid">
        <span>총점</span>
        <strong>{session.total_score}</strong>
        <span>도달 라운드</span>
        <strong>{session.reached_round}</strong>
        <span>정답 수</span>
        <strong>{session.correct_count}</strong>
        <span>최고 연속</span>
        <strong>{session.best_streak}</strong>
      </div>
      {recent[0] && <p className="muted">최근 기록도 DB에 저장되었습니다.</p>}
      <div className="button-row">
        <button className="pixel-button primary" onClick={onAgain}>
          새 기록 도전
        </button>
        <button className="pixel-button" onClick={onExit}>
          허브로
        </button>
      </div>
    </div>
  );
}

function LeaderboardScreen({
  leaderboard,
  recent,
  stats,
  onRefresh
}: {
  leaderboard: LeaderboardEntry[];
  recent: RecentSession[];
  stats: PlayerStats;
  onRefresh: () => Promise<void>;
}) {
  return (
    <div className="leaderboard-layout">
      <section className="pixel-panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">ALL-TIME</p>
            <h1>고기왕 랭킹</h1>
          </div>
          <button className="pixel-button" onClick={onRefresh}>
            새로고침
          </button>
        </div>
        <LeaderboardList leaderboard={leaderboard} />
      </section>
      <aside className="side-stack">
        <RecordSummary stats={stats} />
        <section className="pixel-panel">
          <h2>내 최근 플레이</h2>
          <div className="recent-list">
            {recent.length === 0 && <p className="muted">아직 저장된 기록이 없습니다.</p>}
            {recent.map((item) => (
              <div className="recent-item" key={item.id}>
                <strong>{item.totalScore}점</strong>
                <span>R{item.reachedRound} / 정답 {item.correctCount}</span>
              </div>
            ))}
          </div>
        </section>
      </aside>
    </div>
  );
}

function RecordSummary({ stats }: { stats: PlayerStats }) {
  return (
    <section className="pixel-panel stat-card">
      <p className="eyebrow">MY RECORD</p>
      <div className="stat-grid">
        <span>최고 점수</span>
        <strong>{stats.bestScore}</strong>
        <span>최고 라운드</span>
        <strong>{stats.bestRound}</strong>
        <span>최고 연속</span>
        <strong>{stats.bestStreak}</strong>
        <span>플레이</span>
        <strong>{stats.plays}</strong>
      </div>
    </section>
  );
}

function LeaderboardPreview({
  leaderboard,
  onOpen,
  compact
}: {
  leaderboard: LeaderboardEntry[];
  onOpen?: () => void;
  compact?: boolean;
}) {
  return (
    <section className={compact ? "leader-preview compact" : "pixel-panel leader-preview"}>
      <div className="section-header">
        <h2>랭킹</h2>
        {onOpen && (
          <button className="mini-button" onClick={onOpen}>
            전체
          </button>
        )}
      </div>
      {leaderboard.length === 0 ? (
        <p className="muted">아직 랭킹이 없습니다.</p>
      ) : (
        <div className="leader-mini-list">
          {leaderboard.slice(0, 5).map((entry) => (
            <div className="leader-mini-row" key={entry.sessionId}>
              <span>#{entry.rank}</span>
              <strong>{entry.nickname}</strong>
              <em>{entry.totalScore}</em>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function LeaderboardList({ leaderboard }: { leaderboard: LeaderboardEntry[] }) {
  if (leaderboard.length === 0) {
    return <p className="muted">첫 번째 기록을 남겨보세요.</p>;
  }
  return (
    <div className="leader-list">
      {leaderboard.map((entry) => (
        <article className="leader-row" key={entry.sessionId}>
          <span className="rank">#{entry.rank}</span>
          <strong>{entry.nickname}</strong>
          <span>{entry.totalScore}점</span>
          <span>R{entry.reachedRound}</span>
          <span>정답 {entry.correctCount}</span>
        </article>
      ))}
    </div>
  );
}

function AodsStatus({ diagnostics }: { diagnostics: Diagnostics | null }) {
  return (
    <section className="pixel-panel status-panel">
      <p className="eyebrow">AODS STATUS</p>
      <div className="status-grid">
        <StatusBadge label="Web" value="ok" />
        <StatusBadge label="API" value={diagnostics?.api ?? "unknown"} />
        <StatusBadge label="DB" value={diagnostics?.db ?? "unknown"} />
      </div>
      <p className="muted">
        API {diagnostics?.apiVersion ?? "-"} / DB schema {diagnostics?.dbSchema ?? "-"}
      </p>
      <p className="muted">SHA {diagnostics?.buildSha ?? "local"}</p>
    </section>
  );
}

function StatusBadge({ label, value }: { label: string; value: string }) {
  return (
    <span className={value === "ok" ? "status-badge ok" : "status-badge warn"}>
      {label} {value.toUpperCase()}
    </span>
  );
}

function labelOf(bears: BearInfo[], bearId: string) {
  return bears.find((bear) => bear.id === bearId)?.label ?? "?";
}

function selectionLabel(bears: BearInfo[], bearId: string) {
  if (bearId === TIMEOUT_BEAR_ID) return "시간초과";
  return `곰 ${labelOf(bears, bearId)}`;
}
