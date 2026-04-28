export interface Env {
  apiVersion: string;
  buildSha: string;
  corsOrigin: string;
  databaseUrl: string;
  nodeEnv: string;
  port: number;
  sessionTtlDays: number;
}

function readNumber(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const env: Env = {
  apiVersion: process.env.API_VERSION ?? "0.1.0",
  buildSha: process.env.BUILD_SHA ?? "local",
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  databaseUrl:
    process.env.DATABASE_URL ??
    "postgres://bear_feast:bear_feast@localhost:5432/bear_feast",
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: readNumber("PORT", 8080),
  sessionTtlDays: readNumber("SESSION_TTL_DAYS", 30)
};
