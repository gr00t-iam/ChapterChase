import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { cacheDir, dataDir } from "@/lib/paths";
import { appendServerLog } from "@/lib/server-logs";

export const dynamic = "force-dynamic";

type HealthItem = {
  label: string;
  ok: boolean;
  detail: string;
};

export async function GET() {
  await requireAdmin();
  const items: HealthItem[] = [
    await checkDatabase(),
    await checkWritableDirectory("Storage Directory Write Permissions", dataDir),
    await checkWritableDirectory("Cache Server status", cacheDir),
  ];

  await appendServerLog("INFO", "Admin ran system health check", {
    passing: items.filter((item) => item.ok).length,
    total: items.length,
  });

  return Response.json({ items, checkedAt: new Date().toISOString() });
}

async function checkDatabase(): Promise<HealthItem> {
  try {
    await prisma.user.count();
    return { label: "Database Connection", ok: true, detail: "Database responded." };
  } catch (error) {
    return { label: "Database Connection", ok: false, detail: error instanceof Error ? error.message : "Database check failed." };
  }
}

async function checkWritableDirectory(label: string, directory: string): Promise<HealthItem> {
  const probePath = path.join(/* turbopackIgnore: true */ directory, `.chapterchase-health-${randomUUID()}.tmp`);
  try {
    await fs.mkdir(/* turbopackIgnore: true */ directory, { recursive: true });
    await fs.writeFile(/* turbopackIgnore: true */ probePath, "ok", "utf8");
    await fs.unlink(/* turbopackIgnore: true */ probePath).catch(() => undefined);
    return { label, ok: true, detail: directory };
  } catch (error) {
    return { label, ok: false, detail: error instanceof Error ? error.message : `Unable to write ${directory}` };
  }
}
