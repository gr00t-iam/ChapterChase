import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdtemp, rm, mkdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import JSZip from "jszip";
import { chromium, webkit } from "playwright";

const root = path.resolve("pwa/dist");
let shell;
try { shell = await readFile(path.join(root, "index.html"), "utf8"); } catch { shell = ""; }
assert.ok(shell.includes("ChapterChase Offline"), "Standalone PWA shell has not been built");

const zip = new JSZip();
zip.file("META-INF/container.xml", '<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>');
zip.file("OPS/book.opf", '<package xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>A Traveling Library</dc:title><dc:creator>Offline Author</dc:creator></metadata><manifest><item id="chapter" href="chapter.xhtml"/></manifest><spine><itemref idref="chapter"/></spine></package>');
zip.file("OPS/chapter.xhtml", `<html><body><p>${"A library travels with its reader. ".repeat(900)}</p></body></html>`);
const epub = await zip.generateAsync({ type: "nodebuffer" });
function pdfFixture() {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R 6 0 R 8 0 R] /Count 3 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const stream = 'BT /F1 24 Tf 60 700 Td (Offline PDF reading works.) Tj ET';
  objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  for (const content of [7, 9]) {
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 4 0 R >> >> /Contents ${content} 0 R >>`);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }
  objects.push('<< /Title (Offline PDF) /Author (PDF Author) >>');
  let file = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(file.length); file += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = file.length;
  file += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => String(offset).padStart(10, '0') + ' 00000 n ').join('\n')}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 10 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(file);
}
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".webmanifest": "application/manifest+json", ".png": "image/png", ".jpg": "image/jpeg" };
let updatedWorker = false;
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, "http://localhost").pathname;
    if (!pathname.startsWith("/ChapterChase/")) { res.writeHead(404).end(); return; }
    const relative = pathname.slice("/ChapterChase/".length) || "index.html";
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    res.setHeader("Content-Type", mime[path.extname(file)] ?? "application/octet-stream");
    res.setHeader("Cache-Control", "no-store");
    const data = await readFile(file);
    res.end(updatedWorker && relative === "sw.js" ? data.toString().replace(/[a-f0-9]{16}/, "abcdef1234567890") : data);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}/ChapterChase/`;
const screenshots = process.env.PWA_SCREENSHOTS || path.join(os.tmpdir(), "chapterchase-pwa-screenshots");
await mkdir(screenshots, { recursive: true });
try {
  for (const engine of (process.env.PWA_BROWSER === "chromium" ? [chromium] : [chromium, webkit])) {
    updatedWorker = false;
    const profile = await mkdtemp(path.join(os.tmpdir(), "chapterchase-pwa-test-"));
    const name = engine.name();
    let context;
    try {
      context = await engine.launchPersistentContext(profile, { headless: true, viewport: { width: 1180, height: 820 }, serviceWorkers: "allow" });
      const page = await context.newPage();
      const errors = [];
      const notices = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", message => { if (message.text().startsWith("NOTICE")) notices.push(message.text()); if (["error", "warning"].includes(message.type())) console.log(name, message.type(), message.text()); });
      const apiCalls = [];
      page.on("request", req => { if (req.url().includes("/api/")) apiCalls.push(req.url()); });
      await page.goto(url);
      await page.locator("#notice").evaluate(el => { new MutationObserver(() => console.log("NOTICE", el.textContent)).observe(el, { childList: true }); });
      await page.getByText("Ready offline", { exact: true }).waitFor();
      assert.equal(await page.title(), "ChapterChase Offline");
      await page.locator("#import-files").setInputFiles([
        { name: "raw_filename.epub", mimeType: "application/epub+zip", buffer: epub },
        { name: "raw_file.pdf", mimeType: "application/pdf", buffer: pdfFixture() },
      ]);
      await page.getByRole("button", { name: "Read A Traveling Library", exact: true }).waitFor();
      try { await page.getByRole("button", { name: "Read Offline PDF", exact: true }).waitFor({ timeout: 10000 }); }
      catch (error) { console.log(await page.locator("body").innerText(), errors, notices); throw error; }
      await page.screenshot({ path: path.join(screenshots, `${name}-library.png`) });
      await page.getByRole("button", { name: "Read A Traveling Library", exact: true }).click();
      const reader = page.frameLocator("#reader-frame");
      await reader.locator("#status[hidden]").waitFor({ state: "attached" });
      assert.ok(await reader.locator(".page-text").count() > 4);
      await page.getByRole("button", { name: "Next page", exact: true }).click();
      await page.waitForTimeout(1200);
      assert.match(await page.locator("#page-position").innerText(), /^2\s*\//);
      await page.getByRole("button", { name: "Text settings", exact: true }).click();
      await page.locator("#font-size").evaluate(el => { el.value = "24"; });
      await page.locator("#font-size").dispatchEvent("input");
      await page.waitForTimeout(400);
      assert.equal(await reader.locator(".page-text").first().evaluate(el => getComputedStyle(el).fontSize), "24px");
      await page.getByRole("button", { name: "Close reader", exact: true }).click();
      await page.getByRole("button", { name: "Read Offline PDF", exact: true }).click();
      try { await reader.locator(".page-image[src^='data:image/jpeg']:visible").first().waitFor({ timeout: 10000 }); }
      catch (error) { console.log("PDF FAILURE", notices, errors, await reader.locator("body").innerText()); throw error; }
      const layout = await reader.locator(".page-image").first().evaluate(el => ({ height: el.clientHeight, pageHeight: el.parentElement.clientHeight, overflow: getComputedStyle(el.parentElement).overflow }));
      assert.ok(layout.height > 100 && layout.height <= layout.pageHeight);
      assert.equal(layout.overflow, "hidden");
      assert.equal(await reader.locator(".reader-pdf-text-layer").count(), 0);
      await page.screenshot({ path: path.join(screenshots, `${name}-reader.png`) });
      await page.getByRole("button", { name: "Next page", exact: true }).click();
      await page.waitForTimeout(1200);
      await page.getByRole("button", { name: "Close reader", exact: true }).click();
      await page.locator("#import-files").setInputFiles({ name: "broken.epub", mimeType: "application/epub+zip", buffer: Buffer.from("not a zip") });
      await page.getByRole("status").filter({ hasText: "Could not import" }).waitFor();
      assert.equal(await page.locator(".book-card").count(), 2);
      await page.locator("#import-files").setInputFiles({ name: "raw_filename.epub", mimeType: "application/epub+zip", buffer: epub });
      await page.getByRole("status").filter({ hasText: "Already in your library" }).waitFor();
      assert.equal(await page.locator(".book-card").count(), 2);
      await page.evaluate(() => { window.originalAdd = IDBObjectStore.prototype.add; IDBObjectStore.prototype.add = function () { throw new DOMException("Storage full", "QuotaExceededError"); }; });
      await page.locator("#import-files").setInputFiles({ name: "quota.pdf", mimeType: "application/pdf", buffer: Buffer.concat([pdfFixture(), Buffer.from("\n% quota fixture")]) });
      await page.getByRole("status").filter({ hasText: "Device storage is full" }).waitFor();
      await page.evaluate(() => { IDBObjectStore.prototype.add = window.originalAdd; });
      assert.equal(await page.locator(".book-card").count(), 2);
      await page.evaluate(async () => { const cache = await caches.open("other-app-cache"); await cache.put("/other-app-data", new Response("safe")); });
      updatedWorker = true;
      await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration()).update(); });
      await page.getByRole("button", { name: "Update available", exact: true }).waitFor();
      await page.getByRole("button", { name: "Read A Traveling Library", exact: true }).click();
      await reader.locator(".page-text:visible").first().waitFor();
      await page.evaluate(() => document.getElementById("update-app").click());
      await page.getByRole("status").filter({ hasText: "Close your book before updating" }).waitFor();
      assert.equal(await page.locator("#reader-view").isVisible(), true);
      await page.getByRole("button", { name: "Close reader", exact: true }).click();
      await page.screenshot({ path: path.join(screenshots, `${name}-continue-reading.png`) });
      await Promise.all([page.waitForEvent("framenavigated", { predicate: frame => frame === page.mainFrame() }), page.getByRole("button", { name: "Update available", exact: true }).click()]);
      await page.getByText("Ready offline", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Read Offline PDF", exact: true }).waitFor();
      assert.equal(await page.locator(".book-card").count(), 2);
      assert.equal(await page.evaluate(async () => await caches.has("other-app-cache")), true);
      assert.ok(!notices.some(text => /Error modifying|unable to save|not a function/i.test(text)), notices.join("\n"));
      assert.deepEqual(errors, []);
      assert.deepEqual(apiCalls, []);
      await context.close();
      context = await engine.launchPersistentContext(profile, { headless: true, viewport: { width: 390, height: 844 }, serviceWorkers: "allow", offline: true });
      const offline = await context.newPage();
      await offline.goto(url);
      await offline.getByRole("button", { name: "Read Offline PDF", exact: true }).click();
      const offReader = offline.frameLocator("#reader-frame");
      await offReader.locator(".page-image[src^='data:image/jpeg']:visible").first().waitFor();
      await offline.locator("#next:not([disabled])").waitFor();
      assert.match(await offline.locator("#page-position").innerText(), /^2\s*\//);
      await offline.screenshot({ path: path.join(screenshots, `${name}-offline-phone.png`) });
      await offline.setViewportSize({ width: 1180, height: 820 });
      await offline.waitForTimeout(600);
      await offline.getByRole("button", { name: "Next page", exact: true }).click();
      await offline.getByRole("status").filter({ hasText: "End of book" }).waitFor();
      await offline.getByRole("button", { name: "Close reader", exact: true }).click();
      await offline.locator('.book-spine[aria-label="Read Offline PDF"]').waitFor();
      assert.equal(await offline.locator('.book-cover[aria-label="Read Offline PDF"]').count(), 0, "Completed books leave Continue Reading");
      await offline.getByRole("button", { name: "Read A Traveling Library", exact: true }).click();
      await offReader.locator(".page-text:visible").first().waitFor();
      await offline.getByRole("button", { name: "Close reader", exact: true }).click();
      offline.on("dialog", dialog => dialog.accept());
      await offline.getByRole("button", { name: "Remove Offline PDF", exact: true }).click();
      await offline.getByRole("button", { name: "Read Offline PDF", exact: true }).waitFor({ state: "detached" });
      assert.equal(await offline.locator(".book-card").count(), 1);
      await offline.reload();
      await offline.getByRole("button", { name: "Read A Traveling Library", exact: true }).waitFor();
      assert.equal(await offline.locator(".book-card").count(), 1);
      console.log(`PASS ${name}: EPUB/PDF import, metadata, page turns, settings, malformed/duplicate imports, quota failure, safe updates, offline cold restart, saved progress and deletion.`);
    } finally { await context?.close(); await rm(profile, { recursive: true, force: true }); }
  }
} finally { await new Promise(resolve => server.close(resolve)); }
console.log(`Screenshots: ${screenshots}`);
