import { getKokoroVoiceName } from "@/lib/kokoro-voices";
import {
  localKokoroDtype,
  localKokoroModelId,
  localKokoroStorageKey,
  localKokoroVoiceId,
  type LocalKokoroInstallState,
  type LocalKokoroProgress,
  type TtsEngine,
} from "@/lib/local-kokoro-config";

export {
  localKokoroDownloadDescription,
  localKokoroDtype,
  localKokoroModelId,
  localKokoroStorageKey,
  localKokoroVoiceId,
  type LocalKokoroInstallState,
  type LocalKokoroProgress,
  type TtsEngine,
} from "@/lib/local-kokoro-config";

type LocalKokoroWorkerRequest =
  | { id: number; type: "install" | "warm" }
  | { id: number; type: "synthesize"; text: string; voice: string }
  | { id: number; type: "cancel" };

type LocalKokoroWorkerRequestInput =
  | { type: "install" | "warm" }
  | { type: "synthesize"; text: string; voice: string };

type LocalKokoroWorkerResponse =
  | { id: number; type: "progress"; progress: LocalKokoroProgress }
  | { id: number; type: "ready" }
  | { id: number; type: "result"; blob: Blob }
  | { id: number; type: "error"; message: string; name?: string };

type PendingWorkerRequest<T> = {
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
  onProgress?: (progress: LocalKokoroProgress) => void;
  abortHandler?: () => void;
  signal?: AbortSignal;
};

let localKokoroWorker: Worker | null = null;
let localKokoroRequestId = 0;
const pendingWorkerRequests = new Map<number, PendingWorkerRequest<unknown>>();

export function normalizeTtsEngine(value: unknown): TtsEngine {
  return value === "local" || value === "server" || value === "auto" ? value : "auto";
}

export function isLocalKokoroReady(state: LocalKokoroInstallState): boolean {
  return (
    state.status === "ready" &&
    state.modelId === localKokoroModelId &&
    state.voice === localKokoroVoiceId &&
    state.dtype === localKokoroDtype
  );
}

export function shouldUseLocalKokoro(engine: TtsEngine, state: LocalKokoroInstallState): boolean {
  if (engine === "local") {
    return true;
  }

  if (engine === "server") {
    return false;
  }

  return isLocalKokoroReady(state);
}

export function supportsLocalKokoroRuntime(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const workerCapableWindow = window as typeof window & { Worker?: typeof Worker };
  return (
    typeof WebAssembly !== "undefined" &&
    typeof workerCapableWindow.Worker === "function" &&
    typeof window.indexedDB !== "undefined" &&
    typeof window.fetch === "function" &&
    typeof Blob !== "undefined" &&
    typeof Response !== "undefined"
  );
}

export function getLocalKokoroInstallState(): LocalKokoroInstallState {
  if (typeof window === "undefined") {
    return { status: "not-installed" };
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(localKokoroStorageKey) ?? "{}") as LocalKokoroInstallState;
    return isLocalKokoroReady(parsed) ? parsed : { status: "not-installed" };
  } catch {
    return { status: "not-installed" };
  }
}

export function saveLocalKokoroInstallState(state: LocalKokoroInstallState) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(localKokoroStorageKey, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent("chapterchase:local-kokoro-tts"));
}

export async function installLocalKokoroModel(options: { onProgress?: (progress: LocalKokoroProgress) => void; signal?: AbortSignal } = {}) {
  options.onProgress?.({ message: "Preparing on-device Kokoro..." });
  await sendLocalKokoroWorkerRequest<void>({ type: "install" }, options);

  const state: LocalKokoroInstallState = {
    status: "ready",
    installedAt: new Date().toISOString(),
    modelId: localKokoroModelId,
    voice: localKokoroVoiceId,
    dtype: localKokoroDtype,
  };
  saveLocalKokoroInstallState(state);
  options.onProgress?.({ message: "On-device Kokoro is ready." });
  return state;
}

