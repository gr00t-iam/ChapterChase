/* eslint-disable @typescript-eslint/no-require-imports -- Electron integration test. */
const { app, BrowserWindow } = require("electron");
const assert = require("node:assert/strict");
const JSZip = require("jszip");
const path = require("node:path");
app.on("window-all-closed", () => {});
app.whenReady().then(async () => {
  const zip = new JSZip();
  zip.file("META-INF/container.xml", '<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>');
  zip.file("OPS/book.opf", '<package><manifest><item id="chapter" href="chapter.xhtml"/></manifest><spine><itemref idref="chapter"/></spine></package>');
  zip.file("OPS/chapter.xhtml", `<html><body><p>${"A library travels with its reader. ".repeat(600)}</p></body></html>`);
  const data = await zip.generateAsync({ type: "base64" });
  for (const [width, height] of [[390, 844], [1180, 820]]) {
    const window = new BrowserWindow({ width, height, show: false, webPreferences: { offscreen: true, backgroundThrottling: false, sandbox: true } });
    try {
      await window.loadFile(path.resolve("ios/ChapterChase/Reader/index.html"));
      await window.webContents.executeJavaScript(`window.messages=[]; window.webkit={messageHandlers:{reader:{postMessage: body => window.messages.push(body)}}}; ChapterChase.openBook(${JSON.stringify({ data, format: "epub", pageIndex: 0 })})`);
      const result = await window.webContents.executeJavaScript(`(async () => {
        await ChapterChase.read();
        const page=document.querySelector('.page-text');
        return { count:document.querySelectorAll('.page-text').length, text:messages.find(item=>item.type==='text')?.text, status:document.getElementById('status').hidden, overflow:getComputedStyle(page).overflow };
      })()`);
      assert.ok(result.count > 4, JSON.stringify(result));
      assert.ok(result.text.includes("library travels"), JSON.stringify(result));
      assert.equal(result.status, true);
      assert.equal(result.overflow, "hidden");
      console.log(`PASS offline EPUB pagination and speech extraction at ${width}x${height}`);
    } finally { window.destroy(); }
  }
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
