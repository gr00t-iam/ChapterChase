import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { hasUsers, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function GlobalAnnotationsPage({
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
  const annotations = await prisma.annotation.findMany({
    where: {
      userId: user.id,
      ...(query
        ? {
            OR: [{ quote: { contains: query } }, { note: { contains: query } }, { book: { title: { contains: query } } }],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, quote: true, note: true, color: true, locator: true, book: { select: { id: true, title: true, author: true } } },
  });

  return (
    <AppShell user={user}>
      <main className="px-5 py-6 pr-12">
        <div className="mb-5">
          <h1 className="text-2xl font-medium tracking-tight text-zinc-200">Global Annotations</h1>
          <p className="mt-1 text-sm text-zinc-400">Search every highlight and note across your library.</p>
        </div>
        <form action="/annotations" className="mb-5 flex max-w-xl gap-2">
          <input name="q" defaultValue={query} className="field" placeholder="Search highlights, notes, titles..." />
          <button className="kavita-save-button">Search</button>
        </form>
        <section className="annotation-results">
          {annotations.map((annotation) => (
            <article key={annotation.id} style={{ borderLeftColor: annotation.color }}>
              <p>{annotation.quote}</p>
              {annotation.note ? <small>{annotation.note}</small> : null}
              <Link href={`/reader/${annotation.book.id}${getAnnotationReaderQuery(annotation.locator)}`}>{annotation.book.title}</Link>
            </article>
          ))}
          {!annotations.length ? <p className="text-sm text-zinc-400">No annotations yet.</p> : null}
        </section>
      </main>
    </AppShell>
  );
}

function getAnnotationReaderQuery(locator: string | null) {
  if (!locator) {
    return "";
  }

  try {
    const parsed = JSON.parse(locator) as { pageIndex?: unknown };
    return typeof parsed.pageIndex === "number" && Number.isFinite(parsed.pageIndex) ? `?page=${Math.max(0, parsed.pageIndex)}` : "";
  } catch {
    return "";
  }
}
