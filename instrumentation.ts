export async function register() {
  if (
    process.env.NEXT_PHASE === "phase-production-build" ||
    (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== "nodejs") ||
    process.env.CHAPTERCHASE_TTS_PREWARM === "false"
  ) {
    return;
  }

  const { startSherpaTtsWarmup } = await import("./lib/sherpa-tts");
  void startSherpaTtsWarmup().catch((error) => {
    console.warn("ChapterChase Kokoro TTS prewarm failed:", error instanceof Error ? error.message : error);
  });
}
