import piperVoiceManifest from "@/config/piper-voices.json";

export const defaultPiperVoiceId = 1;

export const piperVoices = piperVoiceManifest;

export type PiperVoiceId = (typeof piperVoices)[number]["id"];

export function resolvePiperVoiceId(value: unknown): PiperVoiceId {
  if (typeof value === "number") {
    return findVoiceById(value)?.id ?? defaultPiperVoiceId;
  }

  if (typeof value !== "string") {
    return defaultPiperVoiceId;
  }

  const trimmed = value.trim();
  const numeric = Number(trimmed);
  if (Number.isInteger(numeric)) {
    return findVoiceById(numeric)?.id ?? defaultPiperVoiceId;
  }

  const normalizedLabel = trimmed.toLowerCase();
  return piperVoices.find((voice) => voice.name === trimmed || voice.label.toLowerCase() === normalizedLabel)?.id ?? defaultPiperVoiceId;
}

export function getPiperVoiceName(id: number): string {
  return findVoiceById(id)?.name ?? getPiperVoiceName(defaultPiperVoiceId);
}

function findVoiceById(id: number) {
  return piperVoices.find((voice) => voice.id === id);
}
