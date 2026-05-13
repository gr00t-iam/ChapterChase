import { prisma } from "@/lib/db";
import { scanLibraryFolder } from "@/lib/scanner";

export type ScanFrequency = "hourly" | "six-hours" | "daily" | "weekly" | "custom";

export type LibraryAutomationSettings = {
  enabled: boolean;
  frequency: ScanFrequency;
  customMinutes: number;
};

const automationSettingsKey = "libraryAutomation";
const defaultAutomationSettings: LibraryAutomationSettings = {
  enabled: false,
  frequency: "daily",
  customMinutes: 1440,
};

type SchedulerState = {
  timer: NodeJS.Timeout | null;
  intervalMinutes: number | null;
  running: boolean;
  initialized: boolean;
};

const schedulerGlobal = globalThis as typeof globalThis & {
  __chapterChaseLibraryScheduler?: SchedulerState;
};

const scheduler = schedulerGlobal.__chapterChaseLibraryScheduler ?? {
  timer: null,
  intervalMinutes: null,
  running: false,
  initialized: false,
};

schedulerGlobal.__chapterChaseLibraryScheduler = scheduler;

export async function getLibraryAutomationSettings(): Promise<LibraryAutomationSettings> {
  const settings = await prisma.$queryRaw<Array<{ value: string }>>`
    SELECT "value" FROM "AppSetting" WHERE "key" = ${automationSettingsKey} LIMIT 1
  `;
  const setting = settings[0];
  if (!setting) {
    return defaultAutomationSettings;
  }

  try {
    return normalizeAutomationSettings(JSON.parse(setting.value) as Partial<LibraryAutomationSettings>);
  } catch {
    return defaultAutomationSettings;
  }
}

export async function saveLibraryAutomationSettings(settings: Partial<LibraryAutomationSettings>) {
  const next = normalizeAutomationSettings(settings);
  await prisma.$executeRaw`
    INSERT INTO "AppSetting" ("key", "value", "updatedAt")
    VALUES (${automationSettingsKey}, ${JSON.stringify(next)}, CURRENT_TIMESTAMP)
    ON CONFLICT("key") DO UPDATE SET
      "value" = excluded."value",
      "updatedAt" = CURRENT_TIMESTAMP
  `;
  await configureLibraryAutomationScheduler(next);
  return next;
}

export async function ensureLibraryAutomationScheduler() {
  if (scheduler.initialized) {
    return;
  }

  scheduler.initialized = true;
  await configureLibraryAutomationScheduler(await getLibraryAutomationSettings());
}

export async function configureLibraryAutomationScheduler(settings: LibraryAutomationSettings) {
  const intervalMinutes = getScanIntervalMinutes(settings);
  if (!settings.enabled) {
    stopScheduler();
    return;
  }

  if (scheduler.timer && scheduler.intervalMinutes === intervalMinutes) {
    return;
  }

  stopScheduler();
  scheduler.intervalMinutes = intervalMinutes;
  scheduler.timer = setInterval(() => {
    void runScheduledLibraryScan();
  }, intervalMinutes * 60_000);
}

export async function runScheduledLibraryScan() {
  if (scheduler.running) {
    return;
  }

  scheduler.running = true;
  try {
    const folders = await prisma.libraryFolder.findMany({
      where: { enabled: true },
      orderBy: [{ name: "asc" }],
      select: { id: true },
    });

    for (const folder of folders) {
      await scanLibraryFolder(folder.id);
    }
  } finally {
    scheduler.running = false;
  }
}

function stopScheduler() {
  if (scheduler.timer) {
    clearInterval(scheduler.timer);
  }
  scheduler.timer = null;
  scheduler.intervalMinutes = null;
}

function normalizeAutomationSettings(settings: Partial<LibraryAutomationSettings>): LibraryAutomationSettings {
  const frequency = isScanFrequency(settings.frequency) ? settings.frequency : defaultAutomationSettings.frequency;
  const customMinutes = clampMinutes(settings.customMinutes);
  return {
    enabled: settings.enabled === true,
    frequency,
    customMinutes,
  };
}

function isScanFrequency(value: unknown): value is ScanFrequency {
  return value === "hourly" || value === "six-hours" || value === "daily" || value === "weekly" || value === "custom";
}

function getScanIntervalMinutes(settings: LibraryAutomationSettings) {
  if (settings.frequency === "hourly") {
    return 60;
  }
  if (settings.frequency === "six-hours") {
    return 360;
  }
  if (settings.frequency === "weekly") {
    return 10080;
  }
  if (settings.frequency === "custom") {
    return settings.customMinutes;
  }
  return 1440;
}

function clampMinutes(value: unknown) {
  const numericValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numericValue) ? Math.max(5, Math.min(10080, Math.round(numericValue))) : defaultAutomationSettings.customMinutes;
}
