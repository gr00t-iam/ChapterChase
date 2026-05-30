import { requireUser } from "@/lib/auth";
import { getSherpaTtsConfigSummary, SherpaTtsSetupError, synthesizeWithSherpaKokoro } from "@/lib/sherpa-tts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await requireUser();

  const body = (await request.json().catch(() => null)) as { text?: unknown; voice?: unknown; voiceId?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text : "";
  if (!text.trim()) {
    return Response.json({ error: "Text is required." }, { status: 400 });
  }

  try {
    const wav = await synthesizeWithSherpaKokoro(text, body?.voiceId ?? body?.voice ?? user.ttsVoice);
    return new Response(new Uint8Array(wav), {
      headers: {
        "Content-Type": "audio/wav",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const status = error instanceof SherpaTtsSetupError ? 503 : 500;
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Unable to synthesize speech.",
        tts: getSherpaTtsConfigSummary(),
      },
      { status }
    );
  }
}
