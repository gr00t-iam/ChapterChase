import Link from "next/link";
import LibraryGrid from "@/components/LibraryGrid";
import { AppShell } from "@/components/AppShell";
import { ReadingSuggestionsCarousel } from "@/components/ReadingSuggestionsCarousel";
import { hasUsers, requireUser } from "@/lib/auth";
import { getReadingSuggestions, getWantToReadPageBooks } from "@/lib/want-to-read";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function WantToReadPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  if (!(await hasUsers())) {
    redirect("/setup");
  }

  const user = await requireUser();
  const { q } = await searchParams;
  const query = q?.trim();
  const [books, suggestions] = await Promise.all([
    getWantToReadPageBooks({ query, userId: user.id }),
    getReadingSuggestions(user.id),
  ]);

  return (
    <AppShell user={user}>
      <main className="px-5 py-6 pr-12">
        <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-medium tracking-tight text-zinc-200">Want to Read</h1>
            <p className="mt-1 text-lg text-zinc-400">
              {query ? `${books.length} matches for "${query}"` : `${books.length} saved books`}
            </p>
          </div>
          <Link href="/books" className="kavita-light-button">
            Bookshelf
          </Link>
        </div>

        <ReadingSuggestionsCarousel suggestions={suggestions} />

        {books.length ? (
          <LibraryGrid books={books} />
        ) : (
          <section className="rounded bg-[#202124] p-8 text-center shadow ring-1 ring-white/10">
            <h2 className="text-xl font-semibold">No books saved yet</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-zinc-400">
              Use the three-dot menu on any book to add it here without moving or changing your source files.
            </p>
            <Link href="/" className="kavita-save-button mt-6 inline-flex">
              Browse library
            </Link>
          </section>
        )}
      </main>
    </AppShell>
  );
}
