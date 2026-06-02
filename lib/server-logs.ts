import fs from "node:fs/promises";
import path from "node:path";
import { dataDir } from "@/lib/paths";

const serverLogPath = path.join(/* turbopackIgnore: true */ dataDir, "server.log");

export async function appendServerLog(level: "INFO" | "WARN" | "ERROR", message: string, details?: Record<string, unknown>) {
  try {
    await fs.mkdir(/* turbopackIgnore: true */ dataDir, { recursive: true });
    const detailText = details ? ` ${JSON.stringify(details)}` : "";
    const line = `${new Date().toISOString()} [${level}] ${message}${detailText}\n`;
    await fs.appendFile(/* turbopackIgnore: true */ serverLogPath, line, "utf8");
  } catch {
    // Logging must never block user-facing API routes.
  }
}

export async function readServerLogLines(limit = 50) {
  try {
    const raw = await fs.readFile(/* turbopackIgnore: true */ serverLogPath, "utf8");
    return raw
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter(Boolean)
      .slice(-Math.max(1, Math.min(500, limit)));
  } catch {
    return [`${new Date().toISOString()} [INFO] Server log file is ready.`];
  }
}
