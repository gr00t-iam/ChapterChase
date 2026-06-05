import { getKokoroVoiceName, resolveKokoroVoiceId } from "@/lib/kokoro-voices";
import { getPiperVoiceName, resolvePiperVoiceId } from "@/lib/piper-voices";

export type TtsEngine = "auto" | "local" | "server";
export type LocalKokoroModelProfileId = "balanced" | "full";
export type LocalKokoroVoiceQuality = "low" | "high";

export type LocalKokoroModelProfile = {
  id: LocalKokoroModelProfileId;
  label: string;
  quality: LocalKokoroVoiceQuality;
  femaleVoiceId: string;
  maleVoiceId: string;
  downloadDescription: string;
};

export type LocalKokoroInstallState = {
  status: "not-installed" | "ready";
  installedAt?: string;
  modelId?: string;
  profileId?: LocalKokoroModelProfileId;
  voiceId?: string;
  quality?: LocalKokoroVoiceQuality;
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
export const localKokoroCacheVersion = "opfs-v2";
export const localKokoroModelId = "mintplex-piper-web";
export const localKokoroVoiceId = "en_US-lessac-low";
export const localKokoroDefaultProfileId: LocalKokoroModelProfileId = "balanced";
export const localKokoroModelProfiles: Record<LocalKokoroModelProfileId, LocalKokoroModelProfile> = {
  balanced: {
    id: "balanced",
    label: "Balanced",
    quality: "low",
    femaleVoiceId: "en_US-lessac-low",
    maleVoiceId: "en_US-ryan-low",
    downloadDescription: "smaller download",
  },
  full: {
    id: "full",
    label: "Full quality",
    quality: "high",
    femaleVoiceId: "en_US-lessac-high",
    maleVoiceId: "en_US-ryan-high",
    downloadDescription: "higher-quality voice",
  },
};
export const localKokoroDtype = localKokoroModelProfiles[localKokoroDefaultProfileId].quality;
export const localKokoroDownloadDescription = localKokoroModelProfiles[localKokoroDefaultProfileId].downloadDescription;

const maleSourceVoices = new Set(["am_adam", "am_michael", "bm_george", "bm_lewis", "en_US-ryan-medium", "en_GB-alan-medium"]);

export function resolveLocalKokoroProfileId(value: unknown): LocalKokoroModelProfileId {
  return value === "full" || value === "balanced" ? value : localKokoroDefaultProfileId;
}

export function getLocalKokoroModelProfile(value: unknown): LocalKokoroModelProfile {
  return localKokoroModelProfiles[resolveLocalKokoroProfileId(value)];
}

export function resolveLocalKokoroVoiceId(
  value: unknown,
  profileId: LocalKokoroModelProfileId = localKokoroDefaultProfileId
): string {
  const profile = getLocalKokoroModelProfile(profileId);
  const sourceVoiceName = resolveSourceVoiceName(value);
  return maleSourceVoices.has(sourceVoiceName) ? profile.maleVoiceId : profile.femaleVoiceId;
}

function resolveSourceVoiceName(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return getPiperVoiceName(resolvePiperVoiceId(value));
    }
    if (trimmed.startsWith("en_")) {
      return trimmed;
    }
    if (trimmed.includes("_")) {
      return trimmed;
    }
  }

  const piperVoiceName = getPiperVoiceName(resolvePiperVoiceId(value));
  if (piperVoiceName) {
    return piperVoiceName;
  }

  return getKokoroVoiceName(resolveKokoroVoiceId(value));
}
