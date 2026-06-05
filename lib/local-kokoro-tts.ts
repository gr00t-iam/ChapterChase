import {
  getLocalKokoroModelProfile,
  localKokoroCacheVersion,
  localKokoroDefaultProfileId,
  localKokoroModelId,
  localKokoroProfileStorageKey,
  localKokoroStorageKey,
  resolveLocalKokoroProfileId,
  resolveLocalKokoroVoiceId,
  type LocalKokoroInstallState,
  type LocalKokoroModelProfile,
  type LocalKokoroModelProfileId,
  type LocalKokoroProgress,
  type TtsEngine,
} from "@/lib/local-kokoro-config";
import type { WordTiming } from "@/lib/piper-sync";

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
  resolveLocalKokoroVoiceId,
  type LocalKokoroInstallState,
  type LocalKokoroModelProfile,
  type LocalKokoroModelProfileId,
  type LocalKokoroProgress,
  type TtsEngine,
} from "@/lib/local-kokoro-config";

type LocalKokoroWorkerRequest =
  | { id: number; type: "install" | "warm"; profileId: LocalKokoroModelProfileId; voiceId: string }
  | { id: number; type: "synthesize"; profileId: LocalKokoroModelProfileId; text: string; voiceId: string }
  | { id: number; type: "cancel" };

type LocalKokoroWorkerRequestInput =
  | { type: "install" | "warm"; profileId: LocalKokoroModelProfileId; voiceId: string }
  | { type: "synthesize"; profileId: LocalKokoroModelProfileId; text: string; voiceId: string };

type LocalKokoroWorkerResponse =
  | { id: number; type: "progress"; progress: LocalKokoroProgress }
  | { id: number; type: "ready" }
  | { id: number; type: "start"; sampleRate: number; durationMs: number; wordTimings: WordTiming[] }
  | {
      id: number;
      type: "chunk";
      samples: ArrayBuffer;
      sampleRate: number;
      startMs: number;
      endMs: number;
      startWordIndex: number;
      endWordIndex: number;
    }
  | { id: number; type: "complete"; durationMs: number }
  | { id: number; type: "error"; message: string; name?: string };

type PendingWorkerRequest<T> = {
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
  onProgress?: (progress: LocalKokoroProgress) => void;
  onStart?: (payload: LocalSpeechStreamStart) => void;
  onChunk?: (payload: LocalSpeechChunkPayload) => void;
  onComplete?: (payload: LocalSpeechCompletePayload) => void;
  abortHandler?: () => void;
  signal?: AbortSignal;
  streaming?: boolean;
};

export type LocalSpeechStreamStart = {
  sampleRate: number;
  durationMs: number;
  wordTimings: WordTiming[];
};

export type LocalSpeechChunkPayload = {
  samples: Float32Array;
  sampleRate: number;
  startMs: number;
  endMs: number;
  startWordIndex: number;
  endWordIndex: number;
};

export type LocalSpeechCompletePayload = {
  durationMs: number;
};

let localKokoroWorker: Worker | null = null;
let localKokoroRequestId = 0;
const pendingWorkerRequests = new Map<number, PendingWorkerRequest<unknown>>();

export function normalizeTtsEngine(value: unknown): TtsEngine {
  return value === "local" || value === "server" || value === "auto" ? value : "auto";
}

export function isLocalKokoroReady(
  state: LocalKokoroInstallState,
  profileId: LocalKokoroModelProfileId = localKokoroDefaultProfileId,
  voiceId?: string
): boolean {
  const normalizedState = normalizeLocalKokoroInstallState(state);
  if (!normalizedState || normalizedState.profileId !== profileId) {
    return false;
  }

  if (!voiceId) {
    return true;
  }

  return normalizedState.voiceId === resolveLocalKokoroVoiceId(voiceId, profileId);
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
    typeof navigator !== "undefined" &&
    typeof navigator.hardwareConcurrency === "number" &&
    typeof navigator.storage?.getDirectory === "function" &&
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
    return normalizeLocalKokoroInstallState(parsed) ?? { status: "not-installed" };
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
  const runtimeVoiceId = resolveLocalKokoroVoiceId(options.voiceId, profile.id);
  options.onProgress?.({ message: "Preparing on-device speech..." });
  await sendLocalKokoroWorkerRequest<void>({ type: "install", profileId: profile.id, voiceId: runtimeVoiceId }, options);

  const state: LocalKokoroInstallState = {
    status: "ready",
    installedAt: new Date().toISOString(),
    modelId: localKokoroModelId,
    profileId: profile.id,
    voiceId: runtimeVoiceId,
    quality: profile.quality,
    cacheVersion: localKokoroCacheVersion,
  };
  savePreferredLocalKokoroProfileId(profile.id);
  saveLocalKokoroInstallState(state);
  options.onProgress?.({ message: "On-device speech is ready." });
  return state;
}

