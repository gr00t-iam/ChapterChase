/* eslint-disable @typescript-eslint/no-require-imports -- Electron integration test. */
const { app, BrowserWindow } = require("electron");
const assert = require("node:assert/strict");
const JSZip = require("jszip");
const path = require("node:path");
app.on("window-all-closed", () => {});
function pdfFixture() {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const stream = 'BT /F1 24 Tf 60 700 Td (Offline PDF reading works.) Tj ET';
  objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  let file = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(file.length); file += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = file.length;
  file += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => String(offset).padStart(10, '0') + ' 00000 n ').join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(file).toString('base64');
}
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
      await window.webContents.executeJavaScript(`ChapterChase.openBook(${JSON.stringify({ data: pdfFixture(), format: "pdf", pageIndex: 0 })})`);
      const pdf = await window.webContents.executeJavaScript(`(async () => { await ChapterChase.read(); return { image:document.querySelector('.page-image')?.src, text:messages.filter(item=>item.type==='text').at(-1)?.text }; })()`);
      assert.ok(pdf.image.startsWith('data:image/jpeg'), JSON.stringify(pdf));
      assert.ok(pdf.text.includes('Offline PDF'), JSON.stringify(pdf));
      console.log(`PASS offline PDF canvas rendering and speech extraction at ${width}x${height}`);
    } finally { window.destroy(); }
  }
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
