import { build } from "esbuild";
import { mkdir, copyFile } from "node:fs/promises";
const output = "ios/ChapterChase/Reader";
await mkdir(output, { recursive: true });
await build({ entryPoints: ["mobile/reader.js"], outfile: `${output}/reader.js`, bundle: true, format: "iife", target: "safari16.4", minify: false });
await copyFile("mobile/index.html", `${output}/index.html`);
await copyFile("mobile/reader.css", `${output}/reader.css`);
for (const [source, name] of [["page-flip/LICENSE", "StPageFlip-LICENSE.txt"], ["jszip/LICENSE.markdown", "JSZip-LICENSE.txt"], ["pdfjs-dist/LICENSE", "PDFjs-LICENSE.txt"]]) {
  await copyFile(`node_modules/${source}`, `${output}/${name}`);
}
console.log("Built offline Apple reader resources.");
