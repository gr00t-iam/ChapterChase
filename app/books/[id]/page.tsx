import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { BookManagementPanel } from "@/components/BookManagementPanel";
import { isAdmin, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function BookPage({ params }: PageProps<"/books/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const book = await prisma.book.findUnique({
    where: { id },
    include: {
      libraryFolder: true,
      progress: { where: { userId: user.id }, take: 1 },
    },
  });

  if (!book) {
    notFound();
  }

  return (
    <AppShell user={user}>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="grid gap-8 md:grid-cols-[220px_1fr]">
          <div>
            <div className="aspect-[2/3] overflow-hidden rounded bg-zinc-900 ring-1 ring-white/10">
              {book.coverPath ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/books/${book.id}/cover`} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-end p-5 text-xl font-semibold">{book.title}</div>
              )}
            </div>
          </div>
          <section>
            <p className="text-sm font-medium uppercase tracking-[0.25em] text-sky-300">{book.format}</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight">{book.title}</h1>
            <p className="mt-2 text-lg text-zinc-300">{book.author ?? "Unknown author"}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href={`/reader/${book.id}`} className="primary-button">
                {book.progress[0] ? "Continue reading" : "Read"}
              </Link>
              <Link href="/" className="secondary-button">
                Back to library
              </Link>
            </div>
            <dl className="mt-8 grid gap-4 text-sm sm:grid-cols-2">
              <Info label="Status" value={book.status} />
              <Info label="Library" value={book.libraryFolder.name} />
              <Info label="Path" value={book.relativePath} />
              <Info label="Pages" value={book.pageCount?.toString() ?? "Unknown"} />
              <Info label="ISBN" value={book.isbn ?? "Unknown"} />
              <Info label="Published" value={book.publishedDate ?? "Unknown"} />
            </dl>
            {book.description ? <p className="mt-8 max-w-3xl text-sm leading-7 text-zinc-300">{book.description}</p> : null}
            {book.status !== "READY" ? (
              <p className="mt-8 rounded border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
                This book is {book.status.toLowerCase()}. {book.error ?? "Rescan the library after checking the source file."}
              </p>
            ) : null}
            {isAdmin(user.role) ? <BookManagementPanel book={book} /> : null}
          </section>
        </div>
      </main>
    </AppShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-white/10 bg-white/[0.03] p-4">
      <dt className="text-xs uppercase tracking-[0.18em] text-zinc-500">{label}</dt>
      <dd className="mt-2 break-words text-zinc-200">{value}</dd>
    </div>
  );
}
