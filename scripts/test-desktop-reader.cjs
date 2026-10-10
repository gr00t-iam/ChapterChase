/* eslint-disable @typescript-eslint/no-require-imports -- Run with Electron, not Node. */
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");
app.on("window-all-closed", () => {});

app.whenReady().then(async () => {
  const directory = path.resolve("desktop/runtime/app/.next/static/chunks");
  const names = (await fs.readdir(directory)).filter((name) => name.endsWith(".css"));
  const css = (await Promise.all(names.map((name) => fs.readFile(path.join(directory, name), "utf8")))).join("\n");
  const flipScript = await fs.readFile("node_modules/page-flip/dist/js/page-flip.browser.js", "utf8");
  const page = `<article class="reader-book-page reader-pdf-book-page"><div class="reader-page-content reader-pdf-page-content"><img class="reader-pdf-page-image" alt="Test PDF page" src="data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="white"/><text x="80" y="100" font-size="28">A distraction-free page</text></svg>')}"><p class="reader-page-text reader-pdf-text-layer">Extracted PDF text for speech, not a visible box.</p></div></article>`;
  for (const [width, height] of [[1280, 850], [390, 844]]) {
    const window = new BrowserWindow({ width, height, show: false, webPreferences: { offscreen: true, backgroundThrottling: false, contextIsolation: true, sandbox: true } });
    try {
      await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<style>${css}</style><main class="reader-shell" data-fixed-page-mode="true" data-reader-theme="night"><div class="book-container">${page.repeat(4)}</div></main><script>${flipScript}</script>`)}`);
      const result = await window.webContents.executeJavaScript(`(async () => {
        document.querySelector('.book-container').style.cssText = 'width: ${width - 32}px; height: ${height - 100}px; margin: 40px auto';
        const flip = new St.PageFlip(document.querySelector('.book-container'), { width: ${Math.floor(width / (width > 600 ? 2 : 1)) - 16}, height: ${height - 100}, size: 'stretch', minWidth: 280, maxWidth: 620, minHeight: 300, maxHeight: ${height - 100}, drawShadow: true, showCover: false, useMouseTouch: true });
        flip.loadFromHTML(document.querySelectorAll('article'));
        await new Promise(resolve => setTimeout(resolve, 100));
        // Offscreen windows may not receive animation frames until a paint is requested.
        flip.getRender().drawFrame();
        const contents = [...document.querySelectorAll('.reader-pdf-page-content')];
        const content = contents.find(element => element.getBoundingClientRect().height > 100);
        if (!content) throw new Error(JSON.stringify(contents.map(element => ({rect: element.getBoundingClientRect().toJSON(), parent: element.parentElement.style.cssText, html: element.outerHTML.slice(0, 100)}))));
        const image = content.querySelector('img');
        const text = content.querySelector('p');
        return { overflow: getComputedStyle(content).overflow, scrollHeight: content.scrollHeight, height: content.clientHeight, imageHeight: image.getBoundingClientRect().height, textWidth: text.getBoundingClientRect().width, count: flip.getPageCount() };
      })()`);
      assert.equal(result.count, 4);
      assert.equal(result.overflow, "hidden");
      assert.ok(result.scrollHeight <= result.height + 1, JSON.stringify(result));
      assert.ok(result.imageHeight > 100, JSON.stringify(result));
      assert.equal(result.textWidth, 1);
      await fs.writeFile(path.join(os.tmpdir(), `chapterchase-reader-${width}.png`), (await window.webContents.capturePage()).toPNG());
      console.log(`PASS: ${width}x${height} PDF fits PageFlip without a visible extracted-text panel or overflowing content.`);
    } finally { window.destroy(); }
  }
  app.quit();
}).catch((error) => { console.error(error); app.exit(1); });
