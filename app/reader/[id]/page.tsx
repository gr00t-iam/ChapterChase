import { notFound } from "next/navigation";
import ChapterChaseReader from "@/components/ChapterChaseReader";
import { LocalBookReader } from "@/components/LocalBookReader";
import { requireUser } from "@/lib/auth";
import { readReaderCache } from "@/lib/book-cache";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ReaderPage({
  params,
  searchParams,
}: PageProps<"/reader/[id]"> & {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { page } = await searchParams;
  const requestedPage = parseInitialPage(page);

  if (id.startsWith("local-")) {
    return (
      <LocalBookReader
        bookId={id}
        initialTheme={user.readerTheme}
        initialPageOverride={requestedPage}
      />
    );
  }

  const book = await prisma.book.findUnique({
    where: { id },
    include: { progress: { where: { userId: user.id }, take: 1 } },
  });

  if (!book) {
    notFound();
  }

  const cache = await readReaderCache(book.cachePath);

  return (
    <ChapterChaseReader
      key={book.id}
      bookId={book.id}
      title={book.title}
      author={book.author}
      format={book.format}
      pages={cache.pages}
      initialPage={requestedPage ?? book.progress[0]?.pageIndex ?? 0}
      initialTheme={user.readerTheme}
      metadataJson={book.metadataJson}
    />
  );
}

function parseInitialPage(page: string | undefined) {
  if (!page) {
    return null;
  }

  const parsed = Number(page);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}
