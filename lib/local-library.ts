"use client";

import Dexie, { type Table } from "dexie";

export type LocalLibraryBook = {
  id: string;
  title: string;
  author: string | null;
  fileName: string;
  format: string;
  mimeType: string;
  fileSize: number;
  fileBlob: Blob;
  coverBlob?: Blob | null;
  addedAt: string;
  updatedAt: string;
  progressPercent: number;
  pageIndex: number;
};

export type LocalLibraryBookView = {
  id: string;
  title: string;
  author: string | null;
  description?: string | null;
  coverPath: string | null;
  coverVersion?: number;
  status: string;
  progress?: Array<{ percent: number }>;
  wantToRead?: Array<{ id: string }>;
  collectionBooks?: Array<{ id: string; collection: { id: string; name: string } }>;
  source: "local";
  localOnly: true;
  format: string;
  fileName: string;
  coverObjectUrl?: string;
};

class ChapterChaseLocalLibraryDb extends Dexie {
  books!: Table<LocalLibraryBook, string>;

  constructor() {
    super("ChapterChaseLocalLibrary");
    this.version(1).stores({
      books: "id, title, author, format, addedAt, updatedAt",
    });
  }
}

export const localLibraryDb = new ChapterChaseLocalLibraryDb();
export const localLibraryChangedEvent = "chapterchase:local-library-changed";

export async function addLocalSourceBook(file: File) {
  const now = new Date().toISOString();
  const id = `local-${crypto.randomUUID()}`;
  const book: LocalLibraryBook = {
    id,
    title: titleFromFileName(file.name),
    author: null,
    fileName: file.name,
    format: formatFromFile(file),
    mimeType: file.type || "application/octet-stream",
    fileSize: file.size,
    fileBlob: file,
    coverBlob: null,
    addedAt: now,
    updatedAt: now,
    progressPercent: 0,
    pageIndex: 0,
  };

  await localLibraryDb.books.put(book);
  notifyLocalLibraryChanged();
  return book;
}

export async function listLocalLibraryBookViews(): Promise<LocalLibraryBookView[]> {
  const books = await localLibraryDb.books.orderBy("title").toArray();
  return books.map(toLocalLibraryBookView);
}

export async function getLocalLibraryBook(id: string) {
  return localLibraryDb.books.get(id);
}

export async function updateLocalLibraryProgress(id: string, progressPercent: number, pageIndex: number) {
  await localLibraryDb.books.update(id, {
    progressPercent: Math.max(0, Math.min(1, progressPercent)),
    pageIndex: Math.max(0, pageIndex),
    updatedAt: new Date().toISOString(),
  });
  notifyLocalLibraryChanged();
}

export async function removeLocalSourceBook(id: string) {
  await localLibraryDb.books.delete(id);
  notifyLocalLibraryChanged();
}

export function revokeLocalCoverUrls(books: Array<{ coverObjectUrl?: string }>) {
  for (const book of books) {
    if (book.coverObjectUrl) {
      URL.revokeObjectURL(book.coverObjectUrl);
    }
  }
}

function toLocalLibraryBookView(book: LocalLibraryBook): LocalLibraryBookView {
  return {
    id: book.id,
    title: book.title,
    author: book.author,
    coverPath: null,
    coverVersion: new Date(book.updatedAt).getTime(),
    status: "READY",
    progress: book.progressPercent > 0 ? [{ percent: book.progressPercent }] : [],
    wantToRead: [],
    collectionBooks: [],
    source: "local",
    localOnly: true,
    format: book.format,
    fileName: book.fileName,
    coverObjectUrl: book.coverBlob ? URL.createObjectURL(book.coverBlob) : undefined,
  };
}

function titleFromFileName(fileName: string) {
  const cleaned = fileName
    .replace(/\.[^.]+$/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return titleCase(cleaned || "Untitled Local Book");
}

function titleCase(value: string) {
  const smallWords = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "from", "in", "of", "on", "or", "the", "to", "with"]);
  return value
    .split(/\s+/)
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index > 0 && smallWords.has(lower)) {
        return lower;
      }
      if (/^(?:api|ux|ui|ai|ml|nlp|html|css|sql|ios|pdf|epub)$/i.test(word)) {
        return word.toUpperCase();
      }
      return /^\d+$/.test(word) ? word : lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function formatFromFile(file: File) {
  const extension = file.name.split(".").pop()?.toUpperCase();
  if (extension) {
    return extension;
  }
  if (file.type.includes("pdf")) {
    return "PDF";
  }
  if (file.type.includes("epub")) {
    return "EPUB";
  }
  if (file.type.includes("text")) {
    return "TXT";
  }
  return "BOOK";
}

function notifyLocalLibraryChanged() {
  window.dispatchEvent(new CustomEvent(localLibraryChangedEvent));
}
