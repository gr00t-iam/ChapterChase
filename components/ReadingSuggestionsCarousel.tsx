"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import type { ReadingSuggestion } from "@/lib/want-to-read";

export function ReadingSuggestionsCarousel({ suggestions }: { suggestions: ReadingSuggestion[] }) {
  const router = useRouter();
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(() => new Set());

  if (!suggestions.length) {
    return null;
  }

  async function addSuggestion(bookId: string) {
    if (addingId || addedIds.has(bookId)) {
      return;
    }

    setAddingId(bookId);
    const response = await fetch(`/api/books/${bookId}/want-to-read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wantToRead: true }),
    }).catch(() => null);

    if (response?.ok) {
      setAddedIds((current) => new Set(current).add(bookId));
      router.refresh();
    }

    setAddingId(null);
  }

  return (
    <section className="reading-suggestions" aria-labelledby="reading-suggestions-title">
      <div className="reading-suggestions-header">
        <h2 id="reading-suggestions-title">Reading Suggestions</h2>
      </div>
      <div className="reading-suggestions-track">
        {suggestions.map((book) => {
          const isAdded = addedIds.has(book.id);
          return (
            <Link key={book.id} href={`/reader/${book.id}`} className="reading-suggestion-card" title={book.title}>
              <div className="reading-suggestion-cover">
                {book.coverPath ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/books/${book.id}/cover?v=${book.coverVersion}`} alt="" loading="lazy" decoding="async" />
                ) : (
                  <span>{book.title}</span>
                )}
                <button
                  type="button"
                  className="reading-suggestion-add"
                  aria-label={`Add ${book.title} to Want to Read`}
                  disabled={addingId === book.id || isAdded}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    void addSuggestion(book.id);
                  }}
                >
                  <Plus size={16} />
                </button>
                {book.readingTimeLabel ? <span className="reading-time-badge">{book.readingTimeLabel}</span> : null}
              </div>
              <strong>{book.title}</strong>
              <span>{book.author ?? "Unknown author"}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
