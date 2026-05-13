export type ScanActivityTask = {
  id: string;
  folderId: string;
  folderName: string;
  active: boolean;
  phase: "discovering" | "scanning" | "complete" | "failed";
  currentFile: string | null;
  processedFiles: number;
  totalFiles: number;
  message: string;
  startedAt: string;
  updatedAt: string;
};

type ScanActivityStore = {
  tasks: Map<string, ScanActivityTask>;
};

const scanActivityGlobal = globalThis as typeof globalThis & {
  __chapterChaseScanActivity?: ScanActivityStore;
};

const store = scanActivityGlobal.__chapterChaseScanActivity ?? {
  tasks: new Map<string, ScanActivityTask>(),
};

scanActivityGlobal.__chapterChaseScanActivity = store;

export function startScanActivity(folderId: string, folderName: string) {
  const now = new Date().toISOString();
  const task: ScanActivityTask = {
    id: folderId,
    folderId,
    folderName,
    active: true,
    phase: "discovering",
    currentFile: null,
    processedFiles: 0,
    totalFiles: 0,
    message: `Scanning ${folderName}: finding files...`,
    startedAt: now,
    updatedAt: now,
  };
  store.tasks.set(folderId, task);
  return task;
}

export function updateScanActivity(
  folderId: string,
  patch: Partial<Pick<ScanActivityTask, "phase" | "currentFile" | "processedFiles" | "totalFiles" | "message">>
) {
  const current = store.tasks.get(folderId);
  if (!current) {
    return null;
  }

  const next: ScanActivityTask = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  store.tasks.set(folderId, next);
  return next;
}

export function finishScanActivity(folderId: string, message: string, failed = false) {
  const current = store.tasks.get(folderId);
  if (!current) {
    return null;
  }

  const next: ScanActivityTask = {
    ...current,
    active: false,
    phase: failed ? "failed" : "complete",
    currentFile: null,
    processedFiles: current.totalFiles || current.processedFiles,
    message,
    updatedAt: new Date().toISOString(),
  };
  store.tasks.set(folderId, next);
  return next;
}

export function getScanActivities() {
  return Array.from(store.tasks.values())
    .filter((task) => task.active || Date.now() - new Date(task.updatedAt).getTime() < 15_000)
    .sort((first, second) => new Date(second.updatedAt).getTime() - new Date(first.updatedAt).getTime());
}
