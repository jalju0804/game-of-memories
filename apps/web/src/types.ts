export interface Player {
  id: string;
  nickname: string;
}

export interface GameInfo {
  id: string;
  title: string;
  status: "playable";
}

export interface BearInfo {
  id: string;
  label: string;
  skin: string;
  accessory: string;
}

export interface EatEvent {
  t: number;
  bearId: string;
  type: "eat";
}

export interface RoundData {
  roundId: string;
  roundNumber: number;
  durationMs: number;
  bearCount: number;
  bears: BearInfo[];
  events: EatEvent[];
}

export interface GameSession {
  id: string;
  game_id?: string;
  player_id?: string;
  status: "active" | "completed" | "abandoned";
  total_score: number;
  reached_round: number;
  correct_count: number;
  best_streak: number;
  current_streak: number;
  started_at?: string;
  finished_at?: string | null;
}

export interface GuessResult {
  correct: boolean;
  answerBearId: string;
  selectedBearId: string;
  score: number;
  counts: Record<string, number>;
  session: GameSession;
  runComplete: boolean;
  canContinue: boolean;
}

export interface LeaderboardEntry {
  rank: number;
  sessionId: string;
  nickname: string;
  totalScore: number;
  reachedRound: number;
  correctCount: number;
  bestStreak: number;
  finishedAt: string;
}

export interface PlayerStats {
  bestScore: number;
  bestRound: number;
  bestStreak: number;
  plays: number;
}

export interface Diagnostics {
  web: string;
  api: string;
  db: string;
  apiVersion: string;
  buildSha: string;
  dbSchema: string;
}

export interface RecentSession {
  id: string;
  totalScore: number;
  reachedRound: number;
  correctCount: number;
  bestStreak: number;
  status: string;
  startedAt: string;
  finishedAt: string | null;
}
