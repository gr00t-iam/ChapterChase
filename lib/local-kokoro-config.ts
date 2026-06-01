export type TtsEngine = "auto" | "local" | "server";
export type LocalKokoroModelProfileId = "balanced" | "full";

export type LocalKokoroModelProfile = {
  id: LocalKokoroModelProfileId;
  label: string;
  dtype: "q8" | "fp32";
  modelFile: "model_quantized.onnx" | "model.onnx";
  downloadDescription: string;
};

export type LocalKokoroInstallState = {
  status: "not-installed" | "ready";
  installedAt?: string;
  modelId?: string;
  profileId?: LocalKokoroModelProfileId;
  voice?: string;
  dtype?: string;
  modelFile?: string;
  cacheVersion?: string;
};

export type LocalKokoroProgress = {
  message: string;
  loaded?: number;
  total?: number;
  progress?: number;
};

export const localKokoroStorageKey = "chapterchase:local-kokoro-tts";
export const localKokoroProfileStorageKey = "chapterchase:local-kokoro-profile";
export const localKokoroCacheVersion = "browser-cache-v1";
export const localKokoroModelId = "onnx-community/Kokoro-82M-v1.0-ONNX";
export const localKokoroVoiceId = "af_bella";
export const localKokoroDefaultProfileId: LocalKokoroModelProfileId = "balanced";
export const localKokoroModelProfiles: Record<LocalKokoroModelProfileId, LocalKokoroModelProfile> = {
  balanced: {
    id: "balanced",
    label: "Balanced",
    dtype: "q8",
    modelFile: "model_quantized.onnx",
    downloadDescription: "about 95 MB",
  },
  full: {
    id: "full",
    label: "Full quality",
    dtype: "fp32",
    modelFile: "model.onnx",
    downloadDescription: "about 326 MB",
  },
};
export const localKokoroDtype = localKokoroModelProfiles[localKokoroDefaultProfileId].dtype;
export const localKokoroDownloadDescription = localKokoroModelProfiles[localKokoroDefaultProfileId].downloadDescription;

export function resolveLocalKokoroProfileId(value: unknown): LocalKokoroModelProfileId {
  return value === "full" || value === "balanced" ? value : localKokoroDefaultProfileId;
}

export function getLocalKokoroModelProfile(value: unknown): LocalKokoroModelProfile {
  return localKokoroModelProfiles[resolveLocalKokoroProfileId(value)];
}
