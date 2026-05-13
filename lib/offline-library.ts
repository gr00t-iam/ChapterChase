"use client";

import localforage from "localforage";

export type OfflineBookRecord = {
  id: string;
  blob: Blob;
  savedAt: string;
};

const offlineBookStore = localforage.createInstance({
  name: "ChapterChaseOfflineBooks",
  storeName: "bookFiles",
  description: "Downloaded ChapterChase book files for offline reading",
});

export const offlineLibraryChangedEvent = "chapterchase:offline-library-changed";

export async function downloadBookForOffline(bookId: string) {
  const response = await fetch(`/api/books/${bookId}/file`);
  if (!response.ok) {
    throw new Error("Download failed, check your connection.");
  }

  const blob = await response.blob();
  await offlineBookStore.setItem<OfflineBookRecord>(bookId, {
    id: bookId,
    blob,
    savedAt: new Date().toISOString(),
  });
  notifyOfflineLibraryChanged();
}

export async function removeOfflineBook(bookId: string) {
  await offlineBookStore.removeItem(bookId);
  notifyOfflineLibraryChanged();
}

export async function getOfflineBook(bookId: string) {
  return offlineBookStore.getItem<OfflineBookRecord>(bookId);
}

export async function getOfflineBookIds() {
  const ids: string[] = [];
  await offlineBookStore.iterate<OfflineBookRecord, void>((record, key) => {
    if (record?.blob) {
      ids.push(key);
    }
  });
  return ids;
}

function notifyOfflineLibraryChanged() {
  window.dispatchEvent(new CustomEvent(offlineLibraryChangedEvent));
}
