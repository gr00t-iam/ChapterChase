import { build } from "esbuild";
import { mkdir, readFile, writeFile, copyFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Menu, BookOpen, Library, Settings, Search, Plus, X, ChevronLeft, ChevronRight, Play, Square, ChevronDown, ChevronUp, ExternalLink, Trash2, Download } from "lucide-react";
import sharp from "pwa-sharp";

const output = path.resolve("pwa/dist");
if (path.dirname(output) !== path.resolve("pwa") || path.basename(output) !== "dist") throw new Error("Unsafe generated-output path");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const components = { Menu, BookOpen, Library, Settings, Search, Plus, X, ChevronLeft, ChevronRight, Play, Square, ChevronDown, ChevronUp, ExternalLink, Trash2, Download };
const icons = Object.fromEntries(Object.entries(components).map(([name, component]) => [name, renderToStaticMarkup(React.createElement(component, { "aria-hidden": true }))]));
const browserOptions = { bundle: true, format: "iife", target: "safari16.4", minify: true, alias: { "pdfjs-dist": "pwa-pdfjs" }, metafile: true };
const bundles = [
  await build({ ...browserOptions, entryPoints: ["pwa/app.js"], outfile: `${output}/app.js`, define: { __ICONS__: JSON.stringify(icons) } }),
  await build({ ...browserOptions, entryPoints: ["pwa/reader-entry.js"], outfile: `${output}/reader.js` }),
];
for (const bundle of bundles) {
  if (Object.keys(bundle.metafile.inputs).some(file => file.startsWith("node_modules/pdfjs-dist/"))) throw new Error("PWA must not bundle the older native PDF dependency");
}
const html = (await readFile("pwa/index.html", "utf8")).replace(/<i data-icon="([^"]+)"><\/i>/g, (_, name) => icons[name]);
await writeFile(`${output}/index.html`, html);
await copyFile("pwa/reader.html", `${output}/reader.html`);
await copyFile("pwa/app.css", `${output}/app.css`);
await writeFile(`${output}/reader.css`, (await readFile("mobile/reader.css", "utf8")) + "\n" + (await readFile("pwa/reader-theme.css", "utf8")));
for (const file of ["background-wood.jpg", "shelf-wood.jpg"]) await copyFile(`public/${file}`, `${output}/${file}`);
const icon = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" rx="90" fill="#173c2e"/><text x="256" y="323" text-anchor="middle" font-family="Georgia,serif" font-size="225" fill="#f5f3e8">CC</text></svg>');
for (const size of [192, 512]) await sharp(icon).resize(size, size).png().toFile(`${output}/icon-${size}.png`);
await writeFile(`${output}/manifest.webmanifest`, JSON.stringify({ id: "./", name: "ChapterChase Offline", short_name: "ChapterChase", start_url: "./", scope: "./", display: "standalone", background_color: "#171919", theme_color: "#171919", icons: [192, 512].map(size => ({ src: `icon-${size}.png`, sizes: `${size}x${size}`, type: "image/png", purpose: "any" })) }, null, 2));
for (const [source, name] of [["page-flip/LICENSE", "StPageFlip-LICENSE.txt"], ["jszip/LICENSE.markdown", "JSZip-LICENSE.txt"], ["pwa-pdfjs/LICENSE", "PDFjs-LICENSE.txt"], ["dexie/LICENSE", "Dexie-LICENSE.txt"]]) await copyFile(`node_modules/${source}`, `${output}/${name}`);
const files = (await readdir(output)).filter(file => file !== "sw.js" && file !== ".nojekyll").sort();
const hash = createHash("sha256");
for (const file of files) hash.update(file).update(await readFile(`${output}/${file}`));
const version = hash.digest("hex").slice(0, 16);
await build({ entryPoints: ["pwa/sw.js"], outfile: `${output}/sw.js`, bundle: true, target: "safari16.4", minify: true, define: { __VERSION__: JSON.stringify(version), __ASSETS__: JSON.stringify(files) } });
await writeFile(`${output}/.nojekyll`, "");
console.log(`Built standalone PWA ${version}: ${output}`);
