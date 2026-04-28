import type {
  Diagnostics,
  GameInfo,
  GameSession,
  GuessResult,
  LeaderboardEntry,
  Player,
  PlayerStats,
  RecentSession,
  RoundData
} from "./types";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:8080";

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export class ApiClient {
  private token: string | null;

  constructor(token: string | null) {
    this.token = token;
  }

  setToken(token: string | null) {
    this.token = token;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers = new Headers(options.headers);
    if (options.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    if (this.token) {
      headers.set("authorization", `Bearer ${this.token}`);
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers
    });

    if (response.status === 204) {
      return undefined as T;
    }

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const error = payload?.error;
      throw new ApiError(
        response.status,
        error?.code ?? "request_failed",
        error?.message ?? "요청을 처리하지 못했습니다."
      );
    }
    return payload as T;
  }

  health() {
    return this.request<{ ok: true }>("/healthz");
  }

  diagnostics() {
    return this.request<Diagnostics>("/api/diagnostics");
  }

  signup(nickname: string, password: string) {
    return this.request<{ token: string; player: Player }>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ nickname, password })
    });
  }

  login(nickname: string, password: string) {
    return this.request<{ token: string; player: Player }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ nickname, password })
    });
  }

  logout() {
    return this.request<void>("/api/auth/logout", { method: "POST" });
  }

  me() {
    return this.request<{ player: Player }>("/api/auth/me");
  }

  games() {
    return this.request<{ games: GameInfo[] }>("/api/games");
  }

  leaderboard() {
    return this.request<{ leaderboard: LeaderboardEntry[] }>(
      "/api/leaderboards?gameId=bear-feast"
    );
  }

  stats() {
    return this.request<{ stats: PlayerStats }>("/api/me/stats");
  }

  recentSessions() {
    return this.request<{ sessions: RecentSession[] }>(
      "/api/me/sessions?gameId=bear-feast"
    );
  }

  createBearSession() {
    return this.request<{ session: GameSession }>("/api/games/bear-feast/sessions", {
      method: "POST"
    });
  }

  createBearRound(sessionId: string) {
    return this.request<{ round: RoundData }>(
      `/api/games/bear-feast/sessions/${sessionId}/rounds`,
      { method: "POST" }
    );
  }

  submitBearGuess(roundId: string, selectedBearId: string, responseMs: number) {
    return this.request<GuessResult>(`/api/games/bear-feast/rounds/${roundId}/guess`, {
      method: "POST",
      body: JSON.stringify({ selectedBearId, responseMs })
    });
  }

  finishBearSession(sessionId: string) {
    return this.request<{ session: GameSession }>(
      `/api/games/bear-feast/sessions/${sessionId}/finish`,
      { method: "POST" }
    );
  }
}

export const tokenStore = {
  key: "aolda-games-token",
  get() {
    return localStorage.getItem(this.key);
  },
  set(token: string) {
    localStorage.setItem(this.key, token);
  },
  clear() {
    localStorage.removeItem(this.key);
  }
};
