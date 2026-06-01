import { getKokoroVoiceName } from "@/lib/kokoro-voices";
import {
  getLocalKokoroModelProfile,
  localKokoroCacheVersion,
  localKokoroDefaultProfileId,
  localKokoroModelProfiles,
  localKokoroModelId,
  localKokoroProfileStorageKey,
  localKokoroStorageKey,
  localKokoroVoiceId,
  resolveLocalKokoroProfileId,
  type LocalKokoroInstallState,
  type LocalKokoroModelProfileId,
  type LocalKokoroProgress,
  type TtsEngine,
} from "@/lib/local-kokoro-config";

export {
  getLocalKokoroModelProfile,
  localKokoroDownloadDescription,
  localKokoroCacheVersion,
  localKokoroDefaultProfileId,
  localKokoroDtype,
  localKokoroModelProfiles,
  localKokoroModelId,
  localKokoroProfileStorageKey,
  localKokoroStorageKey,
  localKokoroVoiceId,
  resolveLocalKokoroProfileId,
  type LocalKokoroInstallState,
  type LocalKokoroModelProfile,
  type LocalKokoroModelProfileId,
  type LocalKokoroProgress,
  type TtsEngine,
} from "@/lib/local-kokoro-config";

type LocalKokoroWorkerRequest =
  | { id: number; type: "install" | "warm"; profileId: LocalKokoroModelProfileId; voice?: string }
  | { id: number; type: "synthesize"; profileId: LocalKokoroModelProfileId; text: string; voice: string }
  | { id: number; type: "cancel" };

type LocalKokoroWorkerRequestInput =
  | { type: "install" | "warm"; profileId: LocalKokoroModelProfileId; voice?: string }
  | { type: "synthesize"; profileId: LocalKokoroModelProfileId; text: string; voice: string };

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

export function isLocalKokoroReady(state: LocalKokoroInstallState, profileId: LocalKokoroModelProfileId = localKokoroDefaultProfileId): boolean {
  const profile = getLocalKokoroModelProfile(profileId);
  const normalizedProfileId = getStateProfileId(state);
  return (
    isKnownLocalKokoroReady(state) &&
    normalizedProfileId === profile.id &&
    state.dtype === profile.dtype &&
    (state.modelFile === profile.modelFile || (profile.id === "balanced" && !state.modelFile))
  );
}

export function shouldUseLocalKokoro(engine: TtsEngine, state: LocalKokoroInstallState): boolean {
  if (engine === "local") {
    return true;
  }

  if (engine === "server") {
    return false;
  }

  return isKnownLocalKokoroReady(state);
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
    typeof caches !== "undefined" &&
    typeof caches.open === "function" &&
    typeof ReadableStream !== "undefined" &&
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
    return isKnownLocalKokoroReady(parsed) ? normalizeLocalKokoroInstallState(parsed) : { status: "not-installed" };
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

export function getPreferredLocalKokoroProfileId(): LocalKokoroModelProfileId {
  if (typeof window === "undefined") {
    return localKokoroDefaultProfileId;
  }

  const storedProfile = window.localStorage.getItem(localKokoroProfileStorageKey);
  if (storedProfile === "balanced" || storedProfile === "full") {
    return storedProfile;
  }

  return getStateProfileId(getLocalKokoroInstallState());
}

export function savePreferredLocalKokoroProfileId(profileId: LocalKokoroModelProfileId) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(localKokoroProfileStorageKey, profileId);
  window.dispatchEvent(new CustomEvent("chapterchase:local-kokoro-tts"));
}

export async function installLocalKokoroModel(
  options: { onProgress?: (progress: LocalKokoroProgress) => void; signal?: AbortSignal; voiceId?: string; profileId?: LocalKokoroModelProfileId } = {}
) {
  const profile = getLocalKokoroModelProfile(options.profileId ?? getPreferredLocalKokoroProfileId());
  const voice = resolveLocalKokoroVoiceName(options.voiceId ?? localKokoroVoiceId);
  options.onProgress?.({ message: "Preparing on-device speech..." });
  await sendLocalKokoroWorkerRequest<void>({ type: "install", profileId: profile.id, voice }, options);

  const state: LocalKokoroInstallState = {
    status: "ready",
    installedAt: new Date().toISOString(),
    modelId: localKokoroModelId,
    profileId: profile.id,
    voice,
    dtype: profile.dtype,
    modelFile: profile.modelFile,
    cacheVersion: localKokoroCacheVersion,
  };
  savePreferredLocalKokoroProfileId(profile.id);
  saveLocalKokoroInstallState(state);
  options.onProgress?.({ message: "On-device speech is ready." });
  return state;
}

export async function warmLocalKokoroTts(signal?: AbortSignal) {
  await sendLocalKokoroWorkerRequest<void>({ type: "warm", profileId: getRuntimeLocalKokoroProfileId() }, { signal });
}

export function synthesizeLocalKokoroBlob(text: string, voiceId: string, signal?: AbortSignal): Promise<Blob> {
  return sendLocalKokoroWorkerRequest<Blob>(
    {
      type: "synthesize",
      profileId: getRuntimeLocalKokoroProfileId(),
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

function getRuntimeLocalKokoroProfileId() {
  const state = getLocalKokoroInstallState();
  if (isKnownLocalKokoroReady(state)) {
    return getStateProfileId(state);
  }

  return getPreferredLocalKokoroProfileId();
}

function isKnownLocalKokoroReady(state: LocalKokoroInstallState): boolean {
  if (state.status !== "ready" || state.modelId !== localKokoroModelId || state.cacheVersion !== localKokoroCacheVersion) {
    return false;
  }

  const profile = getLocalKokoroModelProfile(getStateProfileId(state));
  return state.dtype === profile.dtype && (state.modelFile === profile.modelFile || (profile.id === "balanced" && !state.modelFile));
}

function normalizeLocalKokoroInstallState(state: LocalKokoroInstallState): LocalKokoroInstallState {
  const profile = getLocalKokoroModelProfile(getStateProfileId(state));
  return {
    ...state,
    profileId: profile.id,
    dtype: profile.dtype,
    modelFile: profile.modelFile,
  };
}

function getStateProfileId(state: LocalKokoroInstallState): LocalKokoroModelProfileId {
  if (state.profileId) {
    return resolveLocalKokoroProfileId(state.profileId);
  }

  const profile = Object.values(localKokoroModelProfiles).find((candidate) => candidate.dtype === state.dtype);
  return profile?.id ?? localKokoroDefaultProfileId;
}

function sendLocalKokoroWorkerRequest<T>(
  request: LocalKokoroWorkerRequestInput,
  options: { onProgress?: (progress: LocalKokoroProgress) => void; signal?: AbortSignal } = {}
) {
  if (!supportsLocalKokoroRuntime()) {
    return Promise.reject(new Error("On-device speech is not supported in this browser."));
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
    rejectAllWorkerRequests(new Error(event.message || "On-device speech worker failed."));
    localKokoroWorker?.terminate();
    localKokoroWorker = null;
  };
  localKokoroWorker.onmessageerror = () => {
    rejectAllWorkerRequests(new Error("Unable to read on-device speech worker response."));
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
  return new DOMException("Local speech request was aborted.", "AbortError");
}