export async function warmLocalKokoroTts(voiceId?: string, signal?: AbortSignal) {
  const profileId = getRuntimeLocalKokoroProfileId();
  await sendLocalKokoroWorkerRequest<void>(
    { type: "warm", profileId, voiceId: resolveLocalKokoroVoiceId(voiceId, profileId) },
    { signal }
  );
}

export function streamLocalKokoroSpeech(
  text: string,
  voiceId: string,
  options: {
    onStart?: (payload: LocalSpeechStreamStart) => void;
    onChunk?: (payload: LocalSpeechChunkPayload) => void;
    onComplete?: (payload: LocalSpeechCompletePayload) => void;
    onProgress?: (progress: LocalKokoroProgress) => void;
    signal?: AbortSignal;
  } = {}
) {
  const profileId = getRuntimeLocalKokoroProfileId();
  return sendLocalKokoroWorkerRequest<void>(
    {
      type: "synthesize",
      profileId,
      text,
      voiceId: resolveLocalKokoroVoiceId(voiceId, profileId),
    },
    {
      signal: options.signal,
      onProgress: options.onProgress,
      onStart: options.onStart,
      onChunk: options.onChunk,
      onComplete: options.onComplete,
      streaming: true,
    }
  );
}

function getRuntimeLocalKokoroProfileId() {
  const state = getLocalKokoroInstallState();
  if (isKnownLocalKokoroReady(state)) {
    return getStateProfileId(state);
  }

  return getPreferredLocalKokoroProfileId();
}

function isKnownLocalKokoroReady(state: LocalKokoroInstallState): boolean {
  return Boolean(normalizeLocalKokoroInstallState(state));
}

function normalizeLocalKokoroInstallState(state: LocalKokoroInstallState): LocalKokoroInstallState | null {
  if (state.status !== "ready" || state.modelId !== localKokoroModelId || state.cacheVersion !== localKokoroCacheVersion) {
    return null;
  }

  const profile = getLocalKokoroModelProfile(getStateProfileId(state));
  const voiceId = typeof state.voiceId === "string" ? state.voiceId : resolveLocalKokoroVoiceId(undefined, profile.id);
  const expectedVoiceId = resolveExpectedVoiceId(profile, voiceId);
  if (!expectedVoiceId) {
    return null;
  }

  return {
    ...state,
    profileId: profile.id,
    voiceId: expectedVoiceId,
    quality: profile.quality,
  };
}

function getStateProfileId(state: LocalKokoroInstallState): LocalKokoroModelProfileId {
  if (state.profileId) {
    return resolveLocalKokoroProfileId(state.profileId);
  }

  if (state.quality === "high") {
    return "full";
  }

  return localKokoroDefaultProfileId;
}

function resolveExpectedVoiceId(profile: LocalKokoroModelProfile, voiceId: string) {
  if (voiceId === profile.femaleVoiceId || voiceId === profile.maleVoiceId) {
    return voiceId;
  }

  return null;
}

function sendLocalKokoroWorkerRequest<T>(
  request: LocalKokoroWorkerRequestInput,
  options: {
    onProgress?: (progress: LocalKokoroProgress) => void;
    onStart?: (payload: LocalSpeechStreamStart) => void;
    onChunk?: (payload: LocalSpeechChunkPayload) => void;
    onComplete?: (payload: LocalSpeechCompletePayload) => void;
    signal?: AbortSignal;
    streaming?: boolean;
  } = {}
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
      onStart: options.onStart,
      onChunk: options.onChunk,
      onComplete: options.onComplete,
      abortHandler,
      signal: options.signal,
      streaming: options.streaming,
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

  if (message.type === "start") {
    pending.onStart?.({
      sampleRate: message.sampleRate,
      durationMs: message.durationMs,
      wordTimings: message.wordTimings,
    });
    return;
  }

  if (message.type === "chunk") {
    pending.onChunk?.({
      samples: new Float32Array(message.samples),
      sampleRate: message.sampleRate,
      startMs: message.startMs,
      endMs: message.endMs,
      startWordIndex: message.startWordIndex,
      endWordIndex: message.endWordIndex,
    });
    return;
  }

  if (message.type === "complete") {
    pending.onComplete?.({ durationMs: message.durationMs });
    pendingWorkerRequests.delete(message.id);
    cleanupPendingWorkerRequest(pending);
    pending.resolve(undefined);
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
