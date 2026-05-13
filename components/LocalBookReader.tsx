"use client";

import { useEffect, useState } from "react";
import ChapterChaseReader from "@/components/ChapterChaseReader";
import { getLocalLibraryBook } from "@/lib/local-library";
import { paginateText, type ReaderPage } from "@/lib/pagination";

type LocalBookReaderProps = {
  bookId: string;
  initialTheme: string;
  initialPageOverride?: number | null;
};

type LocalReaderState =
  | { status: "loading" }
  | { status: "missing" }
  | {
      status: "ready";
      title: string;
      author: string | null;
      format: string;
      initialPage: number;
      pages: ReaderPage[];
      fileBlob: Blob;
    };

export function LocalBookReader({ bookId, initialTheme, initialPageOverride }: LocalBookReaderProps) {
  const [state, setState] = useState<LocalReaderState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function loadLocalBook() {
      const book = await getLocalLibraryBook(bookId);
      if (!book) {
        if (!cancelled) {
          setState({ status: "missing" });
        }
        return;
      }

      const pages = book.format === "PDF" ? [] : await parseLocalTextPages(book.fileBlob, book.format);
      if (!cancelled) {
        setState({
          status: "ready",
          title: book.title,
          author: book.author,
          format: book.format,
          initialPage: initialPageOverride ?? book.pageIndex,
          pages,
          fileBlob: book.fileBlob,
        });
      }
    }

    void loadLocalBook();
    return () => {
      cancelled = true;
    };
  }, [bookId, initialPageOverride]);

  if (state.status === "loading") {
    return <main className="reader-loading-shell">Loading local book...</main>;
  }

  if (state.status === "missing") {
    return (
      <main className="reader-loading-shell">
        <h1>Local book not found</h1>
        <p>This Local Source is stored only in the browser where it was added.</p>
      </main>
    );
  }

  return (
    <ChapterChaseReader
      key={bookId}
      bookId={bookId}
      title={state.title}
      author={state.author}
      format={state.format}
      pages={state.pages}
      initialPage={state.initialPage}
      initialTheme={initialTheme}
      localFileBlob={state.fileBlob}
    />
  );
}

async function parseLocalTextPages(blob: Blob, format: string): Promise<ReaderPage[]> {
  if (format === "TXT") {
    return paginateText(await blob.text());
  }

  if (format === "HTML" || format === "HTM") {
    const documentHtml = new DOMParser().parseFromString(await blob.text(), "text/html");
    return paginateText(documentHtml.body.textContent ?? "");
  }

  if (format === "EPUB") {
    return parseLocalEpubPages(blob);
  }

  return paginateText("This local file is stored in IndexedDB, but ChapterChase does not yet have a browser parser for this format.");
}

async function parseLocalEpubPages(blob: Blob): Promise<ReaderPage[]> {
  try {
    const epubModule = (await import("epubjs")) as { default: (input: ArrayBuffer) => EpubBook };
    const ebook = epubModule.default(await blob.arrayBuffer());
    await ebook.ready;
    const sections = ebook.spine?.spineItems ?? [];
    const pages: ReaderPage[] = [];

    for (const section of sections) {
      const loaded = await section.load(ebook.load.bind(ebook));
      const text = loaded.body?.textContent?.replace(/\s+\n/g, "\n").replace(/[ \t]+/g, " ").trim() ?? "";
      section.unload();
      pages.push(...paginateText(text));
    }

    ebook.destroy();
    return pages.length ? pages : paginateText("No readable text was extracted from this local EPUB.");
  } catch {
    return paginateText("ChapterChase saved this local EPUB to IndexedDB, but it could not extract readable text in this browser.");
  }
}

type EpubBook = {
  ready: Promise<unknown>;
  load: (path: string) => Promise<unknown>;
  destroy: () => void;
  spine?: {
    spineItems?: Array<{
      load: (loader: EpubBook["load"]) => Promise<Document>;
      unload: () => void;
    }>;
  };
};
