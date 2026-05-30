import { requireUser } from "@/lib/auth";
import { resolveKokoroVoiceId } from "@/lib/kokoro-voices";
import { dataDir } from "@/lib/paths";
import { getSherpaTtsConfigSummary, SherpaTtsSetupError, synthesizeWithSherpaKokoro } from "@/lib/sherpa-tts";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

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
    const resolvedVoice = resolveKokoroVoiceId(body?.voiceId ?? body?.voice ?? user.ttsVoice);
    const normalizedText = text.replace(/\s+/g, " ").trim().slice(0, 12000);
    const cacheDir = path.join(dataDir, "tts-cache");
    const cacheKey = crypto
      .createHash("sha256")
      .update(JSON.stringify({ v: 1, voice: resolvedVoice, text: normalizedText }))
      .digest("hex");
    const cachePath = path.join(cacheDir, `kokoro-${cacheKey}.wav`);

    const cached = await fs.readFile(cachePath).catch(() => null);
    const wav = cached ?? (await synthesizeWithSherpaKokoro(normalizedText, resolvedVoice));
    if (!cached) {
      await fs.mkdir(cacheDir, { recursive: true }).catch(() => undefined);
      await fs.writeFile(cachePath, new Uint8Array(wav)).catch(() => undefined);
    }
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
