import { env, type ProgressCallback } from "@huggingface/transformers";
import { KokoroTTS } from "kokoro-js";
import localforage from "localforage";
import { localKokoroDtype, localKokoroModelId, localKokoroVoiceId, type LocalKokoroProgress } from "@/lib/local-kokoro-config";

type KokoroTtsInstance = {
  generate(text: string, options?: { voice?: string; speed?: number }): Promise<{ toBlob(): Blob }>;
};

type TransformersCacheRecord = {
  body: ArrayBuffer;
  headers: Record<string, string>;
  status: number;
  statusText: string;
  storedAt: number;
};

type TransformersCache = {
  match(request: RequestInfo | URL): Promise<Response | undefined>;
  put(request: RequestInfo | URL, response: Response): Promise<void>;
};

type WorkerRequest =
  | { id: number; type: "install" | "warm" }
  | { id: number; type: "synthesize"; text: string; voice: string }
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
let transformersCachePromise: Promise<TransformersCache> | null = null;
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
    const tts = await loadTts(request.id);
    throwIfCancelled(request.id);

    if (request.type === "synthesize") {
      const audio = await tts.generate(request.text, { voice: request.voice });
      throwIfCancelled(request.id);
      postResponse({ id: request.id, type: "result", blob: audio.toBlob() });
      return;
    }

    if (request.type === "install") {
      const audio = await tts.generate("Ready.", { voice: localKokoroVoiceId });
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
      message: error instanceof Error ? error.message : "On-device Kokoro failed.",
      name: error instanceof Error ? error.name : undefined,
    });
  }
}

async function loadTts(requestId: number) {
  if (!ttsPromise) {
    env.allowLocalModels = false;
    env.useCustomCache = true;
    env.customCache = await getTransformersCache();

    postResponse({ id: requestId, type: "progress", progress: { message: "Downloading on-device Kokoro..." } });
    ttsPromise = (KokoroTTS.from_pretrained(localKokoroModelId, {
      dtype: localKokoroDtype,
      device: "wasm",
      progress_callback: ((payload: ProgressPayload) => {
        postResponse({ id: requestId, type: "progress", progress: formatProgress(payload) });
      }) as ProgressCallback,
    }) as Promise<KokoroTtsInstance>).catch((error) => {
      ttsPromise = null;
      throw error;
    });
  }

  return ttsPromise;
}

async function getTransformersCache() {
  if (!transformersCachePromise) {
    transformersCachePromise = createIndexedDbTransformersCache();
  }
  return transformersCachePromise;
}

async function createIndexedDbTransformersCache(): Promise<TransformersCache> {
  const store = localforage.createInstance({
    name: "chapterchase-local-kokoro-tts",
    storeName: "hf_models",
    description: "On-device Kokoro TTS model cache",
  });

  return {
    async match(request) {
      const key = cacheKey(request);
      const record = await store.getItem<TransformersCacheRecord>(key);
      if (!record) {
        return undefined;
      }

      return new Response(record.body.slice(0), {
        headers: record.headers,
        status: record.status,
        statusText: record.statusText,
      });
    },
    async put(request, response) {
      const key = cacheKey(request);
      const cloned = response.clone();
      const headers: Record<string, string> = {};
      cloned.headers.forEach((value, header) => {
        headers[header] = value;
      });

      await store.setItem<TransformersCacheRecord>(key, {
        body: await cloned.arrayBuffer(),
        headers,
        status: cloned.status,
        statusText: cloned.statusText,
        storedAt: Date.now(),
      });
    },
  };
}

function cacheKey(request: RequestInfo | URL) {
  if (typeof request === "string") {
    return request;
  }

  if (request instanceof URL) {
    return request.toString();
  }

  if (request instanceof Request) {
    return request.url;
  }

  return String(request);
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
  const message = percent
    ? `Downloading ${fileName ?? "Kokoro"} ${percent}`
    : payload.status === "ready"
      ? "On-device Kokoro is ready."
      : `Preparing ${fileName ?? "on-device Kokoro"}...`;

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
    throw new DOMException("Local Kokoro request was cancelled.", "AbortError");
  }
}

function postResponse(response: WorkerResponse) {
  self.postMessage(response);
}
