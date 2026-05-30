export const defaultKokoroVoiceId = 5;

export const kokoroVoices = [
  { id: 0, name: "af", label: "af - Female" },
  { id: 1, name: "af_bella", label: "af_bella - Bella" },
  { id: 2, name: "af_nicole", label: "af_nicole - Nicole" },
  { id: 3, name: "af_sarah", label: "af_sarah - Sarah" },
  { id: 4, name: "af_sky", label: "af_sky - Sky" },
  { id: 5, name: "am_adam", label: "am_adam - Adam" },
  { id: 6, name: "am_michael", label: "am_michael - Michael" },
  { id: 7, name: "bf_emma", label: "bf_emma - Emma" },
  { id: 8, name: "bf_isabella", label: "bf_isabella - Isabella" },
  { id: 9, name: "bm_george", label: "bm_george - George" },
  { id: 10, name: "bm_lewis", label: "bm_lewis - Lewis" },
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

  return kokoroVoices.find((voice) => voice.name === trimmed)?.id ?? defaultKokoroVoiceId;
}

export function getKokoroVoiceName(id: number): string {
  return findVoiceById(id)?.name ?? "am_adam";
}

function findVoiceById(id: number) {
  return kokoroVoices.find((voice) => voice.id === id);
}
