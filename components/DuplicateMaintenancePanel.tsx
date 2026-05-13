"use client";

import { useRouter } from "next/navigation";
import type { DuplicateGroup } from "@/lib/duplicates";

export function DuplicateMaintenancePanel({ groups }: { groups: DuplicateGroup[] }) {
  const router = useRouter();

  async function removeBook(id: string) {
    if (!window.confirm("This will only remove the entry from your library; your files will remain safe.")) {
      return;
    }

    await fetch(`/api/books/${id}`, { method: "DELETE" });
    router.refresh();
  }

  async function removeBulk(ids: string[]) {
    if (!window.confirm("This will only remove the entry from your library; your files will remain safe.")) {
      return;
    }

    await fetch("/api/admin/books/bulk-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    router.refresh();
  }

  if (!groups.length) {
    return (
      <section className="maintenance-empty">
        <h2>No duplicate books found</h2>
        <p>ChapterChase checked ISBN and Title/Author combinations.</p>
      </section>
    );
  }

  return (
    <div className="maintenance-duplicates">
      {groups.map((group) => (
        <section key={group.key} className="maintenance-group">
          <div className="maintenance-group-header">
            <div>
              <h2>{group.reason} duplicate</h2>
              <p>{group.books.length} matching entries</p>
            </div>
            <button className="kavita-danger-button" onClick={() => removeBulk(group.books.slice(1).map((book) => book.id))}>
              Remove All But First
            </button>
          </div>
          <div className="maintenance-book-list">
            {group.books.map((book, index) => (
              <article key={book.id}>
                <div>
                  <strong>{book.title}</strong>
                  <span>{book.author ?? "Unknown author"}</span>
                  <small>{book.filePath}</small>
                </div>
                {index === 0 ? <em>Keep candidate</em> : <button onClick={() => removeBook(book.id)}>Delete Entry</button>}
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
