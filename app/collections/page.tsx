import Link from "next/link";
import LibraryGrid from "@/components/LibraryGrid";
import { AppShell } from "@/components/AppShell";
import { hasUsers, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getLibraryBooks } from "@/lib/library-query";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function CollectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; q?: string }>;
}) {
  if (!(await hasUsers())) {
    redirect("/setup");
  }

  const user = await requireUser();
  const { id, q } = await searchParams;
  const collections = await prisma.collection.findMany({
    where: { userId: user.id },
    orderBy: { name: "asc" },
    select: { id: true, name: true, _count: { select: { books: true } } },
  });
  const activeCollection = id ? collections.find((collection) => collection.id === id) : collections[0];
  const books = activeCollection
    ? await getLibraryBooks({ query: q?.trim(), userId: user.id, collectionId: activeCollection.id })
    : [];

  return (
    <AppShell user={user}>
      <main className="px-5 py-6 pr-12">
        <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-medium tracking-tight text-zinc-200">Collections</h1>
            <p className="mt-1 text-lg text-zinc-400">
              {activeCollection ? `${activeCollection.name} - ${books.length} books` : "No collections yet"}
            </p>
          </div>
          <Link href="/books" className="kavita-light-button">
            Bookshelf
          </Link>
        </div>

        {collections.length ? (
          <nav className="collection-filter-tabs mb-5" aria-label="Collections">
            {collections.map((collection) => (
              <Link
                key={collection.id}
                href={`/collections?id=${collection.id}`}
                className={collection.id === activeCollection?.id ? "active" : ""}
              >
                {collection.name}
                <span>{collection._count.books}</span>
              </Link>
            ))}
          </nav>
        ) : null}

        {books.length ? (
          <LibraryGrid books={books} />
        ) : (
          <section className="rounded bg-[#202124] p-8 text-center shadow ring-1 ring-white/10">
            <h2 className="text-xl font-semibold">No collection books yet</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-zinc-400">
              Use a book&apos;s three-dot menu and choose Add to Collection. ChapterChase stores only metadata and leaves files untouched.
            </p>
          </section>
        )}
      </main>
    </AppShell>
  );
}
