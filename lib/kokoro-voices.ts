export const defaultKokoroVoiceId = 1;

export const kokoroVoices = [
  { id: 0, name: "af_heart", label: "Heart" },
  { id: 1, name: "af_bella", label: "Bella" },
  { id: 2, name: "af_nicole", label: "Nicole" },
  { id: 3, name: "af_sarah", label: "Sarah" },
  { id: 4, name: "af_sky", label: "Sky" },
  { id: 5, name: "am_adam", label: "Adam" },
  { id: 6, name: "am_michael", label: "Michael" },
  { id: 7, name: "bf_emma", label: "Emma" },
  { id: 8, name: "bf_isabella", label: "Isabella" },
  { id: 9, name: "bm_george", label: "George" },
  { id: 10, name: "bm_lewis", label: "Lewis" },
] as const;

export type KokoroVoiceId = (typeof kokoroVoices)[number]["id"];

export function resolveKokoroVoiceId(value: unknown): KokoroVoiceId {
  if (typeof value === "number") {
    return findVoiceById(value)?.id ?? defaultKokoroVoiceId;
  }

  if (typeof value !== "string") {
    return defaultKokoroVoiceId;
  }

  const trimmed = value.trim();
  const numeric = Number(trimmed);
  if (Number.isInteger(numeric)) {
    return findVoiceById(numeric)?.id ?? defaultKokoroVoiceId;
  }

  const normalizedLabel = trimmed.toLowerCase();
  return kokoroVoices.find((voice) => voice.name === trimmed || voice.label.toLowerCase() === normalizedLabel)?.id ?? defaultKokoroVoiceId;
}

export function getKokoroVoiceName(id: number): string {
  return findVoiceById(id)?.name ?? "am_adam";
}

function findVoiceById(id: number) {
  return kokoroVoices.find((voice) => voice.id === id);
}
