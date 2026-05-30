import fs from "node:fs";
import os from "node:os";
import { createRequire } from "node:module";
import path from "node:path";
import { defaultKokoroVoiceId, getKokoroVoiceName, resolveKokoroVoiceId } from "@/lib/kokoro-voices";
import { dataDir } from "@/lib/paths";
import type { OfflineTts } from "sherpa-onnx-node";

const maxTtsCharacters = 12000;
const requiredModelEntries = ["model.onnx", "voices.bin", "tokens.txt", "espeak-ng-data"] as const;

let cachedTts: { modelDir: string; tts: OfflineTts } | null = null;
let cachedTtsPromise: Promise<{ modelDir: string; tts: OfflineTts }> | null = null;
let cachedOfflineTtsCtorPromise: Promise<new (config: unknown) => OfflineTts> | null = null;
let warmupState:
  | { status: "idle"; startedAt?: undefined; finishedAt?: undefined; error?: undefined }
  | { status: "warming"; startedAt: string; finishedAt?: undefined; error?: undefined }
  | { status: "ready"; startedAt: string; finishedAt: string; error?: undefined }
  | { status: "error"; startedAt: string; finishedAt: string; error: string } = { status: "idle" };
let warmupPromise: Promise<void> | null = null;

export class SherpaTtsSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SherpaTtsSetupError";
  }
}

export function getSherpaTtsConfigSummary() {
  return {
    modelDir: getKokoroModelDir(),
    speakerId: defaultKokoroVoiceId,
    voiceName: getKokoroVoiceName(defaultKokoroVoiceId),
  };
}

export async function synthesizeWithSherpaKokoro(text: string, voice: unknown = defaultKokoroVoiceId) {
  const normalizedText = normalizeTtsText(text);
  if (!normalizedText) {
    throw new Error("Text is required.");
  }

  const voiceId = resolveKokoroVoiceId(voice);
  const tts = await getOfflineTts();
  const audio = tts.generate({
    text: normalizedText,
    sid: voiceId,
    speed: getNumberEnv("CHAPTERCHASE_TTS_SPEED", 1),
  });

  return encodeMonoPcm16Wav(audio.samples, audio.sampleRate);
}

export function startSherpaTtsWarmup(voice: unknown = defaultKokoroVoiceId) {
  if (warmupPromise && warmupState.status === "warming") {
    return warmupPromise;
  }
  if (warmupState.status === "ready") {
    return Promise.resolve();
  }

  const voiceId = resolveKokoroVoiceId(voice);
  warmupState = { status: "warming", startedAt: new Date().toISOString() };
  warmupPromise = synthesizeWithSherpaKokoro("Ready.", voiceId)
    .then(() => {
      const startedAt = warmupState.startedAt ?? new Date().toISOString();
      warmupState = { status: "ready", startedAt, finishedAt: new Date().toISOString() };
    })
    .catch((error) => {
      const startedAt = warmupState.startedAt ?? new Date().toISOString();
      warmupState = {
        status: "error",
        startedAt,
        finishedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      };
      warmupPromise = null;
      throw error;
    });

  return warmupPromise;
}

export function getSherpaTtsWarmupStatus() {
  return warmupState;
}

async function getOfflineTts() {
  const modelDir = getKokoroModelDir();
  if (cachedTts?.modelDir === modelDir) {
    return cachedTts.tts;
  }

  if (cachedTtsPromise) {
    const pending = await cachedTtsPromise;
    if (pending.modelDir === modelDir) {
      return pending.tts;
    }
  }

  const pendingTts = (async () => {
    validateKokoroModelDir(modelDir);

    const OfflineTtsCtor = await getOfflineTtsConstructor();
    const tts = new OfflineTtsCtor({
      model: {
        kokoro: {
          model: toSherpaModelPath(path.join(modelDir, "model.onnx")),
          voices: toSherpaModelPath(path.join(modelDir, "voices.bin")),
          tokens: toSherpaModelPath(path.join(modelDir, "tokens.txt")),
          dataDir: toSherpaModelPath(path.join(modelDir, "espeak-ng-data")),
          lengthScale: getNumberEnv("CHAPTERCHASE_TTS_LENGTH_SCALE", 1),
        },
      },
      numThreads: Math.max(1, Math.floor(getNumberEnv("CHAPTERCHASE_TTS_THREADS", 2))),
      debug: process.env.CHAPTERCHASE_TTS_DEBUG === "true",
      provider: "cpu",
      maxNumSentences: Math.max(1, Math.floor(getNumberEnv("CHAPTERCHASE_TTS_MAX_SENTENCES", 1))),
      silenceScale: getNumberEnv("CHAPTERCHASE_TTS_SILENCE_SCALE", 0.2),
    });

    cachedTts = { modelDir, tts };
    return cachedTts;
  })();

  cachedTtsPromise = pendingTts;
  try {
    return (await pendingTts).tts;
  } catch (error) {
    if (cachedTtsPromise === pendingTts) {
      cachedTtsPromise = null;
    }
    throw error;
  }
}

