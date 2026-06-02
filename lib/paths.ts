import path from "node:path";

export const dataDir = getRuntimeDataDir();
export const coversDir = path.join(/* turbopackIgnore: true */ dataDir, "covers");
export const cacheDir = path.join(/* turbopackIgnore: true */ dataDir, "cache");

export function defaultDatabaseUrl() {
  return `file:${path.join(/* turbopackIgnore: true */ dataDir, "chapterchase.db")}`;
}

function getRuntimeDataDir() {
  const configuredDataDir = process.env.CHAPTERCHASE_DATA_DIR?.trim();
  if (configuredDataDir) {
    return path.isAbsolute(configuredDataDir) ? configuredDataDir : path.join(/* turbopackIgnore: true */ process.cwd(), configuredDataDir);
  }

  return path.join(/* turbopackIgnore: true */ process.cwd(), "data");
}
