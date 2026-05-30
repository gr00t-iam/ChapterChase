"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRouter } from "next/navigation";
import { bookPreviewClearEvent, bookPreviewEvent, type BookPreviewDetail } from "@/components/AppFrame";
import { beginBookOpen, finishBookOpen } from "@/components/bookOpenAnimation";
import { BookContextMenu } from "@/components/BookContextMenu";
import { LibraryBooksProvider, useLibraryBooks, type LibraryBookView } from "@/components/LibraryBooksContext";

type LibraryBook = LibraryBookView;
type FormatFilter = "all" | "EPUB" | "PDF";

type ShelfItem =
  | { type: "top"; books: Array<{ book: LibraryBook; progressPercent: number }> }
  | { type: "spines"; books: LibraryBook[] };

const spineBooksPerGroup = 12;
const topShelfBooksPerGroup = 4;
const shelfHeight = 340;

export default function LibraryGrid({ books }: { books: LibraryBook[] }) {
  return (
    <LibraryBooksProvider initialBooks={books}>
      <VirtualizedLibraryGrid />
    </LibraryBooksProvider>
  );
}

function VirtualizedLibraryGrid() {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const openTimerRef = useRef<number | null>(null);
  const router = useRouter();
  const [openingBookId, setOpeningBookId] = useState<string | null>(null);
  const [formatFilter, setFormatFilter] = useState<FormatFilter>("all");
  const { books, toggleWantToRead, updateBook, updateProgressState, setOfflineState, removeBook } = useLibraryBooks();
  const epubBooks = useMemo(() => books.filter((book) => normalizeFormat(book.format) === "EPUB"), [books]);
  const pdfBooks = useMemo(() => books.filter((book) => normalizeFormat(book.format) === "PDF"), [books]);
  const filteredBooks = formatFilter === "EPUB" ? epubBooks : formatFilter === "PDF" ? pdfBooks : books;
  const rows = useMemo(() => buildShelfRows(filteredBooks), [filteredBooks]);

  useEffect(() => {
    return () => {
      if (openTimerRef.current) {
        window.clearTimeout(openTimerRef.current);
      }
    };
  }, []);
  // TanStack Virtual owns its internal measurement functions; this hook is intentionally not React Compiler memoized.
  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => shelfHeight,
    overscan: 3,
  });

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

  return (
    <>
      <FormatFilterBar
        activeFilter={formatFilter}
        allCount={books.length}
        epubCount={epubBooks.length}
        pdfCount={pdfBooks.length}
        onChange={(nextFilter) => {
          setOpeningBookId(null);
          setFormatFilter(nextFilter);
          parentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
        }}
      />

      <div className="wood-library-shell">
        <div ref={parentRef} className="wood-library-viewport">
          <div
            className="wood-library-virtual-space"
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
            }}
          >
            {rows.length ? (
              rowVirtualizer.getVirtualItems().map((virtualRow) => (
                <ShelfRow
                  key={virtualRow.key}
                  item={rows[virtualRow.index]}
                  openingBookId={openingBookId}
                  onOpenBook={(bookId) => {
                    setOpeningBookId(bookId);
                    if (openTimerRef.current) {
                      window.clearTimeout(openTimerRef.current);
                    }
                    openTimerRef.current = window.setTimeout(() => {
                      openTimerRef.current = null;
                      router.push(`/reader/${bookId}`);
                    }, 680);
                  }}
                  onAnimationEnd={(bookId) => {
                    if (openTimerRef.current) {
                      window.clearTimeout(openTimerRef.current);
                      openTimerRef.current = null;
                    }
                    router.push(`/reader/${bookId}`);
                  }}
                  onToggleWantToRead={toggleWantToRead}
                  onUpdateBook={updateBook}
                  onUpdateProgressState={updateProgressState}
                  onOfflineStateChange={setOfflineState}
                  onRemoveBook={removeBook}
                  style={{
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                />
              ))
            ) : (
              <p className="format-empty-state wood-format-empty">No books in this format.</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function FormatFilterBar({
  activeFilter,
  allCount,
  epubCount,
  pdfCount,
  onChange,
}: {
  activeFilter: FormatFilter;
  allCount: number;
  epubCount: number;
  pdfCount: number;
  onChange: (nextFilter: FormatFilter) => void;
}) {
  return (
    <div className="format-filter-bar wood-format-filter-bar" aria-label="Filter books by format">
      <div className="format-filter-pills">
        <button className={`format-pill ${activeFilter === "all" ? "active" : ""}`} onClick={() => onChange("all")}>
          All
          <span className="format-pill-count">{allCount}</span>
        </button>
        {epubCount > 0 ? (
          <button className={`format-pill epub ${activeFilter === "EPUB" ? "active" : ""}`} onClick={() => onChange("EPUB")}>
            EPUB
            <span className="format-pill-count">{epubCount}</span>
          </button>
        ) : null}
        {pdfCount > 0 ? (
          <button className={`format-pill pdf ${activeFilter === "PDF" ? "active" : ""}`} onClick={() => onChange("PDF")}>
            PDF
            <span className="format-pill-count">{pdfCount}</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ShelfRow({
  item,
  openingBookId,
  onOpenBook,
  onAnimationEnd,
  onToggleWantToRead,
  onUpdateBook,
  onUpdateProgressState,
  onOfflineStateChange,
  onRemoveBook,
  style,
}: {
  item: ShelfItem;
  openingBookId: string | null;
  onOpenBook: (bookId: string) => void;
  onAnimationEnd: (bookId: string) => void;
  onToggleWantToRead: (bookId: string, nextValue: boolean) => void;
  onUpdateBook: (book: Partial<LibraryBook> & { id: string }) => void;
  onUpdateProgressState: (bookId: string, read: boolean) => void;
  onOfflineStateChange: (bookId: string, offlineAvailable: boolean) => void;
  onRemoveBook: (bookId: string) => void;
  style: CSSProperties;
}) {
  return (
    <section className="wood-shelf-row virtualized" data-shelf-type={item.type} style={style}>
      {item.type === "top" ? (
        <div className="wood-top-shelf-section" aria-label="Currently Reading top shelf">
          {item.books.map(({ book, progressPercent }) => (
            <TopShelfCoverBook
              book={book}
              progressPercent={progressPercent}
              key={book.id}
              onToggleWantToRead={onToggleWantToRead}
              onUpdateBook={onUpdateBook}
              onUpdateProgressState={onUpdateProgressState}
              onOfflineStateChange={onOfflineStateChange}
              onRemoveBook={onRemoveBook}
            />
          ))}
        </div>
      ) : (
        <div className="wood-spine-stack">
          {item.books.map((book) => (
            <SpineBook
              book={book}
              key={book.id}
              isOpening={openingBookId === book.id}
              onOpenBook={onOpenBook}
              onAnimationEnd={onAnimationEnd}
              onToggleWantToRead={onToggleWantToRead}
              onUpdateBook={onUpdateBook}
              onUpdateProgressState={onUpdateProgressState}
              onOfflineStateChange={onOfflineStateChange}
              onRemoveBook={onRemoveBook}
            />
          ))}
        </div>
      )}
      <div className="wood-shelf-ledge" aria-hidden="true" />
    </section>
  );
}

function TopShelfCoverBook({
  book,
  progressPercent,
  onToggleWantToRead,
  onUpdateBook,
  onUpdateProgressState,
  onOfflineStateChange,
  onRemoveBook,
}: {
  book: LibraryBook;
  progressPercent: number;
  onToggleWantToRead: (bookId: string, nextValue: boolean) => void;
  onUpdateBook: (book: Partial<LibraryBook> & { id: string }) => void;
  onUpdateProgressState: (bookId: string, read: boolean) => void;
  onOfflineStateChange: (bookId: string, offlineAvailable: boolean) => void;
  onRemoveBook: (bookId: string) => void;
}) {
  return (
    <Link
      href={`/reader/${book.id}`}
      className="wood-current-cover-book top-shelf-card group"
      title={book.title}
      aria-label={`Open ${book.title}`}
      data-title={book.title}
      onMouseEnter={() => queueBookPreview(book)}
      onMouseLeave={clearBookPreview}
      onTouchStart={() => queueBookPreview(book)}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="wood-current-cover">
        <BookContextMenu
          bookId={book.id}
          wantToRead={Boolean(book.wantToRead?.length)}
          isRead={(book.progress?.[0]?.percent ?? 0) >= 1}
          isLocalOnly={book.localOnly === true}
          offlineAvailable={book.offlineAvailable === true}
          onToggleWantToRead={onToggleWantToRead}
          onUpdateBook={onUpdateBook}
          onUpdateProgressState={onUpdateProgressState}
          onOfflineStateChange={onOfflineStateChange}
          onRemoveBook={onRemoveBook}
        />
        <BookCover book={book} />
        {book.localOnly ? <span className="local-only-tag">Local Only</span> : null}
        {book.offlineAvailable ? <span className="offline-checkmark" title="Downloaded for offline">✓</span> : null}
        {book.coverLoading ? <span className="cover-loading-overlay"><i className="book-cover-spinner" /></span> : null}
        <span className="wood-current-cover-shadow" aria-hidden="true" />
      </div>
      <div className="wood-reading-progress wood-current-cover-progress" aria-label={`${Math.round(progressPercent)} percent read`}>
        <span style={{ width: `${progressPercent}%` }} />
      </div>
    </Link>
  );
}

function SpineBook({
  book,
  isOpening,
  onOpenBook,
  onAnimationEnd,
  onToggleWantToRead,
  onUpdateBook,
  onUpdateProgressState,
  onOfflineStateChange,
  onRemoveBook,
}: {
  book: LibraryBook;
  isOpening: boolean;
  onOpenBook: (bookId: string) => void;
  onAnimationEnd: (bookId: string) => void;
  onToggleWantToRead: (bookId: string, nextValue: boolean) => void;
  onUpdateBook: (book: Partial<LibraryBook> & { id: string }) => void;
  onUpdateProgressState: (bookId: string, read: boolean) => void;
  onOfflineStateChange: (bookId: string, offlineAvailable: boolean) => void;
  onRemoveBook: (bookId: string) => void;
}) {
  const spineStyle = getSpineStyle(book);

  return (
    <Link
      href={`/reader/${book.id}`}
      className={`wood-spine-book ${isOpening ? "is-opening" : ""}`}
      title={book.title}
      style={spineStyle}
      onClick={(event) => beginBookOpen(event, book.id, onOpenBook)}
      onContextMenu={(event) => event.preventDefault()}
      onAnimationEnd={(event) => finishBookOpen(event, book.id, onAnimationEnd)}
      onMouseEnter={() => queueBookPreview(book)}
      onMouseLeave={clearBookPreview}
      onTouchStart={() => queueBookPreview(book)}
    >
      <BookContextMenu
        bookId={book.id}
        wantToRead={Boolean(book.wantToRead?.length)}
        isRead={(book.progress?.[0]?.percent ?? 0) >= 1}
        isLocalOnly={book.localOnly === true}
        offlineAvailable={book.offlineAvailable === true}
        onToggleWantToRead={onToggleWantToRead}
        onUpdateBook={onUpdateBook}
        onUpdateProgressState={onUpdateProgressState}
        onOfflineStateChange={onOfflineStateChange}
        onRemoveBook={onRemoveBook}
      />
      {book.localOnly ? <i className="local-only-spine-dot" aria-label="Local Only" title="Local Only" /> : null}
      {book.offlineAvailable ? <i className="offline-spine-dot" aria-label="Downloaded for offline" title="Downloaded for offline" /> : null}
      <span>{book.title}</span>
    </Link>
  );
}

function BookCover({ book }: { book: LibraryBook }) {
  const className = "book-cover-image h-full w-full object-cover";
  if (book.coverObjectUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={book.coverObjectUrl} alt="" className={className} loading="lazy" decoding="async" />
    );
  }

  if (book.coverPath) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={`/api/books/${book.id}/cover?v=${book.coverVersion ?? 0}`} alt="" className={className} loading="lazy" decoding="async" />
    );
  }

  return (
    <div className="flex h-full flex-col justify-end bg-gradient-to-br from-zinc-700 via-zinc-800 to-zinc-950 p-3">
      <p className="line-clamp-5 text-sm font-semibold leading-tight text-zinc-100">{book.title}</p>
    </div>
  );
}

function getSpineStyle(book: LibraryBook) {
  const title = book.title;
  const length = title.trim().length;
  const width = length > 20 ? Math.min(86, Math.round(50 * 1.3 + Math.min(21, (length - 20) * 0.55))) : 50;
  const fontSize = length > 58 ? 10 : length > 42 ? 11 : length > 28 ? 12 : 13;
  const letterSpacing = length > 48 ? "0.02em" : length > 28 ? "0.035em" : "0.055em";
  const palette = getSpinePalette(book.id || title);

  return {
    "--spine-width": `${width}px`,
    "--spine-font-size": `${fontSize}px`,
    "--spine-letter-spacing": letterSpacing,
    "--spine-top-color": palette.top,
    "--spine-bottom-color": palette.bottom,
    "--spine-text-color": palette.text,
    "--spine-text-shadow": palette.text === "#111827" ? "0 1px 1px rgb(255 255 255 / 0.28)" : "0 1px 2px rgb(0 0 0 / 0.58)",
  } as CSSProperties;
}

const spineColorPalettes = [
  { top: "#7f1d1d", bottom: "#3f1115" }, // oxblood
  { top: "#14532d", bottom: "#082f1b" }, // forest green
  { top: "#1e3a8a", bottom: "#111b45" }, // midnight blue
  { top: "#475569", bottom: "#1f2937" }, // slate
  { top: "#27272a", bottom: "#111113" }, // charcoal
  { top: "#9a3412", bottom: "#431407" }, // burnt orange
  { top: "#581c87", bottom: "#2e1065" }, // deep violet
  { top: "#115e59", bottom: "#042f2e" }, // aged teal
  { top: "#713f12", bottom: "#3b2609" }, // antique umber
  { top: "#4c0519", bottom: "#26030d" }, // burgundy
  { top: "#334155", bottom: "#0f172a" }, // blue slate
  { top: "#78350f", bottom: "#3b1d07" }, // worn leather
  { top: "#f1d18a", bottom: "#a06b24" }, // faded gilt, uses dark text
  { top: "#c9b37a", bottom: "#76511e" }, // tan leather, uses dark text
];

function getSpinePalette(seed: string) {
  const hash = hashString(seed);
  const palette = spineColorPalettes[hash % spineColorPalettes.length];
  return {
    ...palette,
    text: getReadableTextColor(palette.top, palette.bottom),
  };
}

function hashString(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function getReadableTextColor(top: string, bottom: string) {
  const brightness = (getHexBrightness(top) + getHexBrightness(bottom)) / 2;
  return brightness > 138 ? "#111827" : "#f8fafc";
}

function getHexBrightness(hex: string) {
  const value = hex.replace("#", "");
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return (red * 299 + green * 587 + blue * 114) / 1000;
}

function buildShelfRows(books: LibraryBook[]): ShelfItem[] {
  if (!books.length) {
    return [];
  }

  const rows: ShelfItem[] = [];
  const spineBuffer: LibraryBook[] = [];
  const currentlyReading = books
    .map((book) => ({ book, progressPercent: normalizeProgress(book.progress?.[0]?.percent ?? 0) }))
    .filter((item) => item.progressPercent > 0 && item.progressPercent < 100)
    .sort(compareRecentlyOpened)
    .slice(0, topShelfBooksPerGroup);
  const shelfBooks = books
    .filter((book) => {
      const progressPercent = normalizeProgress(book.progress?.[0]?.percent ?? 0);
      return progressPercent <= 0 || progressPercent >= 100;
    })
    .sort(compareBookTitles);

  rows.push({ type: "top", books: currentlyReading });

  function flushSpines() {
    while (spineBuffer.length) {
      rows.push({ type: "spines", books: spineBuffer.splice(0, spineBooksPerGroup) });
    }
  }

  for (const book of shelfBooks) {
    spineBuffer.push(book);
    if (spineBuffer.length >= spineBooksPerGroup) {
      flushSpines();
    }
  }

  flushSpines();
  return rows;
}

function normalizeProgress(percent: number) {
  const normalized = percent <= 1 ? percent * 100 : percent;
  return Math.max(0, Math.min(100, normalized));
}

function normalizeFormat(format: string | null | undefined) {
  return format?.trim().toUpperCase();
}

function compareRecentlyOpened(
  first: { book: LibraryBook; progressPercent: number },
  second: { book: LibraryBook; progressPercent: number }
) {
  const firstTime = getProgressUpdatedTime(first.book);
  const secondTime = getProgressUpdatedTime(second.book);
  if (firstTime !== secondTime) {
    return secondTime - firstTime;
  }
  return compareBookTitles(first.book, second.book);
}

function getProgressUpdatedTime(book: LibraryBook) {
  const updatedAt = book.progress?.[0]?.updatedAt;
  if (!updatedAt) {
    return 0;
  }
  return updatedAt instanceof Date ? updatedAt.getTime() : Date.parse(updatedAt) || 0;
}

const titleCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function compareBookTitles(first: LibraryBook, second: LibraryBook) {
  const titleComparison = titleCollator.compare(normalizeSortTitle(first.title), normalizeSortTitle(second.title));
  return titleComparison || titleCollator.compare(first.id, second.id);
}

function normalizeSortTitle(title: string) {
  return title.trim().replace(/^(the|a|an)\s+/i, "");
}

let previewTimer: number | null = null;

function queueBookPreview(book: LibraryBook) {
  if (typeof window === "undefined") {
    return;
  }
  if (previewTimer) {
    window.clearTimeout(previewTimer);
  }
  previewTimer = window.setTimeout(() => {
    previewTimer = null;
    window.dispatchEvent(new CustomEvent<BookPreviewDetail>(bookPreviewEvent, { detail: toPreviewDetail(book) }));
  }, 150);
}

function clearBookPreview() {
  if (typeof window === "undefined") {
    return;
  }
  if (previewTimer) {
    window.clearTimeout(previewTimer);
    previewTimer = null;
  }
  window.dispatchEvent(new CustomEvent(bookPreviewClearEvent));
}

function toPreviewDetail(book: LibraryBook): BookPreviewDetail {
  return {
    id: book.id,
    title: book.title,
    author: book.author,
    description: book.description ?? null,
    coverUrl: book.coverObjectUrl ?? (book.coverPath ? `/api/books/${book.id}/cover?v=${book.coverVersion ?? 0}` : null),
  };
}
