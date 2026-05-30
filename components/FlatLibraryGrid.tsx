"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { bookPreviewClearEvent, bookPreviewEvent, type BookPreviewDetail } from "@/components/AppFrame";
import { beginBookOpen, finishBookOpen } from "@/components/bookOpenAnimation";
import { BookContextMenu } from "@/components/BookContextMenu";
import { LibraryBooksProvider, useLibraryBooks, type LibraryBookView } from "@/components/LibraryBooksContext";

type FormatFilter = "all" | "EPUB" | "PDF";

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
  const [formatFilter, setFormatFilter] = useState<FormatFilter>("all");
  const [grouped, setGrouped] = useState(false);
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

  function finishOpen(bookId: string) {
    if (openTimerRef.current) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    router.push(`/reader/${bookId}`);
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

  const epubBooks = books.filter((b) => b.format?.toUpperCase() === "EPUB");
  const pdfBooks = books.filter((b) => b.format?.toUpperCase() === "PDF");
  const hasEpub = epubBooks.length > 0;
  const hasPdf = pdfBooks.length > 0;

  const filteredBooks =
    formatFilter === "EPUB" ? epubBooks : formatFilter === "PDF" ? pdfBooks : books;

  return (
    <>
      <div className="format-filter-bar">
        <div className="format-filter-pills">
          <button
            className={`format-pill ${formatFilter === "all" ? "active" : ""}`}
            onClick={() => { setFormatFilter("all"); setGrouped(false); }}
          >
            All
            <span className="format-pill-count">{books.length}</span>
          </button>
          <button
            className={`format-pill epub ${formatFilter === "EPUB" ? "active" : ""}`}
            onClick={() => { setFormatFilter("EPUB"); setGrouped(false); }}
          >
            EPUB
            <span className="format-pill-count">{epubBooks.length}</span>
          </button>
          <button
            className={`format-pill pdf ${formatFilter === "PDF" ? "active" : ""}`}
            onClick={() => { setFormatFilter("PDF"); setGrouped(false); }}
          >
            PDF
            <span className="format-pill-count">{pdfBooks.length}</span>
          </button>
        </div>

        {(hasEpub && hasPdf) && (
          <button
            className={`format-group-toggle ${grouped ? "active" : ""}`}
            onClick={() => { setGrouped((g) => !g); setFormatFilter("all"); }}
            title="Show EPUB and PDF in separate sections"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <rect x="1" y="2" width="6" height="5" rx="1" fill="currentColor" opacity="0.7" />
              <rect x="9" y="2" width="6" height="5" rx="1" fill="currentColor" />
              <rect x="1" y="9" width="6" height="5" rx="1" fill="currentColor" />
              <rect x="9" y="9" width="6" height="5" rx="1" fill="currentColor" opacity="0.7" />
            </svg>
            Group by type
          </button>
        )}
      </div>

      {grouped ? (
        <div className="format-grouped-sections">
          {hasEpub && (
            <section className="format-section">
              <h2 className="format-section-heading">
                <span className="format-badge epub">EPUB</span>
                <span className="format-section-count">{epubBooks.length} books</span>
              </h2>
              <BookGrid books={epubBooks} openingBookId={openingBookId} openBook={openBook} finishOpen={finishOpen}
                toggleWantToRead={toggleWantToRead} updateBook={updateBook} updateProgressState={updateProgressState}
                setOfflineState={setOfflineState} removeBook={removeBook} />
            </section>
          )}
          {hasPdf && (
            <section className="format-section">
              <h2 className="format-section-heading">
                <span className="format-badge pdf">PDF</span>
                <span className="format-section-count">{pdfBooks.length} books</span>
              </h2>
              <BookGrid books={pdfBooks} openingBookId={openingBookId} openBook={openBook} finishOpen={finishOpen}
                toggleWantToRead={toggleWantToRead} updateBook={updateBook} updateProgressState={updateProgressState}
                setOfflineState={setOfflineState} removeBook={removeBook} />
            </section>
          )}
        </div>
      ) : (
        <BookGrid books={filteredBooks} openingBookId={openingBookId} openBook={openBook} finishOpen={finishOpen}
          toggleWantToRead={toggleWantToRead} updateBook={updateBook} updateProgressState={updateProgressState}
          setOfflineState={setOfflineState} removeBook={removeBook} />
      )}
    </>
  );
}

interface BookGridProps {
  books: LibraryBookView[];
  openingBookId: string | null;
  openBook: (id: string) => void;
  finishOpen: (id: string) => void;
  toggleWantToRead: (id: string, wantToRead: boolean) => void;
  updateBook: (book: Partial<LibraryBookView> & { id: string }) => void;
  updateProgressState: (id: string, read: boolean) => void;
  setOfflineState: (id: string, offlineAvailable: boolean) => void;
  removeBook: (id: string) => void;
}

function BookGrid({ books, openingBookId, openBook, finishOpen, toggleWantToRead, updateBook, updateProgressState, setOfflineState, removeBook }: BookGridProps) {
  if (!books.length) {
    return (
      <p className="format-empty-state">No books in this format.</p>
    );
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
