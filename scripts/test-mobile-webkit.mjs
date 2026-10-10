import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
const { webkit } = await import(process.argv[2] || "playwright");
const browser = await webkit.launch();
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript(() => { delete ReadableStream.prototype[Symbol.asyncIterator]; });
  page.on("console", message => console.log(message.type(), message.text()));
  page.on("pageerror", error => console.log("PAGEERROR", error.stack));
  await page.goto(pathToFileURL(path.resolve("ios/ChapterChase/Reader/index.html")).href);
  const data = (await readFile(path.join(process.argv[3], "Documents/Books/smoke.pdf"))).toString("base64");
  const result = await page.evaluate(async (data) => {
    const messages = [];
    window.webkit = { messageHandlers: { reader: { postMessage: message => messages.push(message) } } };
    await window.ChapterChase.openBook({ format: "pdf", data, pageIndex: 0 });
    await window.ChapterChase.read();
    return { messages, image: document.querySelector(".page-image")?.getAttribute("src")?.slice(0, 30), background: getComputedStyle(document.body).backgroundColor };
  }, data);
  console.log(JSON.stringify(result, null, 2));
  assert.ok(result.image?.startsWith("data:image/jpeg"));
  assert.ok(result.messages.some(message => message.type === "text" && message.text.includes("ChapterChase offline")));
  console.log("PASS native WebKit offline PDF rendering and speech text.");
} finally { await browser.close(); }
