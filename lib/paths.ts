import path from "node:path";

export const dataDir = process.env.CHAPTERCHASE_DATA_DIR ?? path.join(/*turbopackIgnore: true*/ process.cwd(), "data");
export const coversDir = path.join(dataDir, "covers");
export const cacheDir = path.join(dataDir, "cache");

export function defaultDatabaseUrl() {
  return `file:${path.join(dataDir, "chapterchase.db")}`;
}
