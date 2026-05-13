import LibraryGrid from "@/components/LibraryGrid";
import { AppShell } from "@/components/AppShell";
import { hasUsers, isAdmin, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getLibraryBooks } from "@/lib/library-query";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LocalLibraryImporter } from "@/components/LocalLibraryImporter";

export const dynamic = "force-dynamic";

export default async function BookshelfPage({
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
  ]);

  return (
    <AppShell user={user}>
      <main className="px-5 py-6 pr-12">
        <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-medium tracking-tight text-zinc-200">Bookshelf</h1>
            <p className="mt-1 text-lg text-zinc-400">
              {query ? `${books.length} matches for "${query}"` : `${readyCount} books`}
            </p>
          </div>
          <div className="flex gap-3">
            <Link href="/" className="kavita-light-button">
              Home Grid
            </Link>
            {isAdmin(user.role) ? (
              <Link href="/preferences/library-folders" className="kavita-light-button">
                Edit Library
              </Link>
            ) : null}
          </div>
        </div>

        <LocalLibraryImporter />
        <LibraryGrid books={books} />
      </main>
    </AppShell>
  );
}
