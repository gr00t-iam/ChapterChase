import { requireAdmin } from "@/lib/auth";
import { downloadCoverImageWithDiagnostics } from "@/lib/covers";
import { prisma } from "@/lib/db";
import { fetchHardcoverMetadata } from "@/lib/hardcover";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  await requireAdmin();
  const body = (await request.json().catch(() => null)) as {
    bookId?: string;
    isbn?: string;
    title?: string;
    author?: string | null;
  } | null;

  if (!body) {
    return Response.json({ error: "Invalid metadata request." }, { status: 400 });
  }

  const book = body.bookId
    ? await prisma.book.findUnique({
        where: { id: body.bookId },
        select: { id: true, title: true, author: true, isbn: true, metadataJson: true },
      })
    : null;

  let metadata;
  try {
    metadata = await fetchHardcoverMetadata({
      isbn: body.isbn ?? book?.isbn,
      title: body.title ?? book?.title,
      author: body.author ?? book?.author,
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Hardcover metadata fetch failed." }, { status: 502 });
  }

  if (!metadata) {
    return Response.json({ error: "No Hardcover metadata match found." }, { status: 404 });
  }

  if (!book) {
    return Response.json({ metadata });
  }

  let coverPath: string | undefined;
  let coverError: string | undefined;
  if (metadata.coverUrl) {
    const cover = await downloadCoverImageWithDiagnostics(metadata.coverUrl, book.id);
    coverPath = cover.coverPath;
    coverError = cover.error;
  }

  const updatedBook = await prisma.book.update({
    where: { id: book.id },
    data: {
      ...(metadata.title ? { title: metadata.title, sortTitle: normalizeSortTitle(metadata.title) } : {}),
      ...(metadata.description ? { description: metadata.description } : {}),
      ...(metadata.publishedDate ? { publishedDate: metadata.publishedDate } : {}),
      ...(coverPath ? { coverPath } : {}),
      metadataJson: JSON.stringify({
        ...parseMetadataJson(book.metadataJson),
        hardcover: {
          title: metadata.title,
          description: metadata.description,
          releaseDate: metadata.publishedDate,
          coverUrl: metadata.coverUrl,
          fetchedAt: new Date().toISOString(),
          coverError,
        },
      }),
    },
    select: {
      id: true,
      title: true,
      author: true,
      description: true,
      coverPath: true,
      publishedDate: true,
    },
  });

  return Response.json({ metadata, book: updatedBook, coverError });
}

function normalizeSortTitle(title: string) {
  return title.trim().replace(/^(the|a|an)\s+/i, "");
}

function parseMetadataJson(value: string | null) {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