async function getOfflineTtsConstructor(): Promise<new (config: unknown) => OfflineTts> {
  if (!cachedOfflineTtsCtorPromise) {
    cachedOfflineTtsCtorPromise = (async () => {
      try {
        // Avoid loading the native addon at Next.js build time; only load when TTS is actually used.
        const mod = (await import("sherpa-onnx-node")) as { OfflineTts?: new (config: unknown) => OfflineTts };
        if (!mod?.OfflineTts) {
          throw new Error("sherpa-onnx-node did not export OfflineTts.");
        }
        return mod.OfflineTts;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const nativeDetails = getSherpaNativeAddonFailureDetails();
        const detailsSuffix = nativeDetails ? `\n\nNative addon details:\n${nativeDetails}` : "";
        throw new SherpaTtsSetupError(
          `Unable to load sherpa-onnx-node. This is usually caused by missing platform optional dependencies inside the container (e.g. sherpa-onnx-linux-x64 or sherpa-onnx-linux-arm64) or missing Linux shared libraries.\n\nError: ${message}${detailsSuffix}`
        );
      }
    })();
  }

  return cachedOfflineTtsCtorPromise;
}

function getSherpaNativeAddonFailureDetails(): string {
  // Try to surface the real `dlopen` failure (missing .so, GLIBC mismatch, etc.).
  // sherpa-onnx-node's loader hides these and throws a generic "Could not find ..." message.
  try {
    const platform = os.platform() === "win32" ? "win" : os.platform();
    const arch = os.arch();
    const platformArch = `${platform}-${arch}`;

    const require = createRequire(import.meta.url);
    const possiblePaths = [
      path.join(process.cwd(), "node_modules", `sherpa-onnx-${platformArch}`, "sherpa-onnx.node"),
      // Next.js standalone output sometimes changes cwd; fall back to this file's directory.
      path.join(path.dirname(require.resolve("sherpa-onnx-node")), "..", `sherpa-onnx-${platformArch}`, "sherpa-onnx.node"),
    ];

    for (const p of possiblePaths) {
      if (!fs.existsSync(p)) continue;
      try {
        // Avoid dynamic native loads here; Turbopack will attempt to trace variable requires.
        // The presence of the file is still useful, and the caller will include the original error message.
        return `Native addon file exists: ${p}\nLD_LIBRARY_PATH=${process.env.LD_LIBRARY_PATH ?? ""}`;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return `Tried: ${p}\nFailure: ${msg}`;
      }
    }

    return `No native addon file found for ${platformArch}. Checked:\n${possiblePaths.join("\n")}`;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return `Failed to compute native addon diagnostics: ${msg}`;
  }
}

function getKokoroModelDir() {
  const explicitDir = process.env.CHAPTERCHASE_TTS_MODEL_DIR?.trim();
  if (explicitDir) {
    return path.isAbsolute(explicitDir) ? explicitDir : path.join(/*turbopackIgnore: true*/ process.cwd(), explicitDir);
  }

  return path.join(dataDir, "tts", "kokoro-en-v0_19");
}

function validateKokoroModelDir(modelDir: string) {
  const missing = requiredModelEntries.filter((entry) => !fs.existsSync(path.join(modelDir, entry)));
  if (missing.length) {
    throw new SherpaTtsSetupError(
      `Kokoro TTS model files are missing from ${modelDir}. Missing: ${missing.join(", ")}.`
    );
  }
}

function normalizeTtsText(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, maxTtsCharacters);
}

function toSherpaModelPath(modelPath: string) {
  const relativePath = path.relative(/*turbopackIgnore: true*/ process.cwd(), modelPath);
  const pathForSherpa = relativePath && !relativePath.startsWith("..") ? relativePath : modelPath;
  return pathForSherpa.replace(/\\/g, "/");
}

function getNumberEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function encodeMonoPcm16Wav(samples: Float32Array, sampleRate: number) {
  const bytesPerSample = 2;
  const channelCount = 1;
  const dataSize = samples.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channelCount, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channelCount * bytesPerSample, 28);
  buffer.writeUInt16LE(channelCount * bytesPerSample, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index] ?? 0));
    const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    buffer.writeInt16LE(Math.round(int16), 44 + index * bytesPerSample);
  }

  return buffer;
}
