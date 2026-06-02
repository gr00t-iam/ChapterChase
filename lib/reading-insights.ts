import { prisma } from "@/lib/db";
import {
  defaultReadingSpeedWpm,
  estimateBookWordCount,
  estimateRemainingMinutes,
  formatProjectionDuration,
  normalizeProgressPercent,
} from "@/lib/reading-estimates";

export type InsightDay = { date: string; seconds: number; words: number; pages: number };

export type LibraryProjection = {
  id: string;
  title: string;
  author: string | null;
  progressPercent: number;
  wordCount: number;
  remainingWords: number;
  remainingMinutes: number;
  remainingLabel: string;
};

export type ReadingInsights = {
  totalHours: number;
  averageWpm: number;
  readingSpeedWpm: number;
  days: InsightDay[];
  heatmapDays: InsightDay[];
  projections: LibraryProjection[];
};

export async function getReadingInsights(userId: string): Promise<ReadingInsights> {
  const recentSince = startOfDay(addDays(new Date(), -6));
  const yearSince = startOfDay(addDays(new Date(), -364));
  const [sessions, currentlyReadingBooks] = await Promise.all([
    prisma.readingSession.findMany({
      where: { userId, createdAt: { gte: yearSince } },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true, durationSeconds: true, wordsRead: true, pagesRead: true },
    }),
    prisma.book.findMany({
      where: {
        status: "READY",
        progress: {
          some: {
            userId,
            percent: { gt: 0, lt: 1 },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 8,
      select: {
        id: true,
        title: true,
        author: true,
        cachePath: true,
        progress: {
          where: { userId },
          select: { percent: true },
          take: 1,
        },
      },
    }),
  ]);

  const recentByDay = createDayBuckets(recentSince, 7);
  const yearByDay = createDayBuckets(yearSince, 365);

  for (const session of sessions) {
    const key = session.createdAt.toISOString().slice(0, 10);
    addSessionToBucket(recentByDay.get(key), session);
    addSessionToBucket(yearByDay.get(key), session);
  }

  const recentSessions = sessions.filter((session) => session.createdAt >= recentSince);
  const totalSeconds = recentSessions.reduce((sum, session) => sum + session.durationSeconds, 0);
  const totalWords = recentSessions.reduce((sum, session) => sum + session.wordsRead, 0);
  const averageWpm = totalSeconds > 0 ? Math.round(totalWords / (totalSeconds / 60)) : 0;
  const readingSpeedWpm = averageWpm || defaultReadingSpeedWpm;
  const projections = await Promise.all(
    currentlyReadingBooks.map(async (book) => {
      const wordCount = await estimateBookWordCount(book.cachePath);
      const progressPercent = normalizeProgressPercent(book.progress[0]?.percent ?? 0);
      const remainingMinutes = estimateRemainingMinutes(wordCount, progressPercent, readingSpeedWpm);
      const remainingWords = Math.max(0, Math.round(wordCount * (1 - progressPercent / 100)));
      return {
        id: book.id,
        title: book.title,
        author: book.author,
        progressPercent,
        wordCount,
        remainingWords,
        remainingMinutes,
        remainingLabel: wordCount ? formatProjectionDuration(remainingMinutes) : "No text cache",
      };
    })
  );

  return {
    totalHours: totalSeconds / 3600,
    averageWpm,
    readingSpeedWpm,
    days: mapDayBuckets(recentByDay),
    heatmapDays: mapDayBuckets(yearByDay),
    projections,
  };
}

export async function getReadingSpeedWpmForEstimates(userId: string) {
  const recentSince = startOfDay(addDays(new Date(), -6));
  const sessions = await prisma.readingSession.findMany({
    where: { userId, createdAt: { gte: recentSince } },
    select: { durationSeconds: true, wordsRead: true },
  });
  const totalSeconds = sessions.reduce((sum, session) => sum + session.durationSeconds, 0);
  const totalWords = sessions.reduce((sum, session) => sum + session.wordsRead, 0);
  return totalSeconds > 0 ? Math.round(totalWords / (totalSeconds / 60)) || defaultReadingSpeedWpm : defaultReadingSpeedWpm;
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function startOfDay(date: Date) {
  const nextDate = new Date(date);
  nextDate.setHours(0, 0, 0, 0);
  return nextDate;
}

function createDayBuckets(start: Date, count: number) {
  const byDay = new Map<string, { seconds: number; words: number; pages: number }>();

  for (let offset = 0; offset < count; offset += 1) {
    const day = addDays(start, offset);
    byDay.set(day.toISOString().slice(0, 10), { seconds: 0, words: 0, pages: 0 });
  }

  return byDay;
}

function addSessionToBucket(
  bucket: { seconds: number; words: number; pages: number } | undefined,
  session: { durationSeconds: number; wordsRead: number; pagesRead: number }
) {
  if (!bucket) {
    return;
  }

  bucket.seconds += session.durationSeconds;
  bucket.words += session.wordsRead;
  bucket.pages += session.pagesRead;
}

function mapDayBuckets(byDay: Map<string, { seconds: number; words: number; pages: number }>) {
  return Array.from(byDay.entries()).map(([date, stats]) => ({ date, ...stats }));
}
