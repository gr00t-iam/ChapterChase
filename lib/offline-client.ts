"use client";

type PendingProgress = {
  url: string;
  body: unknown;
  createdAt: number;
};

const dbName = "chapterchase-offline";
const storeName = "pending-progress";

export function getServiceWorkerContainer() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  return navigator.serviceWorker;
}

export async function registerChapterChaseServiceWorker() {
  const serviceWorker = getServiceWorkerContainer();
  if (!serviceWorker) {
    return;
  }

  const registration = await serviceWorker.register("/sw.js").catch(() => null);
  if (registration && "sync" in registration) {
    await (registration as ServiceWorkerRegistration & { sync: { register: (tag: string) => Promise<void> } }).sync
      .register("chapterchase-sync-progress")
      .catch(() => undefined);
  }
}

export async function cacheCurrentReading(bookId: string) {
  const serviceWorker = getServiceWorkerContainer();
  if (!serviceWorker) {
    return;
  }
  const registration = await serviceWorker.ready.catch(() => null);
  registration?.active?.postMessage({ type: "CACHE_READING", bookId });
}

export async function cacheWantToReadList() {
  const serviceWorker = getServiceWorkerContainer();
  if (!serviceWorker) {
    return;
  }
  const registration = await serviceWorker.ready.catch(() => null);
  registration?.active?.postMessage({ type: "CACHE_WANT_TO_READ" });
}

export async function postProgress(url: string, body: unknown) {
  if (navigator.onLine) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    if (response?.ok) {
      return;
    }
  }

  await enqueueProgress({ url, body, createdAt: Date.now() });
}

export async function syncPendingProgress() {
  const db = await openOfflineDb();
  const tx = db.transaction(storeName, "readwrite");
  const store = tx.objectStore(storeName);
  const records = await requestToPromise<PendingProgress[]>(store.getAll());

  for (const record of records) {
    const response = await fetch(record.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record.body),
    }).catch(() => null);
    if (response?.ok) {
      await requestToPromise(store.delete(record.createdAt));
    }
  }
}

async function enqueueProgress(record: PendingProgress) {
  const db = await openOfflineDb();
  const tx = db.transaction(storeName, "readwrite");
  tx.objectStore(storeName).put(record);
  await transactionDone(tx);
}

function openOfflineDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(storeName, { keyPath: "createdAt" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
