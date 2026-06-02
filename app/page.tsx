import FlatLibraryGrid from "@/components/FlatLibraryGrid";
import { AppShell } from "@/components/AppShell";
import { hasUsers, isAdmin, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getLibraryBooks } from "@/lib/library-query";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Home({
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
  const [books, readyCount] = await Promise.all([
    getLibraryBooks({ query, userId: user.id }),
    prisma.book.count({ where: { status: "READY" } }),
    prisma.libraryFolder.count(),
  ]);

  return (
    <AppShell user={user}>
      <main className="flat-library-page px-5 py-6 pr-12">
        <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-medium tracking-tight text-zinc-200">Books</h1>
            <p className="mt-1 text-lg text-zinc-400">
              {query ? `${books.length} matches for "${query}"` : `${readyCount} Series`}
            </p>
          </div>
          {isAdmin(user.role) ? (
            <Link href="/preferences/library-folders" className="kavita-light-button">
              Edit Library
            </Link>
          ) : null}
        </div>

        <nav className="wood-panel-nav mb-6" aria-label="Library sections">
          <Link href="/" className="flat-section-panel active">
            <span>Home</span>
            <small>{readyCount} indexed books</small>
          </Link>
          {isAdmin(user.role) ? (
            <Link href="/books" className="flat-section-panel">
              <span>Books</span>
              <small>Open wooden shelf</small>
            </Link>
          ) : (
            <Link href="/books" className="flat-section-panel">
              <span>Books</span>
              <small>Open wooden shelf</small>
            </Link>
          )}
        </nav>

        <FlatLibraryGrid books={books} />
        <aside className="fixed bottom-4 right-4 top-20 hidden w-5 flex-col items-center justify-between text-xs text-zinc-500 xl:flex">
          {"#ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((letter) => (
            <span key={letter}>{letter}</span>
          ))}
        </aside>
      </main>
    </AppShell>
  );
}
