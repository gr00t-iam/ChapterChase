import { defaultKokoroVoiceId, getKokoroVoiceName, resolveKokoroVoiceId } from "@/lib/kokoro-voices";

const maxTtsCharacters = 12000;
const defaultTtsBaseUrl = "http://localhost:8000/v1";
const defaultTtsModel = "kokoro";
const defaultTtsResponseFormat = "wav";

let warmupState:
  | { status: "idle"; startedAt?: undefined; finishedAt?: undefined; error?: undefined }
  | { status: "warming"; startedAt: string; finishedAt?: undefined; error?: undefined }
  | { status: "ready"; startedAt: string; finishedAt: string; error?: undefined }
  | { status: "error"; startedAt: string; finishedAt: string; error: string } = { status: "idle" };
let warmupPromise: Promise<void> | null = null;

export class OpenAiCompatibleTtsError extends Error {
  status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "OpenAiCompatibleTtsError";
    this.status = status;
  }
}

export function getOpenAiCompatibleTtsConfigSummary() {
  return {
    baseUrl: getTtsBaseUrl(),
    model: getTtsModel(),
    responseFormat: getTtsResponseFormat(),
    voiceName: getKokoroVoiceName(defaultKokoroVoiceId),
  };
}

export async function synthesizeWithOpenAiCompatibleKokoro(text: string, voice: unknown = defaultKokoroVoiceId) {
  const normalizedText = normalizeTtsText(text);
  if (!normalizedText) {
    throw new Error("Text is required.");
  }

  const voiceId = resolveKokoroVoiceId(voice);
  const voiceName = getKokoroVoiceName(voiceId);
  const response = await fetch(getTtsSpeechUrl(), {
    method: "POST",
    headers: getTtsRequestHeaders(),
    body: JSON.stringify({
      model: getTtsModel(),
      input: normalizedText,
      voice: voiceName,
      response_format: getTtsResponseFormat(),
    }),
  }).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    throw new OpenAiCompatibleTtsError(`Unable to reach Kokoro TTS server at ${getTtsBaseUrl()}. ${message}`, 503);
  });

  if (!response.ok) {
    const details = await getErrorDetails(response);
    throw new OpenAiCompatibleTtsError(
      details ? `Kokoro TTS server returned ${response.status}: ${details}` : `Kokoro TTS server returned ${response.status}.`,
      response.status >= 500 ? 502 : response.status
    );
  }

  return Buffer.from(await response.arrayBuffer());
}

export function startOpenAiCompatibleTtsWarmup(voice: unknown = defaultKokoroVoiceId) {
  if (warmupPromise && warmupState.status === "warming") {
    return warmupPromise;
  }
  if (warmupState.status === "ready") {
    return Promise.resolve();
  }

  const voiceId = resolveKokoroVoiceId(voice);
  warmupState = { status: "warming", startedAt: new Date().toISOString() };
  warmupPromise = synthesizeWithOpenAiCompatibleKokoro("Ready.", voiceId)
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

export function getOpenAiCompatibleTtsWarmupStatus() {
  return warmupState;
}

export function getOpenAiCompatibleTtsCacheConfig() {
  return {
    baseUrl: getTtsBaseUrl(),
    model: getTtsModel(),
    responseFormat: getTtsResponseFormat(),
  };
}

function getTtsBaseUrl() {
  return (process.env.CHAPTERCHASE_TTS_BASE_URL?.trim() || defaultTtsBaseUrl).replace(/\/+$/, "");
}

function getTtsModel() {
  return process.env.CHAPTERCHASE_TTS_MODEL?.trim() || defaultTtsModel;
}

function getTtsResponseFormat() {
  return process.env.CHAPTERCHASE_TTS_RESPONSE_FORMAT?.trim() || defaultTtsResponseFormat;
}

function getTtsSpeechUrl() {
  return `${getTtsBaseUrl()}/audio/speech`;
}

function getTtsRequestHeaders() {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const apiKey = process.env.CHAPTERCHASE_TTS_API_KEY?.trim();
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

async function getErrorDetails(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const payload = (await response.json().catch(() => null)) as { error?: unknown; detail?: unknown } | null;
    if (typeof payload?.error === "string") return payload.error;
    if (typeof payload?.detail === "string") return payload.detail;
    if (payload?.error || payload?.detail) return JSON.stringify(payload.error ?? payload.detail);
    return null;
  }

  const text = await response.text().catch(() => "");
  return text.trim().slice(0, 500) || null;
}

function normalizeTtsText(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, maxTtsCharacters);
}
