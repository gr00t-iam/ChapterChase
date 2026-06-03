export const defaultPiperVoiceId = 1;

export const piperVoices = [
  { id: 0, name: "en_US-lessac-medium", label: "Lessac" },
  { id: 1, name: "en_US-amy-medium", label: "Amy" },
  { id: 2, name: "en_US-ryan-medium", label: "Ryan" },
  { id: 3, name: "en_US-libritts-high", label: "LibriTTS" },
  { id: 4, name: "en_GB-alan-medium", label: "Alan" },
  { id: 5, name: "en_GB-alba-medium", label: "Alba" },
] as const;

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
