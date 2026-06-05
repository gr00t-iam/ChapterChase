import { type LocalKokoroModelProfileId, type LocalKokoroProgress } from "@/lib/local-kokoro-config";
import { buildWordTimingMap, chunkFloat32Audio, resolveChunkWordRange, samplesToMilliseconds } from "@/lib/piper-sync";

type WorkerRequest =
  | { id: number; type: "install" | "warm"; profileId: LocalKokoroModelProfileId; voiceId: string }
  | { id: number; type: "synthesize"; profileId: LocalKokoroModelProfileId; text: string; voiceId: string }
  | { id: number; type: "cancel" };

type WorkerResponse =
  | { id: number; type: "progress"; progress: LocalKokoroProgress }
  | { id: number; type: "ready" }
  | { id: number; type: "start"; sampleRate: number; durationMs: number; wordTimings: ReturnType<typeof buildWordTimingMap> }
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

type PiperProgressPayload = {
  total: number;
  loaded: number;
};

type OrtTensor = unknown;

type OrtModule = {
  env: {
    allowLocalModels: boolean;
    wasm: {
      numThreads: number;
      wasmPaths: string;
    };
  };
  Tensor: new (type: string, data: number[] | Float32Array | BigInt64Array, dims: number[]) => OrtTensor;
  InferenceSession: {
    create(model: ArrayBuffer): Promise<{
      run(feeds: Record<string, OrtTensor>): Promise<{ output: { data: Float32Array | number[] } }>;
    }>;
  };
};

type PiperModuleFactory = (moduleArg?: {
  print?: (text: string) => void;
  printErr?: (text: string) => void;
  locateFile?: (url: string) => string;
}) => Promise<{
  callMain(args: string[]): void;
}>;

type PiperModelConfig = {
  audio: {
    sample_rate: number;
  };
  inference: {
    noise_scale: number;
    length_scale: number;
    noise_w: number;
  };
  espeak: {
    voice: string;
  };
  speaker_id_map: Record<string, number>;
};

type LocalPiperSession = {
  voiceId: string;
  sampleRate: number;
  predict(text: string): Promise<Float32Array>;
};

const hfBase = "https://huggingface.co/diffusionstudio/piper-voices/resolve/main";
const localOnnxModuleUrl = `${self.location.origin}/vendor/onnxruntime/ort.wasm.mjs`;
const localOnnxWasmBase = `${self.location.origin}/vendor/onnxruntime/`;
const localPiperPhonemizeJsUrl = `${self.location.origin}/vendor/piper-wasm/piper_phonemize.js`;
const localPiperPhonemizeDataUrl = `${self.location.origin}/vendor/piper-wasm/piper_phonemize.data`;
const localPiperPhonemizeWasmUrl = `${self.location.origin}/vendor/piper-wasm/piper_phonemize.wasm`;

const voiceModelPaths: Record<string, string> = {
  "en_US-lessac-low": "en/en_US/lessac/low/en_US-lessac-low.onnx",
  "en_US-lessac-high": "en/en_US/lessac/high/en_US-lessac-high.onnx",
  "en_US-ryan-low": "en/en_US/ryan/low/en_US-ryan-low.onnx",
  "en_US-ryan-high": "en/en_US/ryan/high/en_US-ryan-high.onnx",
};

const workerScope = self as typeof self & {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void;
  setTimeout(handler: TimerHandler, timeout?: number): number;
};

let ortPromise: Promise<OrtModule> | null = null;
let phonemizerFactoryPromise: Promise<PiperModuleFactory> | null = null;
let sessionPromise: Promise<LocalPiperSession> | null = null;
let sessionVoiceId: string | null = null;
const cancelledRequests = new Set<number>();

workerScope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (request.type === "cancel") {
    cancelledRequests.add(request.id);
    return;
  }

  void handleRequest(request);
};

