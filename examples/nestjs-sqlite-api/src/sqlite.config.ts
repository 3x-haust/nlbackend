import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
export const defaultDbPath = join(currentDir, "..", "data", "nlbackend-demo.sqlite");

export function getSqlitePath() {
  return process.env.NLBACKEND_SQLITE_PATH ?? defaultDbPath;
}

export function ensureSqliteDirectory(dbPath = getSqlitePath()) {
  if (dbPath !== ":memory:") {
    mkdirSync(dirname(dbPath), { recursive: true });
  }
}
