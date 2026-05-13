"use client";

import Link from "next/link";
import { Menu, Search, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { ActivityIndicator } from "@/components/ActivityIndicator";
import { AppNav } from "@/components/AppNav";

export const bookPreviewEvent = "chapterchase:book-preview";
export const bookPreviewClearEvent = "chapterchase:book-preview-clear";

export type BookPreviewDetail = {
  id: string;
  title: string;
  author: string | null;
  description: string | null;
  coverUrl: string | null;
};

type ShellUser = {
  name: string;
  email: string;
  role: string;
  disableAnimations: boolean;
};

export function AppFrame({ user, isAdmin, children }: { user: ShellUser; isAdmin: boolean; children: React.ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [preview, setPreview] = useState<BookPreviewDetail | null>(null);

  useEffect(() => {
    function showPreview(event: Event) {
      setPreview((event as CustomEvent<BookPreviewDetail>).detail);
    }

    function clearPreview() {
      setPreview(null);
    }

    window.addEventListener(bookPreviewEvent, showPreview);
    window.addEventListener(bookPreviewClearEvent, clearPreview);
    return () => {
      window.removeEventListener(bookPreviewEvent, showPreview);
      window.removeEventListener(bookPreviewClearEvent, clearPreview);
    };
  }, []);

  return (
    <div
      className={`app-shell ${isSidebarOpen ? "sidebar-open" : "sidebar-collapsed"} min-h-screen bg-[#111211] text-zinc-100`}
      data-disable-animations={user.disableAnimations ? "true" : "false"}
    >
      <header className="fixed inset-x-0 top-0 z-40 flex h-11 items-center border-b border-black bg-[#0b0c0b] shadow">
        <button
          className="grid h-11 w-12 place-items-center text-zinc-300 hover:text-zinc-100"
          aria-label={isSidebarOpen ? "Collapse sidebar" : "Open sidebar"}
          aria-expanded={isSidebarOpen}
          onClick={() => setIsSidebarOpen((current) => !current)}
        >
          <Menu size={21} />
        </button>
        <Link href="/" className="flex h-full w-36 items-center gap-2 px-2 text-lg font-semibold text-zinc-200">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-500/20 text-xs text-emerald-300">CC</span>
          ChapterChase
        </Link>
        <form action="/" className="flex h-8 flex-1 max-w-lg items-center gap-2 rounded bg-[#1b1c1d] px-3 text-sm text-zinc-500">
          <Search size={16} />
          <input name="q" placeholder="Search..." className="w-full bg-transparent text-zinc-200 placeholder:text-zinc-500 outline-none" />
        </form>
        <div className="ml-auto flex items-center gap-4 px-4 text-zinc-400">
          <ActivityIndicator />
          <Link href="/settings" aria-label="User settings" className="hover:text-zinc-100">
            <Settings size={18} />
          </Link>
          <span className="hidden text-sm md:inline">{user.name}</span>
        </div>
      </header>

      <aside className="app-sidebar fixed bottom-0 left-0 top-11 w-56 border-r border-black bg-[#121413] pt-3">
        <AppNav isAdmin={isAdmin} />
        <div className="sidebar-preview-zone">
          <BookPreviewCard preview={preview} />
          <div className="mt-4 text-sm text-zinc-400">
            <p className="truncate text-zinc-200">{user.name}</p>
            <p className="truncate">{user.email}</p>
            <form action="/logout" method="post" className="mt-3">
              <button className="text-sky-300 hover:text-sky-200">Sign out</button>
            </form>
          </div>
        </div>
      </aside>

      <div className="app-main pt-11">
        <header className="sticky top-11 z-20 flex h-14 items-center justify-between border-b border-black bg-[#121413]/95 px-4 backdrop-blur lg:hidden">
          <Link href="/" className="font-semibold">
            ChapterChase
          </Link>
          <form action="/logout" method="post">
            <button className="text-sm text-sky-300">Sign out</button>
          </form>
        </header>
        {children}
      </div>
    </div>
  );
}

function BookPreviewCard({ preview }: { preview: BookPreviewDetail | null }) {
  return (
    <section className="sidebar-book-preview" aria-label="Book Preview">
      <h2>Book Preview</h2>
      {preview ? (
        <div className="sidebar-book-preview-content">
          {preview.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview.coverUrl} alt="" />
          ) : (
            <div className="sidebar-book-preview-cover-fallback">CC</div>
          )}
          <div>
            <strong>{preview.title}</strong>
            <span>{preview.author ?? "Unknown author"}</span>
          </div>
          <p>{preview.description?.trim() || "No summary is available for this book yet. A rescan may find embedded description metadata."}</p>
        </div>
      ) : (
        <p className="sidebar-book-preview-idle">Hover over a book to view its summary here...</p>
      )}
    </section>
  );
}
