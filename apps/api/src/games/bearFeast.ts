import { randomBytes, randomUUID } from "crypto";

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

export interface BearFeastRound {
  id: string;
  roundNumber: number;
  seed: string;
  durationMs: number;
  bearCount: number;
  answerBearId: string;
  bearCounts: Record<string, number>;
  eventsPayload: {
    bears: BearInfo[];
    events: EatEvent[];
  };
}

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function intBetween(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function pick<T>(rng: () => number, values: T[]): T {
  return values[Math.floor(rng() * values.length)];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getBearCount(roundNumber: number): number {
  if (roundNumber <= 2) return 3;
  if (roundNumber <= 4) return 4;
  return 5;
}

function getLeadRange(roundNumber: number): [number, number] {
  if (roundNumber <= 1) return [4, 5];
  if (roundNumber === 2) return [3, 4];
  if (roundNumber === 3) return [2, 3];
  if (roundNumber === 4) return [1, 2];
  return [1, 1];
}

function buildBears(bearCount: number): BearInfo[] {
  const skins = ["brown", "honey", "rose", "moss", "night"];
  const accessories = ["leaf", "scarf", "cap", "flower", "star"];
  return Array.from({ length: bearCount }, (_, index) => ({
    id: `bear-${index + 1}`,
    label: `${index + 1}`,
    skin: skins[index],
    accessory: accessories[index]
  }));
}

function buildTimings(
  rng: () => number,
  count: number,
  durationMs: number,
  roundNumber: number
): number[] {
  const acceleration = 1.32 + Math.min(roundNumber * 0.08, 0.58);
  const jitter = Math.max(100, 460 - roundNumber * 35);

  return Array.from({ length: count }, (_, index) => {
    const f = (index + 1) / (count + 1);
    const accelerated = 1 - Math.pow(1 - f, acceleration);
    const offset = (rng() - 0.5) * jitter;
    return Math.round(clamp(durationMs * accelerated + offset, 260, durationMs - 260));
  }).sort((a, b) => a - b);
}

export function generateBearFeastRound(
  sessionId: string,
  roundNumber: number
): BearFeastRound {
  const id = randomUUID();
  const durationMs = 15000;
  const seed = `${sessionId}:${roundNumber}:${randomBytes(8).toString("hex")}`;
  const rng = mulberry32(hashSeed(seed));
  const bearCount = getBearCount(roundNumber);
  const bears = buildBears(bearCount);
  const winnerIndex = intBetween(rng, 0, bearCount - 1);
  const winner = bears[winnerIndex];
  const [leadMin, leadMax] = getLeadRange(roundNumber);
  const lead = intBetween(rng, leadMin, leadMax);
  const winnerCount = 8 + roundNumber * 2 + intBetween(rng, 0, 2);

  const bearCounts: Record<string, number> = {};
  for (const bear of bears) {
    if (bear.id === winner.id) {
      bearCounts[bear.id] = winnerCount;
      continue;
    }

    const drop =
      roundNumber >= 5 ? pick(rng, [1, 1, 2]) : lead + intBetween(rng, 0, 2);
    bearCounts[bear.id] = Math.max(3, winnerCount - drop);
  }

  const events: EatEvent[] = [];
  for (const bear of bears) {
    for (const t of buildTimings(rng, bearCounts[bear.id], durationMs, roundNumber)) {
      events.push({
        t,
        bearId: bear.id,
        type: "eat"
      });
    }
  }
  events.sort((a, b) => a.t - b.t || a.bearId.localeCompare(b.bearId));

  return {
    id,
    roundNumber,
    seed,
    durationMs,
    bearCount,
    answerBearId: winner.id,
    bearCounts,
    eventsPayload: {
      bears,
      events
    }
  };
}

export function scoreGuess(
  roundNumber: number,
  correct: boolean,
  streakAfterGuess: number
): number {
  if (!correct) return 0;
  return 100 + roundNumber * 20 + streakAfterGuess * 10;
}
