import { requireUser } from "@/lib/auth";
import { getPiperTtsConfigSummary, getPiperTtsWarmupStatus, startPiperTtsWarmup } from "@/lib/piper-tts";
import { resolvePiperVoiceId } from "@/lib/piper-voices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await requireUser();
  const body = (await request.json().catch(() => null)) as { voice?: unknown; voiceId?: unknown } | null;
  const voiceId = resolvePiperVoiceId(body?.voiceId ?? body?.voice ?? user.ttsVoice);

  void startPiperTtsWarmup(voiceId).catch(() => undefined);

  return Response.json({
    status: "warming",
    tts: getPiperTtsConfigSummary(),
    warmup: getPiperTtsWarmupStatus(),
  });
}
