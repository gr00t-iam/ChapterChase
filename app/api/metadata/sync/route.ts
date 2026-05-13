import { requireAdmin } from "@/lib/auth";
import { downloadCoverImageWithDiagnostics } from "@/lib/covers";
import { prisma } from "@/lib/db";
import { fetchHardcoverMetadata } from "@/lib/hardcover";
import { finishMetadataActivity, startMetadataActivity, updateMetadataActivity } from "@/lib/scan-activity";

export const dynamic = "force-dynamic";

export async function POST() {
  await requireAdmin();
  if (!process.env.HARDCOVER_API_KEY?.trim()) {
    return Response.json({ error: "HARDCOVER_API_KEY is not configured." }, { status: 400 });
  }

  const books = await prisma.book.findMany({
    where: {
      status: { in: ["READY", "MISSING", "FAILED"] },
      OR: [{ description: null }, { description: "" }, { coverPath: null }, { coverPath: "" }],
    },
    orderBy: [{ sortTitle: "asc" }],
    select: { id: true, title: true, author: true, isbn: true, coverPath: true, metadataJson: true },
  });

  startMetadataActivity(books.length);

  if (!books.length) {
    finishMetadataActivity("No missing metadata found.");
    return Response.json({ updated: 0, total: 0 });
  }

  let updated = 0;
  let failed = 0;

  for (const [index, book] of books.entries()) {
    updateMetadataActivity(index, books.length, book.title);
    try {
      const metadata = await fetchHardcoverMetadata(book);
      if (metadata) {
        let coverPath: string | undefined;
        let coverError: string | undefined;
        if (!book.coverPath && metadata.coverUrl) {
          const cover = await downloadCoverImageWithDiagnostics(metadata.coverUrl, book.id);
          coverPath = cover.coverPath;
          coverError = cover.error;
        }

        await prisma.book.update({
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
        });
        updated += 1;
      }
    } catch {
      failed += 1;
    }

    updateMetadataActivity(index + 1, books.length, book.title);
    if (index < books.length - 1) {
      await sleep(1500);
    }
  }

  finishMetadataActivity(`Metadata sync complete: ${updated} updated, ${failed} failed.`);
  return Response.json({ updated, failed, total: books.length });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
