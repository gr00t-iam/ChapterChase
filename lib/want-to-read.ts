import { prisma } from "@/lib/db";
import { getLibraryBooks } from "@/lib/library-query";
import { getReadingSpeedWpmForEstimates } from "@/lib/reading-insights";
import { estimateBookWordCount, estimateRemainingMinutes, formatReadingTimeLabel, normalizeProgressPercent } from "@/lib/reading-estimates";

export type ReadingSuggestion = {
  id: string;
  title: string;
  author: string | null;
  coverPath: string | null;
  coverVersion: number;
  readingTimeLabel?: string;
};

export async function getWantToReadPageBooks({ query, userId }: { query?: string; userId: string }) {
  const [books, readingSpeedWpm] = await Promise.all([
    getLibraryBooks({ query, userId, wantToReadOnly: true }),
    getReadingSpeedWpmForEstimates(userId),
  ]);

  return attachReadingTimeLabels(books, readingSpeedWpm);
}

export async function getReadingSuggestions(userId: string) {
  const [readingSpeedWpm, candidates] = await Promise.all([
    getReadingSpeedWpmForEstimates(userId),
    prisma.book.findMany({
      where: {
        status: "READY",
        wantToRead: { none: { userId } },
        OR: [{ progress: { none: { userId } } }, { progress: { some: { userId, percent: { lte: 0 } } } }],
      },
      orderBy: { updatedAt: "desc" },
      take: 80,
      select: {
        id: true,
        title: true,
        author: true,
        coverPath: true,
        cachePath: true,
        updatedAt: true,
      },
    }),
  ]);

  const sample = shuffle(candidates).slice(0, 10);
  const counts = await Promise.all(sample.map((book) => estimateBookWordCount(book.cachePath)));

  return sample.map((book, index): ReadingSuggestion => {
    const wordCount = counts[index] ?? 0;
    const minutes = estimateRemainingMinutes(wordCount, 0, readingSpeedWpm);
    return {
      id: book.id,
      title: book.title,
      author: book.author,
      coverPath: book.coverPath,
      coverVersion: book.updatedAt.getTime(),
      readingTimeLabel: wordCount ? formatReadingTimeLabel(minutes) : undefined,
    };
  });
}

async function attachReadingTimeLabels<
  T extends {
    id: string;
    progress?: Array<{ percent: number }>;
  },
>(books: T[], readingSpeedWpm: number) {
  if (!books.length) {
    return books;
  }

  const cacheRows = await prisma.book.findMany({
    where: { id: { in: books.map((book) => book.id) } },
    select: { id: true, cachePath: true },
  });
  const wordCounts = new Map(
    await Promise.all(cacheRows.map(async (row) => [row.id, await estimateBookWordCount(row.cachePath)] as const))
  );

  return books.map((book) => {
    const wordCount = wordCounts.get(book.id) ?? 0;
    const progressPercent = normalizeProgressPercent(book.progress?.[0]?.percent ?? 0);
    const minutes = estimateRemainingMinutes(wordCount, progressPercent, readingSpeedWpm);
    return {
      ...book,
      readingTimeLabel: wordCount ? formatReadingTimeLabel(minutes) : undefined,
    };
  });
}

function shuffle<T>(items: T[]) {
  return items
    .map((item) => ({ item, sort: Math.random() }))
    .sort((first, second) => first.sort - second.sort)
    .map(({ item }) => item);
}
