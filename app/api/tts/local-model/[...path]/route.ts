import { kokoroVoices } from "@/lib/kokoro-voices";

export const runtime = "nodejs";

const modelPrefix = ["onnx-community", "Kokoro-82M-v1.0-ONNX", "resolve"] as const;
const allowedRootFiles = new Set(["config.json", "generation_config.json", "special_tokens_map.json", "tokenizer.json", "tokenizer_config.json"]);
const allowedOnnxFiles = new Set(["model.onnx", "model_quantized.onnx", "model_q4.onnx", "model_q4f16.onnx"]);
const allowedVoiceFiles = new Set(kokoroVoices.map((voice) => `${voice.name}.bin`));

export async function GET(request: Request, { params }: RouteContext<"/api/tts/local-model/[...path]">) {
  const { path } = await params;
  const segments = path ?? [];
  if (!isAllowedKokoroModelPath(segments)) {
    return Response.json({ error: "Unsupported speech model asset." }, { status: 404 });
  }

  const headers = new Headers();
  const range = request.headers.get("range");
  if (range) {
    headers.set("range", range);
  }

  const upstream = await fetch(`https://huggingface.co/${segments.map((segment) => encodeURIComponent(segment)).join("/")}`, {
    headers,
    cache: "force-cache",
  });

  const responseHeaders = new Headers();
  for (const header of ["accept-ranges", "content-length", "content-range", "content-type", "etag", "last-modified"]) {
    const value = upstream.headers.get(header);
    if (value) {
      responseHeaders.set(header, value);
    }
  }
  responseHeaders.set("Cache-Control", upstream.ok ? "public, max-age=31536000, immutable" : "no-store");

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

function isAllowedKokoroModelPath(segments: string[]) {
  if (segments.length < 5) {
    return false;
  }

  if (!modelPrefix.every((segment, index) => segments[index] === segment)) {
    return false;
  }

  const revision = segments[3];
  if (!revision || revision.includes("/") || revision.includes("..")) {
    return false;
  }

  const assetPath = segments.slice(4);
  if (assetPath.length === 1) {
    return allowedRootFiles.has(assetPath[0]);
  }

  if (assetPath.length === 2 && assetPath[0] === "onnx") {
    return allowedOnnxFiles.has(assetPath[1]);
  }

  if (assetPath.length === 2 && assetPath[0] === "voices") {
    return allowedVoiceFiles.has(assetPath[1]);
  }

  return false;
}
