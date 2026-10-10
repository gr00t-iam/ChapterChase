import Dexie from "dexie";
import JSZip from "jszip";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import * as worker from "pdfjs-dist/legacy/build/pdf.worker.mjs";

globalThis.pdfjsWorker = worker;
const db = new Dexie("ChapterChaseStandalone");
db.version(1).stores({ books: "id,title,author,addedAt,lastOpened,percent", settings: "key" });
db.version(2).stores({ books: "id,title,author,addedAt", settings: "key", progress: "id,lastOpened,percent" });
export const cleanTitle = name => name.replace(/\.[^.]+$/, "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim() || "Untitled";
const parseXML = text => {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("Invalid EPUB metadata");
  return doc;
};
const field = (doc, name) => [...doc.getElementsByTagNameNS("*", name)].map(el => el.textContent.trim()).filter(Boolean).join(", ");

async function epubMetadata(bytes) {
  const zip = await JSZip.loadAsync(bytes);
  const container = zip.file("META-INF/container.xml");
  if (!container) throw new Error("Missing EPUB container");
  const opfPath = parseXML(await container.async("string")).querySelector("rootfile")?.getAttribute("full-path");
  const opfFile = opfPath && zip.file(opfPath);
  if (!opfFile) throw new Error("Missing EPUB package");
  const opf = parseXML(await opfFile.async("string"));
  if (!opf.querySelector("spine > itemref")) throw new Error("Missing EPUB chapters");
  const coverId = [...opf.querySelectorAll("metadata > meta")].find(el => el.getAttribute("name") === "cover")?.getAttribute("content");
  const cover = [...opf.querySelectorAll("manifest > item")].find(el => el.id === coverId || el.getAttribute("properties")?.split(/\s+/).includes("cover-image"));
  let coverBlob = null;
  if (cover) {
    const url = new URL(cover.getAttribute("href"), `https://epub.local/${opfPath}`);
    const type = cover.getAttribute("media-type");
    // Only embedded raster covers are retained; SVG/HTML never enters the UI.
    if (url.origin === "https://epub.local" && ["image/jpeg", "image/png", "image/webp"].includes(type)) {
      const entry = zip.file(decodeURIComponent(url.pathname.slice(1)));
      if (entry) {
        const data = await entry.async("uint8array");
        if (data.byteLength <= 10 * 1024 * 1024) coverBlob = new Blob([data], { type });
      }
    }
  }
  return { title: field(opf, "title"), author: field(opf, "creator"), coverBlob };
}

export async function importBook(file) {
  const format = file.name.split(".").pop().toLowerCase();
  if (!["epub", "pdf"].includes(format)) throw new Error("Choose EPUB or PDF files");
  if (!file.size || file.size > 200 * 1024 * 1024) throw new Error("Book must be between 1 byte and 200 MB");
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const id = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
  const existing = await db.books.get(id);
  if (existing) return { book: existing, duplicate: true };
  let metadata;
  if (format === "epub") metadata = await epubMetadata(bytes);
  else {
    const pdfDocument = await pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)), isEvalSupported: false, useSystemFonts: true }).promise;
    try {
      const { info } = await pdfDocument.getMetadata();
      metadata = { title: info.Title, author: info.Author };
      const page = await pdfDocument.getPage(1);
      const natural = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(320 / natural.width, 440 / natural.height) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, canvasContext: canvas.getContext("2d"), viewport }).promise;
      metadata.coverBlob = await new Promise(resolve => canvas.toBlob(resolve, "image/webp", 0.85));
    } finally { await pdfDocument.loadingTask.destroy(); }
  }
  const now = new Date().toISOString();
  const book = { id, title: String(metadata.title || cleanTitle(file.name)), author: String(metadata.author || "Unknown author"), format, fileName: file.name, blob: new Blob([bytes], { type: format === "pdf" ? "application/pdf" : "application/epub+zip" }), coverBlob: metadata.coverBlob ?? null, addedAt: now, lastOpened: null, percent: 0, pageIndex: 0 };
  // Persistence succeeds before the book is announced to the UI.
  await db.books.add(book);
  return { book, duplicate: false };
}
export const listBooks = async () => {
  const [books, progress] = await Promise.all([db.books.toArray(), db.progress.toArray()]);
  const states = new Map(progress.map(record => [record.id, record]));
  return books.map(book => ({ ...book, ...states.get(book.id) }));
};
export const getBook = async id => {
  const [book, progress] = await Promise.all([db.books.get(id), db.progress.get(id)]);
  return book ? { ...book, ...progress } : undefined;
};
export const deleteBook = id => db.transaction("rw", db.books, db.progress, async () => { await db.books.delete(id); await db.progress.delete(id); });
export const saveProgress = (id, percent, pageIndex) => db.transaction("rw", db.books, db.progress, async () => {
  if (await db.books.where(":id").equals(id).count()) await db.progress.put({ id, percent: Math.max(0, Math.min(100, percent)), pageIndex: Math.max(0, Math.floor(pageIndex)), lastOpened: new Date().toISOString() });
});
export const getSettings = async () => (await db.settings.get("preferences"))?.value ?? {};
export const saveSettings = value => db.settings.put({ key: "preferences", value });
export function exportBook(book) {
  const url = URL.createObjectURL(book.blob);
  const link = document.createElement("a"); link.href = url; link.download = book.fileName; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
