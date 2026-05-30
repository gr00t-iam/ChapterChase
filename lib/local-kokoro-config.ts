export type TtsEngine = "auto" | "local" | "server";

export type LocalKokoroInstallState = {
  status: "not-installed" | "ready";
  installedAt?: string;
  modelId?: string;
  voice?: string;
  dtype?: string;
};

export type LocalKokoroProgress = {
  message: string;
  loaded?: number;
  total?: number;
  progress?: number;
};

export const localKokoroStorageKey = "chapterchase:local-kokoro-tts";
export const localKokoroModelId = "onnx-community/Kokoro-82M-v1.0-ONNX";
export const localKokoroVoiceId = "am_adam";
export const localKokoroDtype = "q8";
export const localKokoroDownloadDescription = "about 95 MB";
