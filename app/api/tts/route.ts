import { requireUser } from "@/lib/auth";
import { resolveKokoroVoiceId } from "@/lib/kokoro-voices";
import {
  getOpenAiCompatibleTtsCacheConfig,
  getOpenAiCompatibleTtsConfigSummary,
  OpenAiCompatibleTtsError,
  synthesizeWithOpenAiCompatibleKokoro,
} from "@/lib/openai-tts";
import { dataDir } from "@/lib/paths";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const pendingSyntheses = new Map<string, Promise<Buffer>>();

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
    const cacheDir = path.join(/* turbopackIgnore: true */ dataDir, "tts-cache");
    const cacheKey = crypto
      .createHash("sha256")
      .update(JSON.stringify({ v: 2, backend: getOpenAiCompatibleTtsCacheConfig(), voice: resolvedVoice, text: normalizedText }))
      .digest("hex");
    const cachePath = path.join(/* turbopackIgnore: true */ cacheDir, `kokoro-${cacheKey}.wav`);

    const cached = await fs.readFile(/* turbopackIgnore: true */ cachePath).catch(() => null);
    const wav = cached ?? (await getOrCreateCachedSpeech(cacheKey, cachePath, normalizedText, resolvedVoice));
    return new Response(new Uint8Array(wav), {
      headers: {
        "Content-Type": "audio/wav",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const status = error instanceof OpenAiCompatibleTtsError ? error.status : 500;
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Unable to synthesize speech.",
        tts: getOpenAiCompatibleTtsConfigSummary(),
      },
      { status }
    );
  }
}

function getOrCreateCachedSpeech(cacheKey: string, cachePath: string, text: string, voiceId: unknown) {
  const pending = pendingSyntheses.get(cacheKey);
  if (pending) {
    return pending;
  }

  const synthesis = synthesizeWithOpenAiCompatibleKokoro(text, voiceId)
    .then(async (wav) => {
      await fs.mkdir(/* turbopackIgnore: true */ path.dirname(cachePath), { recursive: true }).catch(() => undefined);
      await fs.writeFile(/* turbopackIgnore: true */ cachePath, new Uint8Array(wav)).catch(() => undefined);
      return wav;
    })
    .finally(() => pendingSyntheses.delete(cacheKey));

  pendingSyntheses.set(cacheKey, synthesis);
  return synthesis;
}
