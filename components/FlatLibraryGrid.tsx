"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { bookPreviewClearEvent, bookPreviewEvent, type BookPreviewDetail } from "@/components/AppFrame";
import { beginBookOpen, finishBookOpen } from "@/components/bookOpenAnimation";
import { BookContextMenu } from "@/components/BookContextMenu";
import { LibraryBooksProvider, useLibraryBooks, type LibraryBookView } from "@/components/LibraryBooksContext";

export default function FlatLibraryGrid({ books }: { books: LibraryBookView[] }) {
  return (
    <LibraryBooksProvider initialBooks={books}>
      <FlatLibraryGridInner />
    </LibraryBooksProvider>
  );
}

function FlatLibraryGridInner() {
  const router = useRouter();
  const openTimerRef = useRef<number | null>(null);
  const [openingBookId, setOpeningBookId] = useState<string | null>(null);
  const { books, toggleWantToRead, updateBook, updateProgressState, setOfflineState, removeBook } = useLibraryBooks();

  useEffect(() => {
    return () => {
      if (openTimerRef.current) {
        window.clearTimeout(openTimerRef.current);
      }
    };
  }, []);

  function openBook(bookId: string) {
    setOpeningBookId(bookId);
    if (openTimerRef.current) {
      window.clearTimeout(openTimerRef.current);
    }
    openTimerRef.current = window.setTimeout(() => {
      openTimerRef.current = null;
      router.push(`/reader/${bookId}`);
    }, 680);
  }

  if (!books.length) {
    return (
      <section className="rounded bg-[#202124] p-8 text-center shadow ring-1 ring-white/10">
        <h2 className="text-xl font-semibold">No books indexed yet</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-zinc-400">
          Add a NAS-mounted library folder, scan it, or add a Local Source that stays on this device.
        </p>
      </section>
    );
  }

  function finishOpen(bookId: string) {
    if (openTimerRef.current) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    router.push(`/reader/${bookId}`);
  }

  return (
    <div className="flat-library-grid">
      {books.map((book) => (
        <Link
          href={`/reader/${book.id}`}
          key={book.id}
          className={`flat-book-card ${openingBookId === book.id ? "is-opening" : ""}`}
          onClick={(event) => beginBookOpen(event, book.id, openBook)}
          onContextMenu={(event) => {
            event.preventDefault();
          }}
          onMouseEnter={() => queueBookPreview(book)}
          onMouseLeave={clearBookPreview}
          onTouchStart={() => queueBookPreview(book)}
          onAnimationEnd={(event) => finishBookOpen(event, book.id, finishOpen)}
        >
          <BookContextMenu
            bookId={book.id}
            wantToRead={Boolean(book.wantToRead?.length)}
            isRead={(book.progress?.[0]?.percent ?? 0) >= 1}
            isLocalOnly={book.localOnly === true}
            offlineAvailable={book.offlineAvailable === true}
            onToggleWantToRead={toggleWantToRead}
            onUpdateBook={updateBook}
            onUpdateProgressState={updateProgressState}
            onOfflineStateChange={setOfflineState}
            onRemoveBook={removeBook}
          />
          <div className="flat-book-cover">
            {book.coverObjectUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={book.coverObjectUrl} alt="" loading="lazy" decoding="async" />
            ) : book.coverPath ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/books/${book.id}/cover?v=${book.coverVersion ?? 0}`} alt="" loading="lazy" decoding="async" />
            ) : (
              <div className="flat-book-placeholder">{book.title}</div>
            )}
            {book.localOnly ? <span className="local-only-tag">Local Only</span> : null}
            {book.offlineAvailable ? <span className="offline-checkmark" title="Downloaded for offline">✓</span> : null}
            {book.coverLoading ? <span className="cover-loading-overlay"><i className="book-cover-spinner" /></span> : null}
          </div>
          <div className="flat-book-meta">
            <p>{book.title}</p>
            <span>{book.author ?? "Unknown author"}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}

let previewTimer: number | null = null;

function queueBookPreview(book: LibraryBookView) {
  if (previewTimer) {
    window.clearTimeout(previewTimer);
  }
  previewTimer = window.setTimeout(() => {
    previewTimer = null;
    window.dispatchEvent(new CustomEvent<BookPreviewDetail>(bookPreviewEvent, { detail: toPreviewDetail(book) }));
  }, 150);
}

function clearBookPreview() {
  if (previewTimer) {
    window.clearTimeout(previewTimer);
    previewTimer = null;
  }
  window.dispatchEvent(new CustomEvent(bookPreviewClearEvent));
}

function toPreviewDetail(book: LibraryBookView): BookPreviewDetail {
  return {
    id: book.id,
    title: book.title,
    author: book.author,
    description: book.description ?? null,
    coverUrl: book.coverObjectUrl ?? (book.coverPath ? `/api/books/${book.id}/cover?v=${book.coverVersion ?? 0}` : null),
  };
}
