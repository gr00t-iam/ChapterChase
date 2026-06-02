import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const traceRoot = path.join(process.cwd(), ".next", "server");
const forbiddenTraceFragments = ["/data/", "/kokoro-en-v0_19.tar/", "/secrets/", "/portainer.env", "/next.config.js"] as const;

const traceFiles = await findTraceManifests(traceRoot);
assert.ok(traceFiles.length > 0, "run `npm run build` before checking Turbopack trace manifests");

const forbiddenEntries: string[] = [];
for (const traceFile of traceFiles) {
  const raw = await fs.readFile(traceFile, "utf8");
  const trace = JSON.parse(raw) as { files?: string[] };
  for (const file of trace.files ?? []) {
    const normalized = file.replace(/\\/g, "/");
    if (forbiddenTraceFragments.some((fragment) => normalized.includes(fragment))) {
      forbiddenEntries.push(`${path.relative(process.cwd(), traceFile)} -> ${normalized}`);
    }
  }
}

assert.equal(
  forbiddenEntries.length,
  0,
  `Turbopack trace manifests should not include runtime data, secrets, or project-root config files:\n${forbiddenEntries.slice(0, 50).join("\n")}`
);

async function findTraceManifests(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = await Promise.all(
    entries.map((entry) => {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return findTraceManifests(entryPath);
      }
      return entry.isFile() && entry.name.endsWith(".nft.json") ? [entryPath] : [];
    })
  );

  return files.flat();
}
