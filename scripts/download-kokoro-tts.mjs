import fs from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";

const modelUrl = "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-en-v0_19.tar.bz2";
const modelFolderName = "kokoro-en-v0_19";
const dataDir = process.env.CHAPTERCHASE_DATA_DIR || path.join(process.cwd(), "data");
const targetDir = path.resolve(process.env.CHAPTERCHASE_TTS_MODEL_DIR || path.join(dataDir, "tts", modelFolderName));
const targetParent = path.dirname(targetDir);
const archivePath = path.join(targetParent, `${modelFolderName}.tar.bz2`);
const extractedDir = path.join(targetParent, modelFolderName);
const localArchiveCandidates = [
  path.join(process.cwd(), `${modelFolderName}.tar`),
  path.join(process.cwd(), `${modelFolderName}.tar.bz2`),
  path.join(process.cwd(), `${modelFolderName}.tar`, `${modelFolderName}.tar`),
  path.join(process.cwd(), `${modelFolderName}.tar.bz2`, `${modelFolderName}.tar.bz2`),
];

async function main() {
  if (fs.existsSync(path.join(targetDir, "model.onnx"))) {
    console.log(`Kokoro TTS model already exists at ${targetDir}`);
    return;
  }

  await mkdir(targetParent, { recursive: true });
  const sourceArchive = findLocalArchive() ?? archivePath;
  const downloaded = sourceArchive === archivePath;
  if (downloaded) {
    await downloadModel();
  } else {
    console.log(`Using local Kokoro archive ${sourceArchive}`);
  }
  await extractModel(sourceArchive);

  if (extractedDir !== targetDir && fs.existsSync(extractedDir) && !fs.existsSync(targetDir)) {
    await rename(extractedDir, targetDir);
  }

  if (downloaded) {
    await rm(archivePath, { force: true });
  }
  console.log(`Kokoro TTS model is ready at ${targetDir}`);
}

async function downloadModel() {
  console.log(`Downloading ${modelUrl}`);
  const response = await fetch(modelUrl);
  if (!response.ok || !response.body) {
    throw new Error(`Download failed: HTTP ${response.status}`);
  }

  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(archivePath));
}

function findLocalArchive() {
  return localArchiveCandidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
}

async function extractModel(sourceArchive) {
  console.log(`Extracting ${sourceArchive}`);
  await new Promise((resolve, reject) => {
    const child = spawn("tar", ["-xf", sourceArchive, "-C", targetParent], { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`tar exited with code ${code}`));
      }
    });
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