export async function warmLocalKokoroTts(signal?: AbortSignal) {
  await sendLocalKokoroWorkerRequest<void>({ type: "warm" }, { signal });
}

export function synthesizeLocalKokoroBlob(text: string, voiceId: string, signal?: AbortSignal): Promise<Blob> {
  return sendLocalKokoroWorkerRequest<Blob>(
    {
      type: "synthesize",
      text,
      voice: resolveLocalKokoroVoiceName(voiceId),
    },
    { signal }
  );
}

function resolveLocalKokoroVoiceName(voiceId: string) {
  const numericVoiceId = Number(voiceId);
  return Number.isInteger(numericVoiceId) ? getKokoroVoiceName(numericVoiceId) : voiceId || localKokoroVoiceId;
}

function sendLocalKokoroWorkerRequest<T>(
  request: LocalKokoroWorkerRequestInput,
  options: { onProgress?: (progress: LocalKokoroProgress) => void; signal?: AbortSignal } = {}
) {
  if (!supportsLocalKokoroRuntime()) {
    return Promise.reject(new Error("On-device Kokoro is not supported in this browser."));
  }

  if (options.signal?.aborted) {
    return Promise.reject(createAbortError());
  }

  const worker = getLocalKokoroWorker();
  const id = ++localKokoroRequestId;

  return new Promise<T>((resolve, reject) => {
    const abortHandler = () => {
      pendingWorkerRequests.delete(id);
      worker.postMessage({ id, type: "cancel" } satisfies LocalKokoroWorkerRequest);
      reject(createAbortError());
    };

    pendingWorkerRequests.set(id, {
      resolve: resolve as (value: unknown) => void,
      reject,
      onProgress: options.onProgress,
      abortHandler,
      signal: options.signal,
    });

    options.signal?.addEventListener("abort", abortHandler, { once: true });
    worker.postMessage({ ...request, id } as LocalKokoroWorkerRequest);
  });
}

function getLocalKokoroWorker() {
  if (localKokoroWorker) {
    return localKokoroWorker;
  }

  localKokoroWorker = new Worker(new URL("../workers/local-kokoro-tts.worker.ts", import.meta.url), {
    name: "chapterchase-local-kokoro-tts",
    type: "module",
  });
  localKokoroWorker.onmessage = (event: MessageEvent<LocalKokoroWorkerResponse>) => handleWorkerMessage(event.data);
  localKokoroWorker.onerror = (event) => {
    rejectAllWorkerRequests(new Error(event.message || "On-device Kokoro worker failed."));
    localKokoroWorker?.terminate();
    localKokoroWorker = null;
  };
  localKokoroWorker.onmessageerror = () => {
    rejectAllWorkerRequests(new Error("Unable to read on-device Kokoro worker response."));
    localKokoroWorker?.terminate();
    localKokoroWorker = null;
  };

  return localKokoroWorker;
}

function handleWorkerMessage(message: LocalKokoroWorkerResponse) {
  const pending = pendingWorkerRequests.get(message.id);
  if (!pending) {
    return;
  }

  if (message.type === "progress") {
    pending.onProgress?.(message.progress);
    return;
  }

  pendingWorkerRequests.delete(message.id);
  cleanupPendingWorkerRequest(pending);

  if (message.type === "error") {
    const error = new Error(message.message);
    error.name = message.name ?? "Error";
    pending.reject(error);
    return;
  }

  if (message.type === "result") {
    pending.resolve(message.blob);
    return;
  }

  pending.resolve(undefined);
}

function rejectAllWorkerRequests(error: Error) {
  for (const pending of pendingWorkerRequests.values()) {
    cleanupPendingWorkerRequest(pending);
    pending.reject(error);
  }
  pendingWorkerRequests.clear();
}

function cleanupPendingWorkerRequest(pending: PendingWorkerRequest<unknown>) {
  if (pending.abortHandler) {
    pending.signal?.removeEventListener("abort", pending.abortHandler);
  }
}

function createAbortError() {
  return new DOMException("Local Kokoro request was aborted.", "AbortError");
}
