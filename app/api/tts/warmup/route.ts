import { requireUser } from "@/lib/auth";
import { resolveKokoroVoiceId } from "@/lib/kokoro-voices";
import { getOpenAiCompatibleTtsConfigSummary, getOpenAiCompatibleTtsWarmupStatus, startOpenAiCompatibleTtsWarmup } from "@/lib/openai-tts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await requireUser();
  const body = (await request.json().catch(() => null)) as { voice?: unknown; voiceId?: unknown } | null;
  const voiceId = resolveKokoroVoiceId(body?.voiceId ?? body?.voice ?? user.ttsVoice);

  void startOpenAiCompatibleTtsWarmup(voiceId).catch(() => undefined);

  return Response.json({
    status: "warming",
    tts: getOpenAiCompatibleTtsConfigSummary(),
    warmup: getOpenAiCompatibleTtsWarmupStatus(),
  });
}
