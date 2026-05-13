"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type BookManagementPanelProps = {
  book: {
    id: string;
    title: string;
    author: string | null;
    description: string | null;
    publisher: string | null;
    publishedDate: string | null;
    isbn: string | null;
    language: string | null;
    coverPath: string | null;
  };
};

type Tab = "general" | "cover" | "advanced";

export function BookManagementPanel({ book }: BookManagementPanelProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("general");
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isConfirmingRemove, setIsConfirmingRemove] = useState(false);

  async function saveMetadata(formData: FormData) {
    setIsSaving(true);
    setMessage("");
    const response = await fetch(`/api/books/${book.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: String(formData.get("title") ?? ""),
        author: String(formData.get("author") ?? ""),
        description: String(formData.get("description") ?? ""),
        publisher: String(formData.get("publisher") ?? ""),
        publishedDate: String(formData.get("publishedDate") ?? ""),
        isbn: String(formData.get("isbn") ?? ""),
        language: String(formData.get("language") ?? ""),
      }),
    });
    setIsSaving(false);

    if (!response.ok) {
      setMessage("Unable to save metadata.");
      return;
    }

    setMessage("Saved.");
    router.refresh();
  }

  async function saveCover(formData: FormData) {
    setIsSaving(true);
    setMessage("");
    const file = formData.get("file");
    const coverUrl = String(formData.get("coverUrl") ?? "").trim();
    const request =
      file instanceof File && file.size > 0
        ? fetch(`/api/books/${book.id}/cover`, { method: "POST", body: formData })
        : fetch(`/api/books/${book.id}/cover`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ coverUrl }),
          });

    const response = await request;
    setIsSaving(false);

    if (!response.ok) {
      setMessage("Unable to save cover image.");
      return;
    }

    setMessage("Cover updated.");
    router.refresh();
  }

  async function removeFromLibrary() {
    setIsSaving(true);
    const response = await fetch(`/api/books/${book.id}`, { method: "DELETE" });
    setIsSaving(false);

    if (!response.ok) {
      setMessage("Unable to remove this book.");
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <section className="kavita-editor mt-10">
      <aside className="kavita-editor-tabs">
        <button className={activeTab === "general" ? "active" : ""} onClick={() => setActiveTab("general")}>
          General
        </button>
        <button className={activeTab === "cover" ? "active" : ""} onClick={() => setActiveTab("cover")}>
          Cover Image
        </button>
        <button className={activeTab === "advanced" ? "active" : ""} onClick={() => setActiveTab("advanced")}>
          Advanced
        </button>
      </aside>
      <div className="kavita-editor-panel">
        {activeTab === "general" ? (
          <form action={saveMetadata} className="space-y-4">
            <label className="grid gap-2 text-sm text-zinc-400">
              Library Name
              <input className="kavita-input" name="title" defaultValue={book.title} />
            </label>
            <label className="grid gap-2 text-sm text-zinc-400">
              Author
              <input className="kavita-input" name="author" defaultValue={book.author ?? ""} />
            </label>
            <label className="grid gap-2 text-sm text-zinc-400">
              Description
              <textarea className="kavita-input min-h-28" name="description" defaultValue={book.description ?? ""} />
            </label>
            <div className="flex justify-end">
              <button className="kavita-save-button" disabled={isSaving}>
                Save
              </button>
            </div>
          </form>
        ) : null}

        {activeTab === "cover" ? (
          <form action={saveCover} className="space-y-4">
            <label className="grid gap-2 text-sm text-zinc-400">
              Cover image URL
              <input className="kavita-input" name="coverUrl" placeholder="https://example.com/cover.jpg" />
            </label>
            <label className="grid gap-2 text-sm text-zinc-400">
              Upload local cover image
              <input className="kavita-input" name="file" type="file" accept="image/*" />
            </label>
            <p className="text-sm text-zinc-400">Covers are copied into ChapterChase app data. Your book files are not modified.</p>
            <div className="flex justify-end">
              <button className="kavita-save-button" disabled={isSaving}>
                Save Cover
              </button>
            </div>
          </form>
        ) : null}

        {activeTab === "advanced" ? (
          <form action={saveMetadata} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm text-zinc-400">
                ISBN
                <input className="kavita-input" name="isbn" defaultValue={book.isbn ?? ""} />
              </label>
              <label className="grid gap-2 text-sm text-zinc-400">
                Language
                <input className="kavita-input" name="language" defaultValue={book.language ?? ""} />
              </label>
              <label className="grid gap-2 text-sm text-zinc-400">
                Publisher
                <input className="kavita-input" name="publisher" defaultValue={book.publisher ?? ""} />
              </label>
              <label className="grid gap-2 text-sm text-zinc-400">
                Published
                <input className="kavita-input" name="publishedDate" defaultValue={book.publishedDate ?? ""} />
              </label>
            </div>
            <input name="title" type="hidden" value={book.title} />
            <input name="author" type="hidden" value={book.author ?? ""} />
            <input name="description" type="hidden" value={book.description ?? ""} />
            <div className="flex flex-wrap justify-between gap-3 border-t border-white/10 pt-4">
              <button type="button" className="kavita-danger-button" onClick={() => setIsConfirmingRemove(true)}>
                Remove from Library
              </button>
              <button className="kavita-save-button" disabled={isSaving}>
                Save Advanced
              </button>
            </div>
          </form>
        ) : null}
        {message ? <p className="mt-4 text-sm text-sky-200">{message}</p> : null}
      </div>

      {isConfirmingRemove ? (
        <div className="kavita-dialog-backdrop" role="dialog" aria-modal="true">
          <div className="kavita-confirm-dialog">
            <h2 className="text-lg font-semibold">Remove from Library?</h2>
            <p className="mt-3 text-sm leading-6 text-zinc-300">
              This will only remove the entry from your library; your files will remain safe.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button className="kavita-light-button" onClick={() => setIsConfirmingRemove(false)}>
                Cancel
              </button>
              <button className="kavita-danger-button" onClick={removeFromLibrary} disabled={isSaving}>
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