async function handleRequest(request: Exclude<WorkerRequest, { type: "cancel" }>) {
  try {
    if (request.type === "install") {
      await ensureVoiceDownloaded(request.id, request.voiceId);
      throwIfCancelled(request.id);
      postResponse({ id: request.id, type: "ready" });
      return;
    }

    const session = await loadSession(request.id, request.voiceId);
    throwIfCancelled(request.id);

    if (request.type === "warm") {
      postResponse({ id: request.id, type: "ready" });
      return;
    }

    if (request.type !== "synthesize") {
      throw new Error("Unsupported local speech request.");
    }

    postResponse({ id: request.id, type: "progress", progress: { message: "Generating on-device speech..." } });
    const samples = await session.predict(request.text);
    throwIfCancelled(request.id);

    const durationMs = samplesToMilliseconds(samples.length, session.sampleRate);
    const wordTimings = buildWordTimingMap({ text: request.text, durationMs });
    postResponse({ id: request.id, type: "start", sampleRate: session.sampleRate, durationMs, wordTimings });

    const audioChunks = chunkFloat32Audio(samples, Math.max(4096, Math.round(session.sampleRate / 5)));
    for (const [index, chunk] of audioChunks.entries()) {
      throwIfCancelled(request.id);
      const startMs = samplesToMilliseconds(chunk.startSample, session.sampleRate);
      const endMs = samplesToMilliseconds(chunk.endSample, session.sampleRate);
      const wordRange = resolveChunkWordRange({ chunkStartMs: startMs, chunkEndMs: endMs, timings: wordTimings });
      const chunkSamples = chunk.samples;
      postResponse(
        {
          id: request.id,
          type: "chunk",
          samples: chunkSamples.buffer as ArrayBuffer,
          sampleRate: session.sampleRate,
          startMs,
          endMs,
          startWordIndex: wordRange.startWordIndex,
          endWordIndex: wordRange.endWordIndex,
        },
        [chunkSamples.buffer as ArrayBuffer]
      );

      if (index % 8 === 7) {
        await yieldToEventLoop();
      }
    }

    throwIfCancelled(request.id);
    postResponse({ id: request.id, type: "complete", durationMs });
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

async function ensureVoiceDownloaded(requestId: number, voiceId: string) {
  const savedVoices = await storedVoices();
  if (savedVoices.includes(voiceId)) {
    postResponse({ id: requestId, type: "progress", progress: { message: "On-device speech is already downloaded." } });
    return;
  }

  postResponse({ id: requestId, type: "progress", progress: { message: "Downloading on-device speech..." } });
  await downloadVoice(voiceId, createProgressCallback(requestId));
}

async function loadSession(requestId: number, voiceId: string) {
  if (!sessionPromise || sessionVoiceId !== voiceId) {
    sessionPromise = createPiperSession(requestId, voiceId).catch((error) => {
      sessionPromise = null;
      sessionVoiceId = null;
      throw error;
    });
    sessionVoiceId = voiceId;
  }

  return sessionPromise;
}

async function createPiperSession(requestId: number, voiceId: string): Promise<LocalPiperSession> {
  postResponse({ id: requestId, type: "progress", progress: { message: "Loading on-device speech..." } });
  const modelPath = getVoiceModelPath(voiceId);
  const [ort, modelConfigBlob, modelBlob, createPiperPhonemize] = await Promise.all([
    loadOrtModule(),
    getBlob(`${hfBase}/${modelPath}.json`),
    getBlob(`${hfBase}/${modelPath}`, createProgressCallback(requestId)),
    loadPhonemizerFactory(),
  ]);

  const modelConfig = JSON.parse(await modelConfigBlob.text()) as PiperModelConfig;
  const ortSession = await ort.InferenceSession.create(await modelBlob.arrayBuffer());

  return {
    voiceId,
    sampleRate: modelConfig.audio.sample_rate,
    async predict(text: string) {
      const phonemeIds = await phonemizeText(createPiperPhonemize, modelConfig, text);
      const feeds: Record<string, OrtTensor> = {
        input: new ort.Tensor("int64", phonemeIds, [1, phonemeIds.length]),
        input_lengths: new ort.Tensor("int64", [phonemeIds.length], [1]),
        scales: new ort.Tensor("float32", [modelConfig.inference.noise_scale, modelConfig.inference.length_scale, modelConfig.inference.noise_w], [3]),
      };

      if (Object.keys(modelConfig.speaker_id_map).length) {
        feeds.sid = new ort.Tensor("int64", [0], [1]);
      }

      const output = await ortSession.run(feeds);
      const pcm = output.output.data;
      return pcm instanceof Float32Array ? pcm : Float32Array.from(pcm);
    },
  };
}

async function phonemizeText(createPiperPhonemize: PiperModuleFactory, modelConfig: PiperModelConfig, text: string) {
  return new Promise<number[]>(async (resolve, reject) => {
    try {
      const input = JSON.stringify([{ text: text.trim() }]);
      const phonemizerModule = await createPiperPhonemize({
        print: (data) => {
          try {
            const parsed = JSON.parse(data) as { phoneme_ids?: number[] };
            if (Array.isArray(parsed.phoneme_ids)) {
              resolve(parsed.phoneme_ids);
              return;
            }
            reject(new Error("Phonemizer returned an unexpected payload."));
          } catch (error) {
            reject(error);
          }
        },
        printErr: (message) => reject(new Error(message)),
        locateFile: (url) => {
          if (url.endsWith(".wasm")) {
            return localPiperPhonemizeWasmUrl;
          }
          if (url.endsWith(".data")) {
            return localPiperPhonemizeDataUrl;
          }
          return url;
        },
      });

      phonemizerModule.callMain(["-l", modelConfig.espeak.voice, "--input", input, "--espeak_data", "/espeak-ng-data"]);
    } catch (error) {
      reject(error);
    }
  });
}

async function loadOrtModule() {
  if (!ortPromise) {
    ortPromise = importModule<OrtModule>(localOnnxModuleUrl).then((ort) => {
      ort.env.allowLocalModels = false;
      ort.env.wasm.numThreads = Math.max(1, navigator.hardwareConcurrency || 1);
      ort.env.wasm.wasmPaths = localOnnxWasmBase;
      return ort;
    });
  }

  return ortPromise;
}

async function loadPhonemizerFactory() {
  if (!phonemizerFactoryPromise) {
    phonemizerFactoryPromise = fetch(localPiperPhonemizeJsUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error("Unable to load local Piper phonemizer.");
        }
        return response.text();
      })
      .then((source) => {
        const evaluator = new Function(`${source}\nreturn createPiperPhonemize;`) as () => PiperModuleFactory;
        return evaluator();
      });
  }

  return phonemizerFactoryPromise;
}

