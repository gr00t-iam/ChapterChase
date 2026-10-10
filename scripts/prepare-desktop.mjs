import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const output = path.join(root, "desktop", "runtime");
// This is generated build output; discard stale Next chunks before copying a new build.
await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(output, { recursive: true });
await fs.cp(path.join(root, ".next", "standalone"), path.join(output, "app"), {
  recursive: true,
  dereference: true,
  filter: (source) => !/^\.env(?:\.|$)/.test(path.basename(source)),
});
await fs.cp(path.join(root, ".next", "static"), path.join(output, "app", ".next", "static"), { recursive: true });
await fs.cp(path.join(root, "public"), path.join(output, "app", "public"), { recursive: true });
await fs.cp(path.join(root, "scripts", "init-db.mjs"), path.join(output, "app", "init-db.mjs"));
// Bundle normal Node so SQLite/Prisma retain their Node ABI, independently of Electron.
await fs.cp(process.execPath, path.join(output, process.platform === "win32" ? "node.exe" : "node"));
await fs.cp(path.join(root, "node_modules", "better-sqlite3"), path.join(output, "app", "node_modules", "better-sqlite3"), { recursive: true });
for (const name of ["bindings", "file-uri-to-path"]) {
  await fs.cp(path.join(root, "node_modules", name), path.join(output, "app", "node_modules", name), { recursive: true });
}
// Never ship development credentials or the developer's database.
await fs.rm(path.join(output, "app", ".env"), { force: true });
await fs.rm(path.join(output, "app", ".env.local"), { force: true });
console.log("Desktop runtime prepared for this operating system and architecture.");
