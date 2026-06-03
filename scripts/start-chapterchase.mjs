import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(__dirname, "..");
const dataDir = process.env.CHAPTERCHASE_DATA_DIR || "/data";
const bundledVoicesDir = process.env.PIPER_BUNDLED_VOICES_DIR || path.join(appDir, "piper-voices");
const voicesDir = process.env.PIPER_VOICES_DIR || path.join(dataDir, "tts", "piper");
const piperHost = process.env.PIPER_HOST || "127.0.0.1";
const piperPort = Number(process.env.PIPER_PORT || 10200);
const piperHealthUrl = `http://${piperHost}:${piperPort}/health`;
const children = new Set();

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

await ensureBundledPiperVoices();
spawnChild("Piper TTS", process.execPath, [path.join(appDir, "scripts", "piper-http-server.mjs")]);
await waitForPiper();
await runCommand("Database init", process.execPath, [path.join(appDir, "scripts", "init-db.mjs")]);
const nextServer = spawnChild("ChapterChase", process.execPath, [path.join(appDir, "server.js")]);

const exitCode = await new Promise((resolve) => {
  nextServer.on("close", resolve);
});
shutdown(exitCode ?? 0);

async function ensureBundledPiperVoices() {
  await fs.mkdir(voicesDir, { recursive: true });
  const files = await fs.readdir(bundledVoicesDir);
  for (const file of files.filter((name) => name.endsWith(".onnx") || name.endsWith(".onnx.json"))) {
    const source = path.join(bundledVoicesDir, file);
    const target = path.join(voicesDir, file);
    const targetStat = await fs.stat(target).catch(() => null);
    if (targetStat?.size > 0) {
      continue;
    }
    await fs.copyFile(source, target);
  }
}

async function waitForPiper() {
  const deadline = Date.now() + Number(process.env.PIPER_STARTUP_TIMEOUT_MS || 30000);
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(piperHealthUrl);
      if (response.ok) {
        console.log(`Piper TTS is ready at ${piperHealthUrl}`);
        return;
      }
      lastError = `${response.status} ${response.statusText}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Piper TTS did not start at ${piperHealthUrl}: ${lastError}`);
}

function runCommand(label, command, args) {
  const child = spawnChild(label, command, args);
  return new Promise((resolve, reject) => {
    child.on("close", (code) => {
      children.delete(child);
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${label} exited with code ${code}`));
    });
  });
}

function spawnChild(label, command, args) {
  const child = spawn(command, args, {
    cwd: appDir,
    env: {
      ...process.env,
      PIPER_HOST: piperHost,
      PIPER_PORT: String(piperPort),
      PIPER_VOICES_DIR: voicesDir,
    },
    stdio: "inherit",
  });
  children.add(child);
  child.on("error", (error) => {
    console.error(`${label} failed to start:`, error);
    shutdown(1);
  });
  return child;
}

function shutdown(code = 0) {
  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
  process.exit(typeof code === "number" ? code : 0);
}
