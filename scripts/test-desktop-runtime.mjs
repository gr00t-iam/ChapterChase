import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const runtime = path.resolve(process.argv[2] || "desktop/runtime");
const cwd = path.join(runtime, "app");
const node = path.join(runtime, process.platform === "win32" ? "node.exe" : "node");
const data = await fs.mkdtemp(path.join(os.tmpdir(), "chapterchase-smoke-"));
const env = { ...process.env, CHAPTERCHASE_DATA_DIR: data,
  DATABASE_URL: `file:${path.join(data, "chapterchase.db").replaceAll("\\", "/")}`,
  HOSTNAME: "127.0.0.1", PORT: "43127", CHAPTERCHASE_SECURE_COOKIES: "false" };
await new Promise((resolve, reject) => {
  const init = spawn(node, ["init-db.mjs"], { cwd, env, stdio: "inherit" });
  init.on("error", reject);
  init.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`Init failed: ${code}`)));
});
const server = spawn(node, ["server.js"], { cwd, env, stdio: "inherit" });
try {
  let response;
  for (let attempt = 0; attempt < 40; attempt++) {
    try { response = await fetch("http://127.0.0.1:43127/setup"); if (response.ok) break; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.equal(response?.status, 200);
  assert.match(await response.text(), /Create the first admin/);
  console.log("PASS: bundled runtime boots independently with a fresh local database.");
} finally {
  server.kill();
}
