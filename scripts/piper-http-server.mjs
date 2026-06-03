import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.resolve(__dirname, "..", "config", "piper-voices.json");
const voices = JSON.parse(await fs.readFile(manifestPath, "utf8"));
const host = process.env.PIPER_HOST || "127.0.0.1";
const port = Number(process.env.PIPER_PORT || 10200);
const voicesDir = process.env.PIPER_VOICES_DIR || path.join(process.env.CHAPTERCHASE_DATA_DIR || "/data", "tts", "piper");
const piperBin = process.env.PIPER_BIN || "piper";

const server = http.createServer(async (request, response) => {
  try {
    if (request.method === "GET" && request.url === "/health") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true, voices: voices.length }));
      return;
    }

    const url = new URL(request.url || "/", `http://${request.headers.host || `${host}:${port}`}`);
    if (request.method !== "POST" || url.pathname !== "/api/tts") {
      response.writeHead(404, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "Not found." }));
      return;
    }

    const body = await readRequestBody(request);
    const payload = parsePayload(body, request.headers["content-type"]);
    const text = String(payload.text || url.searchParams.get("text") || "").replace(/\s+/g, " ").trim();
    if (!text) {
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "Text is required." }));
      return;
    }

    const voice = resolveVoice(payload.voice || payload.voiceId || url.searchParams.get("voice") || url.searchParams.get("voiceId"));
    const wav = await synthesize(text, voice);
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Length": String(wav.length),
      "Content-Type": "audio/wav",
    });
    response.end(wav);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    response.writeHead(500, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: message }));
  }
});

server.listen(port, host, () => {
  console.log(`ChapterChase Piper HTTP server listening at http://${host}:${port}/api/tts`);
});

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

function shutdown() {
  server.close(() => process.exit(0));
}

async function synthesize(text, voice) {
  const modelPath = path.join(voicesDir, `${voice.name}.onnx`);
  await fs.access(modelPath);
  const outputPath = path.join(os.tmpdir(), `chapterchase-piper-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`);
  const child = spawn(piperBin, ["--model", modelPath, "--output_file", outputPath], {
    stdio: ["pipe", "ignore", "pipe"],
  });

  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  child.stdin.end(text);

  const exitCode = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });

  if (exitCode !== 0) {
    throw new Error(`Piper exited with code ${exitCode}: ${stderr.trim()}`);
  }

  try {
    const wav = await fs.readFile(outputPath);
    if (!wav.length) {
      throw new Error("Piper returned an empty WAV file.");
    }
    return wav;
  } finally {
    await fs.unlink(outputPath).catch(() => undefined);
  }
}

function resolveVoice(value) {
  if (typeof value === "number") {
    return voices.find((voice) => voice.id === value) || voices[1] || voices[0];
  }

  const text = typeof value === "string" ? value.trim() : "";
  const numeric = Number(text);
  if (Number.isInteger(numeric)) {
    return resolveVoice(numeric);
  }

  const normalized = text.toLowerCase();
  return voices.find((voice) => voice.name === text || voice.label.toLowerCase() === normalized) || voices[1] || voices[0];
}

function parsePayload(body, contentType = "") {
  if (!body.trim()) {
    return {};
  }

  if (String(contentType).includes("application/json")) {
    return JSON.parse(body);
  }

  return { text: body };
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 20000) {
        request.destroy(new Error("TTS request body is too large."));
      }
    });
    request.on("error", reject);
    request.on("end", () => resolve(body));
  });
}
