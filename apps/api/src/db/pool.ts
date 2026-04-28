import { Pool, type QueryResult, type QueryResultRow } from "pg";
import { env } from "../config/env";

export const pool = new Pool({
  connectionString: env.databaseUrl,
  max: 10
});

export function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<QueryResult<T>> {
  return pool.query<T>(text, params);
}
