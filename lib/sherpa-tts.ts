import fs from "node:fs";
import path from "node:path";
import { defaultKokoroVoiceId, getKokoroVoiceName, resolveKokoroVoiceId } from "@/lib/kokoro-voices";
import { dataDir } from "@/lib/paths";
import type { OfflineTts } from "sherpa-onnx-node";

const maxTtsCharacters = 12000;
const requiredModelEntries = ["model.onnx", "voices.bin", "tokens.txt", "espeak-ng-data"] as const;

let cachedTts: { modelDir: string; tts: OfflineTts } | null = null;
let cachedOfflineTtsCtorPromise: Promise<new (config: unknown) => OfflineTts> | null = null;

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

async function getOfflineTts() {
  const modelDir = getKokoroModelDir();
  if (cachedTts?.modelDir === modelDir) {
    return cachedTts.tts;
  }

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
  return tts;
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
        throw new SherpaTtsSetupError(
          `Unable to load sherpa-onnx-node. This is usually caused by missing platform optional dependencies inside the container (e.g. sherpa-onnx-linux-x64 or sherpa-onnx-linux-arm64). Error: ${message}`
        );
      }
    })();
  }

  return cachedOfflineTtsCtorPromise;
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
