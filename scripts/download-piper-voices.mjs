import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const voicesBaseUrl = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.resolve(__dirname, "..", "config", "piper-voices.json");
const targetDir = path.resolve(process.argv[2] || path.join(process.cwd(), "piper-voices"));
const voices = JSON.parse(await fs.readFile(manifestPath, "utf8"));

await fs.mkdir(targetDir, { recursive: true });

for (const voice of voices) {
  await downloadVoiceFile(voice, "onnx");
  await downloadVoiceFile(voice, "onnx.json");
}

console.log(`Piper voices are ready at ${targetDir}`);

async function downloadVoiceFile(voice, extension) {
  const fileName = `${voice.name}.${extension}`;
  const outputPath = path.join(targetDir, fileName);
  const existing = await fs.stat(outputPath).catch(() => null);
  if (existing?.size > 0) {
    console.log(`Using cached ${fileName}`);
    return;
  }

  const url = `${voicesBaseUrl}/${voice.path}.${extension}?download=true`;
  console.log(`Downloading ${fileName}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Unable to download ${fileName}: ${response.status} ${response.statusText}`);
  }

  const tempPath = `${outputPath}.tmp`;
  await fs.writeFile(tempPath, new Uint8Array(await response.arrayBuffer()));
  await fs.rename(tempPath, outputPath);
}
