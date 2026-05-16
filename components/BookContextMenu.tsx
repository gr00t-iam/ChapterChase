"use client";

import { MoreVertical } from "lucide-react";
import type { MouseEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { LibraryBookView } from "@/components/LibraryBooksContext";
import { removeLocalSourceBook } from "@/lib/local-library";
import { downloadBookForOffline, removeOfflineBook } from "@/lib/offline-library";

export function BookContextMenu({
  bookId,
  wantToRead,
  isRead,
  onToggleWantToRead,
  onUpdateProgressState,
  onUpdateBook,
  isLocalOnly = false,
  offlineAvailable = false,
  onOfflineStateChange,
  onRemoveBook,
}: {
  bookId: string;
  wantToRead: boolean;
  isRead: boolean;
  isLocalOnly?: boolean;
  offlineAvailable?: boolean;
  onToggleWantToRead: (bookId: string, nextValue: boolean) => void;
  onUpdateProgressState: (bookId: string, read: boolean) => void;
  onUpdateBook: (book: Partial<LibraryBookView> & { id: string }) => void;
  onOfflineStateChange?: (bookId: string, offlineAvailable: boolean) => void;
  onRemoveBook?: (bookId: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isEditingCover, setIsEditingCover] = useState(false);
  const [coverPrompt, setCoverPrompt] = useState("");
  const [isGeneratingCover, setIsGeneratingCover] = useState(false);
  const [isFetchingGoogleBooks, setIsFetchingHardcover] = useState(false);
  const [coverError, setCoverError] = useState("");
  const [menuPosition, setMenuPosition] = useState<{ left: number; top: number } | null>(null);
  const [toast, setToast] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function close(event: PointerEvent) {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setIsOpen(false);
      }
    }

    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    function positionMenu() {
      const triggerRect = rootRef.current?.getBoundingClientRect();
      const rect = menuRef.current?.getBoundingClientRect();
      if (!triggerRect || !rect) {
        return;
      }

      const viewportPadding = 8;
      const preferredLeft = triggerRect.right - rect.width;
      const preferredTop = triggerRect.bottom + 6;
      const maxLeft = window.innerWidth - rect.width - viewportPadding;
      const maxTop = window.innerHeight - rect.height - viewportPadding;

      setMenuPosition({
        left: Math.max(viewportPadding, Math.min(preferredLeft, maxLeft)),
        top: Math.max(viewportPadding, Math.min(preferredTop, maxTop)),
      });
    }

    const frame = window.requestAnimationFrame(positionMenu);
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
    };
  }, [isOpen, isEditingCover]);

  async function toggleWantToRead(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    const nextValue = !wantToRead;
    onToggleWantToRead(bookId, nextValue);
    setIsOpen(false);
    if (isLocalOnly) {
      return;
    }
    await fetch(`/api/books/${bookId}/want-to-read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wantToRead: nextValue }),
    }).catch(() => onToggleWantToRead(bookId, wantToRead));
  }

  async function markReadState(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    const nextRead = !isRead;
    onUpdateProgressState(bookId, nextRead);
    setIsOpen(false);
    if (isLocalOnly) {
      return;
    }
    await fetch(`/api/books/${bookId}/state`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: nextRead ? "mark-read" : "mark-unread" }),
    }).catch(() => onUpdateProgressState(bookId, isRead));
  }

  async function markUnread(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    onUpdateProgressState(bookId, false);
    setIsOpen(false);
    if (isLocalOnly) {
      return;
    }
    await fetch(`/api/books/${bookId}/state`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark-unread" }),
    }).catch(() => onUpdateProgressState(bookId, isRead));
  }

  async function generateCover(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    const prompt = coverPrompt.trim();
    if (!prompt || isGeneratingCover) {
      return;
    }

    setCoverError("");
    setIsGeneratingCover(true);
    const response = await fetch(`/api/books/${bookId}/cover`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aiPrompt: prompt }),
    }).catch(() => null);

    if (!response?.ok) {
      const data = (await response?.json().catch(() => null)) as { error?: string } | null;
      setCoverError(data?.error ?? "Unable to generate cover.");
      setIsGeneratingCover(false);
      return;
    }

    const data = (await response.json()) as { book?: { id: string; coverPath: string | null } };
    onUpdateBook({ id: bookId, coverPath: data.book?.coverPath ?? "generated", coverVersion: Date.now() });
    setIsGeneratingCover(false);
    setIsEditingCover(false);
    setCoverPrompt("");
    setIsOpen(false);
  }

  async function fetchFromGoogleBooks(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (isFetchingGoogleBooks) {
      return;
    }

    setCoverError("");
    setIsFetchingHardcover(true);
    onUpdateBook({ id: bookId, coverLoading: true });

    const response = await fetch("/api/metadata/fetch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId }),
    }).catch(() => null);

    if (!response?.ok) {
      const data = (await response?.json().catch(() => null)) as { error?: string } | null;
      setCoverError(data?.error ?? "Unable to fetch Google Books metadata.");
      setIsFetchingHardcover(false);
      onUpdateBook({ id: bookId, coverLoading: false });
      return;
    }

    const data = (await response.json()) as {
      book?: {
        id: string;
        title?: string;
        author?: string | null;
        description?: string | null;
        coverPath?: string | null;
      };
    };
    onUpdateBook({
      id: bookId,
      ...(data.book?.title ? { title: data.book.title } : {}),
      ...(data.book && "author" in data.book ? { author: data.book.author ?? null } : {}),
      ...(data.book && "description" in data.book ? { description: data.book.description ?? null } : {}),
      ...(data.book?.coverPath ? { coverPath: data.book.coverPath, coverVersion: Date.now() } : {}),
      coverLoading: false,
    });
    setIsFetchingHardcover(false);
    setIsEditingCover(false);
    setIsOpen(false);
  }

  async function toggleOffline(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (isLocalOnly) {
      return;
    }

    const nextOfflineState = !offlineAvailable;
    onOfflineStateChange?.(bookId, nextOfflineState);
    setIsOpen(false);

    try {
      if (offlineAvailable) {
        await removeOfflineBook(bookId);
      } else {
        await downloadBookForOffline(bookId);
      }
    } catch {
      onOfflineStateChange?.(bookId, offlineAvailable);
      setToast("Download failed, check your connection.");
      window.setTimeout(() => setToast(""), 2600);
    }
  }

  async function removeFromLibrary(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!window.confirm("This will only remove the entry from your library; your files will remain safe.")) {
      return;
    }

    onRemoveBook?.(bookId);
    setIsOpen(false);

    if (isLocalOnly) {
      await removeLocalSourceBook(bookId).catch(() => undefined);
      return;
    }

    const response = await fetch(`/api/books/${bookId}`, { method: "DELETE" }).catch(() => null);
    if (!response?.ok) {
      setToast("Unable to remove this book.");
      window.setTimeout(() => setToast(""), 2600);
    }
  }

  return (
    <div
      className="book-context-root"
      ref={rootRef}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setIsOpen(true);
      }}
    >
      <button
        className="book-context-trigger"
        aria-label="Book actions"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setIsOpen((current) => !current);
        }}
      >
        <MoreVertical size={16} />
      </button>
      {isOpen && typeof document !== "undefined" ? createPortal(
        <div
          className="book-context-menu"
          ref={menuRef}
          style={menuPosition ? { left: menuPosition.left, top: menuPosition.top } : undefined}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          {!isRead ? <button onClick={markReadState}>Mark as Read</button> : null}
          <button onClick={markUnread}>Mark as Unread</button>
          <button onClick={toggleWantToRead}>{wantToRead ? "Remove from Want to Read" : "Add to Want to Read"}</button>
          {!isLocalOnly ? <button onClick={toggleOffline}>{offlineAvailable ? "Remove from Offline" : "Download for Offline"}</button> : null}
          <button onClick={removeFromLibrary}>Delete</button>
          {isLocalOnly ? <span className="book-context-note">Local Only: stored on this device</span> : null}
          {!isLocalOnly ? (
            <button
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setIsEditingCover((current) => !current);
              }}
            >
              Edit Cover
            </button>
          ) : null}
          {isEditingCover ? (
            <div className="book-cover-editor">
              <label>
                <span>AI Prompt</span>
                <textarea
                  value={coverPrompt}
                  onChange={(event) => setCoverPrompt(event.target.value)}
                  placeholder="A mysterious old library at midnight"
                  rows={3}
                />
              </label>
              {coverError ? <p>{coverError}</p> : null}
              <button className="book-cover-generate" onClick={generateCover} disabled={!coverPrompt.trim() || isGeneratingCover}>
                {isGeneratingCover ? <span className="book-cover-spinner" /> : null}
                {isGeneratingCover ? "Generating..." : "Generate Cover"}
              </button>
              <button className="book-cover-generate secondary" onClick={fetchFromGoogleBooks} disabled={isFetchingGoogleBooks}>
                {isFetchingGoogleBooks ? <span className="book-cover-spinner" /> : null}
                {isFetchingGoogleBooks ? "Fetching..." : "Fetch from Google Books"}
              </button>
            </div>
          ) : null}
        </div>,
        document.body
      ) : null}
      {toast ? <div className="book-context-toast">{toast}</div> : null}
    </div>
  );
}
