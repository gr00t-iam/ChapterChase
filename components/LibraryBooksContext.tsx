"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { listLocalLibraryBookViews, localLibraryChangedEvent, revokeLocalCoverUrls } from "@/lib/local-library";
import { getOfflineBookIds, offlineLibraryChangedEvent } from "@/lib/offline-library";

export type LibraryBookView = {
  id: string;
  title: string;
  author: string | null;
  description?: string | null;
  coverPath: string | null;
  coverVersion?: number;
  coverLoading?: boolean;
  status: string;
  progress?: Array<{ percent: number; updatedAt?: string | Date }>;
  wantToRead?: Array<{ id: string }>;
  collectionBooks?: Array<{ id: string; collection: { id: string; name: string } }>;
  source?: "remote" | "local";
  localOnly?: boolean;
  format?: string;
  fileName?: string;
  coverObjectUrl?: string;
  offlineAvailable?: boolean;
};

type LibraryBooksContextValue = {
  books: LibraryBookView[];
  updateBook: (book: Partial<LibraryBookView> & { id: string }) => void;
  removeBook: (id: string) => void;
  toggleWantToRead: (id: string, wantToRead: boolean) => void;
  updateProgressState: (id: string, read: boolean) => void;
  setOfflineState: (id: string, offlineAvailable: boolean) => void;
};

const LibraryBooksContext = createContext<LibraryBooksContextValue | null>(null);

export function LibraryBooksProvider({ initialBooks, children }: { initialBooks: LibraryBookView[]; children: React.ReactNode }) {
  const [books, setBooks] = useState<LibraryBookView[]>(() => initialBooks.map((book) => ({ ...book, source: book.source ?? "remote" })));

  useEffect(() => {
    let cancelled = false;
    let previousLocalBooks: LibraryBookView[] = [];

    async function refreshLocalBooks() {
      const localBooks = await listLocalLibraryBookViews();
      if (cancelled) {
        revokeLocalCoverUrls(localBooks);
        return;
      }

      setBooks((currentBooks) => {
        const remoteBooks = currentBooks.filter((book) => book.source !== "local");
        revokeLocalCoverUrls(previousLocalBooks);
        previousLocalBooks = localBooks;
        return [...remoteBooks, ...localBooks];
      });
    }

    void refreshLocalBooks();
    window.addEventListener(localLibraryChangedEvent, refreshLocalBooks);
    return () => {
      cancelled = true;
      window.removeEventListener(localLibraryChangedEvent, refreshLocalBooks);
      revokeLocalCoverUrls(previousLocalBooks);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function refreshOfflineState() {
      const offlineIds = new Set(await getOfflineBookIds());
      if (cancelled) {
        return;
      }
      setBooks((currentBooks) => currentBooks.map((book) => ({ ...book, offlineAvailable: offlineIds.has(book.id) })));
    }

    void refreshOfflineState();
    window.addEventListener(offlineLibraryChangedEvent, refreshOfflineState);
    return () => {
      cancelled = true;
      window.removeEventListener(offlineLibraryChangedEvent, refreshOfflineState);
    };
  }, []);

  const value = useMemo<LibraryBooksContextValue>(
    () => ({
      books,
      updateBook: (book) =>
        setBooks((currentBooks) => currentBooks.map((currentBook) => (currentBook.id === book.id ? { ...currentBook, ...book } : currentBook))),
      removeBook: (id) => setBooks((currentBooks) => currentBooks.filter((book) => book.id !== id)),
      toggleWantToRead: (id, wantToRead) =>
        setBooks((currentBooks) =>
          currentBooks.map((book) => (book.id === id ? { ...book, wantToRead: wantToRead ? [{ id: "optimistic" }] : [] } : book))
        ),
      updateProgressState: (id, read) =>
        setBooks((currentBooks) =>
          currentBooks.map((book) => (book.id === id ? { ...book, progress: read ? [{ percent: 1 }] : [] } : book))
        ),
      setOfflineState: (id, offlineAvailable) =>
        setBooks((currentBooks) => currentBooks.map((book) => (book.id === id ? { ...book, offlineAvailable } : book))),
    }),
    [books]
  );

  return <LibraryBooksContext.Provider value={value}>{children}</LibraryBooksContext.Provider>;
}

export function useLibraryBooks() {
  const context = useContext(LibraryBooksContext);
  if (!context) {
    throw new Error("useLibraryBooks must be used inside LibraryBooksProvider.");
  }
  return context;
}
