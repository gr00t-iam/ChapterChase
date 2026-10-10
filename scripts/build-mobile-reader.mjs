import { build } from "esbuild";
import { mkdir, copyFile } from "node:fs/promises";
const output = "ios/ChapterChase/Reader";
await mkdir(output, { recursive: true });
await build({ entryPoints: ["mobile/reader.js"], outfile: `${output}/reader.js`, bundle: true, format: "iife", target: "safari16.4", minify: true });
await copyFile("mobile/index.html", `${output}/index.html`);
await copyFile("mobile/reader.css", `${output}/reader.css`);
console.log("Built offline Apple reader resources.");
