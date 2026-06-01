import { env, type ProgressCallback } from "@huggingface/transformers";
import { KokoroTTS } from "kokoro-js";
import {
  getLocalKokoroModelProfile,
  localKokoroModelId,
  localKokoroVoiceId,
  type LocalKokoroModelProfileId,
  type LocalKokoroProgress,
} from "@/lib/local-kokoro-config";

type KokoroTtsInstance = {
  generate(text: string, options?: { voice?: string; speed?: number }): Promise<{ toBlob(): Blob }>;
};

type WorkerRequest =
  | { id: number; type: "install" | "warm"; profileId: LocalKokoroModelProfileId; voice?: string }
  | { id: number; type: "synthesize"; profileId: LocalKokoroModelProfileId; text: string; voice: string }
  | { id: number; type: "cancel" };

type WorkerResponse =
  | { id: number; type: "progress"; progress: LocalKokoroProgress }
  | { id: number; type: "ready" }
  | { id: number; type: "result"; blob: Blob }
  | { id: number; type: "error"; message: string; name?: string };

type ProgressPayload = {
  status?: string;
  name?: string;
  file?: string;
  loaded?: number;
  total?: number;
  progress?: number;
};

let ttsPromise: Promise<KokoroTtsInstance> | null = null;
let ttsProfileId: LocalKokoroModelProfileId | null = null;
let originalFetch: typeof fetch | null = null;
const cancelledRequests = new Set<number>();

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (request.type === "cancel") {
    cancelledRequests.add(request.id);
    return;
  }

  void handleRequest(request);
};

async function handleRequest(request: Exclude<WorkerRequest, { type: "cancel" }>) {
  try {
    const tts = await loadTts(request.id, request.profileId);
    throwIfCancelled(request.id);

    if (request.type === "synthesize") {
      const audio = await tts.generate(request.text, { voice: request.voice, speed: 1 });
      throwIfCancelled(request.id);
      postResponse({ id: request.id, type: "result", blob: audio.toBlob() });
      return;
    }

    if (request.type === "install") {
      const audio = await tts.generate("Ready.", { voice: request.voice ?? localKokoroVoiceId, speed: 1 });
      audio.toBlob();
    }

    throwIfCancelled(request.id);
    postResponse({ id: request.id, type: "ready" });
  } catch (error) {
    if (cancelledRequests.has(request.id)) {
      cancelledRequests.delete(request.id);
      return;
    }

    postResponse({
      id: request.id,
      type: "error",
      message: error instanceof Error ? error.message : "On-device speech failed.",
      name: error instanceof Error ? error.name : undefined,
    });
  }
}

async function loadTts(requestId: number, profileId: LocalKokoroModelProfileId) {
  const profile = getLocalKokoroModelProfile(profileId);
  if (!ttsPromise || ttsProfileId !== profile.id) {
    configureTransformersEnvironment();
    configureVoiceFetchProxy();

    postResponse({ id: requestId, type: "progress", progress: { message: "Downloading on-device speech..." } });
    ttsProfileId = profile.id;
    ttsPromise = (KokoroTTS.from_pretrained(localKokoroModelId, {
      dtype: profile.dtype,
      device: "wasm",
      progress_callback: ((payload: ProgressPayload) => {
        postResponse({ id: requestId, type: "progress", progress: formatProgress(payload) });
      }) as ProgressCallback,
    }) as Promise<KokoroTtsInstance>).catch((error) => {
      ttsPromise = null;
      ttsProfileId = null;
      throw error;
    });
  }

  return ttsPromise;
}

function configureTransformersEnvironment() {
  env.allowLocalModels = false;
  env.allowRemoteModels = true;
  env.useCustomCache = false;
  env.customCache = null;
  env.useBrowserCache = true;
  env.remoteHost = self.location.origin;
  env.remotePathTemplate = "/api/tts/local-model/{model}/resolve/{revision}/";
}

function configureVoiceFetchProxy() {
  if (originalFetch) {
    return;
  }

  originalFetch = self.fetch.bind(self);
  self.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const proxyUrl = getKokoroAssetProxyUrl(input);
    if (!proxyUrl) {
      return originalFetch?.(input, init) ?? fetch(input, init);
    }

    if (input instanceof Request) {
      return originalFetch?.(new Request(proxyUrl, input), init) ?? fetch(proxyUrl, init);
    }

    return originalFetch?.(proxyUrl, init) ?? fetch(proxyUrl, init);
  }) as typeof fetch;
}

function getKokoroAssetProxyUrl(input: RequestInfo | URL) {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const base = "https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/";
  if (!url.startsWith(base)) {
    return null;
  }

  const assetPath = url.slice(base.length);
  if (!/^voices\/[a-z]{2}_[a-z0-9_]+\.bin$/.test(assetPath)) {
    return null;
  }

  return `${self.location.origin}/api/tts/local-model/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/${assetPath}`;
}

function formatProgress(payload: ProgressPayload): LocalKokoroProgress {
  const fileName = payload.file ?? payload.name;
  const progress =
    typeof payload.progress === "number"
      ? payload.progress
      : typeof payload.loaded === "number" && typeof payload.total === "number" && payload.total > 0
        ? (payload.loaded / payload.total) * 100
        : undefined;

  const percent = typeof progress === "number" && Number.isFinite(progress) ? `${Math.max(0, Math.min(100, progress)).toFixed(0)}%` : null;
  let message: string;
  if (percent) {
    message = `Downloading ${fileName ?? "speech model"} ${percent}`;
  } else if (payload.status === "done") {
    message = `Cached ${fileName ?? "on-device speech"}.`;
  } else if (payload.status === "ready") {
    message = "On-device speech is ready.";
  } else if (payload.status === "download") {
    message = `Starting ${fileName ?? "on-device speech"}...`;
  } else {
    message = `Preparing ${fileName ?? "on-device speech"}...`;
  }

  return {
    message,
    loaded: payload.loaded,
    total: payload.total,
    progress,
  };
}

function throwIfCancelled(requestId: number) {
  if (cancelledRequests.has(requestId)) {
    cancelledRequests.delete(requestId);
    throw new DOMException("Local speech request was cancelled.", "AbortError");
  }
}

function postResponse(response: WorkerResponse) {
  self.postMessage(response);
}