async function storedVoices() {
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle("piper", { create: true });
  const installed = new Set<string>();
  const directoryKeys = dir as unknown as { keys(): AsyncIterable<string> };

  for await (const name of directoryKeys.keys()) {
    const voiceId = name.replace(/\.onnx(?:\.json)?$/, "");
    if (voiceId in voiceModelPaths) {
      installed.add(voiceId);
    }
  }

  return [...installed];
}

async function downloadVoice(voiceId: string, callback?: (payload: PiperProgressPayload) => void) {
  const modelPath = getVoiceModelPath(voiceId);
  await Promise.all([
    getBlob(`${hfBase}/${modelPath}`, callback),
    getBlob(`${hfBase}/${modelPath}.json`),
  ]);
}

async function getBlob(url: string, callback?: (payload: PiperProgressPayload) => void) {
  const cached = await readBlob(url);
  if (cached) {
    return cached;
  }

  const blob = await fetchBlob(url, callback);
  await writeBlob(url, blob);
  return blob;
}

async function readBlob(url: string) {
  try {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle("piper", { create: true });
    const fileHandle = await dir.getFileHandle(url.split("/").at(-1) ?? "");
    return fileHandle.getFile();
  } catch {
    return undefined;
  }
}

async function writeBlob(url: string, blob: Blob) {
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle("piper", { create: true });
  const fileHandle = await dir.getFileHandle(url.split("/").at(-1) ?? "", { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}

async function fetchBlob(url: string, callback?: (payload: PiperProgressPayload) => void) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Unable to download on-device speech asset (${response.status}).`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    return response.blob();
  }

  const contentLength = Number(response.headers.get("Content-Length") ?? 0);
  let receivedLength = 0;
  const chunks: BlobPart[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    chunks.push(value.slice());
    receivedLength += value.length;
    callback?.({ total: contentLength, loaded: receivedLength });
  }

  return new Blob(chunks, { type: response.headers.get("Content-Type") ?? undefined });
}

function getVoiceModelPath(voiceId: string) {
  const modelPath = voiceModelPaths[voiceId];
  if (!modelPath) {
    throw new Error(`Unsupported local Piper voice: ${voiceId}`);
  }

  return modelPath;
}

function createProgressCallback(requestId: number) {
  return (payload: PiperProgressPayload) => {
    const progress = payload.total > 0 ? (payload.loaded / payload.total) * 100 : undefined;
    const percent = typeof progress === "number" && Number.isFinite(progress) ? `${Math.round(progress)}%` : null;
    postResponse({
      id: requestId,
      type: "progress",
      progress: {
        message: percent ? `Downloading on-device speech ${percent}` : "Downloading on-device speech...",
        loaded: payload.loaded,
        total: payload.total,
        progress,
      },
    });
  };
}

function throwIfCancelled(requestId: number) {
  if (cancelledRequests.has(requestId)) {
    cancelledRequests.delete(requestId);
    throw new DOMException("Local speech request was cancelled.", "AbortError");
  }
}

function postResponse(response: WorkerResponse, transfer?: Transferable[]) {
  workerScope.postMessage(response, transfer ?? []);
}

function yieldToEventLoop() {
  return new Promise<void>((resolve) => {
    workerScope.setTimeout(resolve, 0);
  });
}

function importModule<T>(moduleUrl: string) {
  const dynamicImport = new Function("url", "return import(url)") as (url: string) => Promise<T>;
  return dynamicImport(moduleUrl);
}
