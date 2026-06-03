import { defaultPiperVoiceId, getPiperVoiceName, resolvePiperVoiceId } from "@/lib/piper-voices";

const maxTtsCharacters = 12000;
const defaultTtsProvider = "piper";
const defaultPiperApiUrl = "http://localhost:10200/api/tts";

let warmupState:
  | { status: "idle"; startedAt?: undefined; finishedAt?: undefined; error?: undefined }
  | { status: "warming"; startedAt: string; finishedAt?: undefined; error?: undefined }
  | { status: "ready"; startedAt: string; finishedAt: string; error?: undefined }
  | { status: "error"; startedAt: string; finishedAt: string; error: string } = { status: "idle" };
let warmupPromise: Promise<void> | null = null;

export class PiperTtsError extends Error {
  status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "PiperTtsError";
    this.status = status;
  }
}

export function getPiperTtsConfigSummary() {
  return {
    provider: getTtsProvider(),
    apiUrl: getPiperApiUrl(),
    voiceName: getPiperVoiceName(defaultPiperVoiceId),
  };
}

export async function synthesizeWithPiper(text: string, voice: unknown = defaultPiperVoiceId) {
  const normalizedText = normalizeTtsText(text);
  if (!normalizedText) {
    throw new Error("Text is required.");
  }

  const voiceId = resolvePiperVoiceId(voice);
  const voiceName = getPiperVoiceName(voiceId);
  let response = await postPiperJson(normalizedText, voiceName);
  if (isUnsupportedPiperRequestShape(response)) {
    response = await postPiperQuery(normalizedText, voiceName);
  }

  if (!response.ok) {
    const details = await getErrorDetails(response);
    throw new PiperTtsError(
      details ? `Piper TTS server returned ${response.status}: ${details}` : `Piper TTS server returned ${response.status}.`,
      response.status >= 500 ? 502 : response.status
    );
  }

  const wav = Buffer.from(await response.arrayBuffer());
  if (!wav.length) {
    throw new PiperTtsError("Piper TTS server returned an empty audio response.");
  }

  return wav;
}

export function startPiperTtsWarmup(voice: unknown = defaultPiperVoiceId) {
  if (warmupPromise && warmupState.status === "warming") {
    return warmupPromise;
  }
  if (warmupState.status === "ready") {
    return Promise.resolve();
  }

  const voiceId = resolvePiperVoiceId(voice);
  warmupState = { status: "warming", startedAt: new Date().toISOString() };
  warmupPromise = synthesizeWithPiper("Ready.", voiceId)
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

export function getPiperTtsWarmupStatus() {
  return warmupState;
}

export function getPiperTtsCacheConfig() {
  return {
    provider: getTtsProvider(),
    apiUrl: getPiperApiUrl(),
  };
}

function getTtsProvider() {
  return process.env.TTS_PROVIDER?.trim() || defaultTtsProvider;
}

function getPiperApiUrl() {
  return process.env.PIPER_API_URL?.trim() || defaultPiperApiUrl;
}

function postPiperJson(text: string, voiceName: string) {
  return postPiper(getPiperApiUrl(), {
    "Content-Type": "application/json",
    body: JSON.stringify({ text, voice: voiceName }),
  });
}

function postPiperQuery(text: string, voiceName: string) {
  const url = new URL(getPiperApiUrl());
  url.searchParams.set("text", text);
  url.searchParams.set("voice", voiceName);
  return postPiper(url.toString());
}

function postPiper(url: string, options: { "Content-Type"?: string; body?: string } = {}) {
  return fetch(url, {
    method: "POST",
    headers: {
      Accept: "audio/wav, audio/*",
      ...(options["Content-Type"] ? { "Content-Type": options["Content-Type"] } : {}),
    },
    body: options.body,
  }).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    throw new PiperTtsError(`Unable to reach Piper TTS server at ${getPiperApiUrl()}. ${message}`, 503);
  });
}

function isUnsupportedPiperRequestShape(response: Response) {
  return response.status === 400 || response.status === 404 || response.status === 405 || response.status === 415 || response.status === 422;
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
