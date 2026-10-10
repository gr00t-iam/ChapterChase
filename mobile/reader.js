import { PageFlip } from "page-flip";
import JSZip from "jszip";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import * as pdfWorker from "pdfjs-dist/legacy/build/pdf.worker.mjs";

// WKWebView file resources cannot reliably spawn module workers. PDF.js supports
// its in-process worker transport, keeping all book processing offline.
globalThis.pdfjsWorker = pdfWorker;
const send = (body) => window.webkit?.messageHandlers.reader.postMessage(body);
let flip;
let pages = [];
let pdf;
let revision = 0;
let chunks = [];
let readingRequest = 0;
let pdfQueue = Promise.resolve();
const box = document.querySelector(".book-container");
const status = document.getElementById("status");
const dimensions = () => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  return { width: Math.floor(width / (width > height ? 2 : 1)), height };
};

function paginate() {
  const { width, height } = dimensions();
  const probe = document.createElement("div");
  probe.className = "page-text";
  Object.assign(probe.style, { position: "absolute", visibility: "hidden", width: `${width}px`, height: `${height}px` });
  document.body.append(probe);
  const result = [];
  for (const chunk of chunks) {
    const words = chunk.match(/\S+\s*/g) ?? [];
    let start = 0;
    while (start < words.length) {
      let low = start + 1;
      let high = words.length;
      let fit = low;
      while (low <= high) {
        const middle = (low + high) >> 1;
        probe.textContent = words.slice(start, middle).join("");
        if (probe.scrollHeight <= probe.clientHeight) { fit = middle; low = middle + 1; }
        else high = middle - 1;
      }
      result.push({ text: words.slice(start, fit).join("") });
      start = fit;
    }
  }
  probe.remove();
  return result.length ? result : [{ text: "No readable text found." }];
}

function preparePDF(index) {
  const task = pdfQueue.catch(() => {}).then(() => renderPDF(index));
  pdfQueue = task;
  return task;
}
async function renderPDF(index) {
  const version = revision;
  const visible = Array.from({ length: Math.min(4, pages.length - index) }, (_, offset) => index + offset);
  for (const number of visible) {
    const record = pages[number];
    if (record.rendered || record.rendering) continue;
    record.rendering = true;
    try {
      const page = await pdf.getPage(number + 1);
      const natural = page.getViewport({ scale: 1 });
      const size = dimensions();
      const viewport = page.getViewport({ scale: Math.min(size.width / natural.width, size.height / natural.height) * Math.min(devicePixelRatio, 2) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      await page.render({ canvasContext: canvas.getContext("2d"), canvas, viewport }).promise;
      const text = await page.getTextContent();
      if (version !== revision) return;
      record.text = text.items.map(item => item.str ?? "").join(" ");
      record.image.src = canvas.toDataURL("image/jpeg", 0.9);
      record.rendered = true;
      page.cleanup();
    } finally { record.rendering = false; }
  }
  for (let number = 0; number < pages.length; number++) {
    if (Math.abs(number - index) > 6 && pages[number].rendered) {
      pages[number].image.removeAttribute("src"); pages[number].rendered = false;
    }
  }
}

function mount(index) {
  revision++;
  flip?.destroy();
  // PageFlip destroys its container; React never owns these raw DOM pages.
  box.replaceChildren();
  if (!box.isConnected) document.getElementById("stage").append(box);
  const nodes = pages.map(record => {
    const page = document.createElement("article"); page.className = "page";
    if (pdf) {
      const image = document.createElement("img"); image.className = "page-image"; image.alt = "PDF page";
      record.image = image; record.rendered = false; record.rendering = false; page.append(image);
    } else { const text = document.createElement("div"); text.className = "page-text"; text.textContent = record.text; page.append(text); }
    box.append(page); return page;
  });
  const { width, height } = dimensions();
  flip = new PageFlip(box, { width, height, size: "stretch", minWidth: 100, maxWidth: width, minHeight: 100, maxHeight: height, drawShadow: true, flippingTime: 1000, showCover: true, useMouseTouch: true, usePortrait: true, startPage: Math.min(index, pages.length - 1) });
  flip.on("flip", event => {
    const page = event.data;
    if (pdf) void preparePDF(page).catch(fail);
    send({ type: "progress", page, percent: pages.length > 1 ? page / (pages.length - 1) * 100 : 100 });
  });
  flip.loadFromHTML(nodes);
}
function fail(error) { status.hidden = false; status.textContent = "Unable to open book."; send({ type: "error", message: String(error.message ?? error) }); }

window.ChapterChase = {
  async openBook(options) {
    try {
      const bytes = Uint8Array.from(atob(options.data), char => char.charCodeAt(0));
      if (options.format === "pdf") {
        pdf = await pdfjs.getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: true }).promise;
        pages = Array.from({ length: pdf.numPages }, () => ({ text: "" }));
      } else {
        const zip = await JSZip.loadAsync(bytes);
        const parser = new DOMParser();
        const container = parser.parseFromString(await zip.file("META-INF/container.xml").async("string"), "application/xml");
        const path = container.querySelector("rootfile").getAttribute("full-path");
        const opf = parser.parseFromString(await zip.file(path).async("string"), "application/xml");
        const manifest = new Map([...opf.querySelectorAll("manifest > item")].map(item => [item.id, item.getAttribute("href")]));
        chunks = [];
        for (const item of opf.querySelectorAll("spine > itemref")) {
          const href = manifest.get(item.getAttribute("idref"));
          if (!href) continue;
          const entry = decodeURIComponent(new URL(href, `https://epub.local/${path}`).pathname.slice(1));
          const file = zip.file(entry);
          if (!file) continue;
          const chapter = parser.parseFromString(await file.async("string"), "text/html");
          chapter.querySelectorAll("script,style,nav").forEach(node => node.remove());
          chunks.push(chapter.body.innerText || chapter.body.textContent || "");
        }
        pages = paginate();
      }
      const savedIndex = pdf ? options.pageIndex ?? 0 : Math.round((options.percent ?? 0) / 100 * Math.max(0, pages.length - 1));
      const index = Math.min(pages.length - 1, Math.max(0, savedIndex));
      mount(index);
      if (pdf) await preparePDF(index);
      status.hidden = true;
    } catch (error) { fail(error); }
  },
  previous() { flip?.flipPrev(); },
  next() {
    if (!flip) return;
    const index = flip.getCurrentPageIndex();
    const spread = flip.getOrientation() === "landscape" && index > 0 ? 2 : 1;
    if (index + spread >= pages.length) send({ type: "end" }); else flip.flipNext();
  },
  async read() {
    const request = ++readingRequest;
    try {
      const index = flip?.getCurrentPageIndex() ?? 0;
      if (pdf) await preparePDF(index);
      const spread = flip.getOrientation() === "landscape" && index > 0 ? 2 : 1;
      if (request === readingRequest) send({ type: "text", text: pages.slice(index, index + spread).map(page => page.text).join("\n\n") });
    } catch (error) { fail(error); }
  },
};
let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (!flip) return;
    const fraction = flip.getCurrentPageIndex() / Math.max(1, pages.length - 1);
    if (!pdf) pages = paginate();
    const index = Math.round(fraction * Math.max(0, pages.length - 1));
    mount(index); if (pdf) void preparePDF(index).catch(fail);
  }, 200);
});
send({ type: "ready" });
