import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const user = await requireUser();
  const recentSince = startOfDay(addDays(new Date(), -6));
  const yearSince = startOfDay(addDays(new Date(), -364));

  const sessions = await prisma.readingSession.findMany({
    where: { userId: user.id, createdAt: { gte: yearSince } },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true, durationSeconds: true, wordsRead: true, pagesRead: true },
  });

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
  const totalHours = totalSeconds / 3600;
  const averageWpm = totalSeconds > 0 ? Math.round(totalWords / (totalSeconds / 60)) : 0;
  const streakDays = Array.from(recentByDay.values()).filter((day) => day.seconds > 0).length;

  return Response.json({
    totalHours,
    averageWpm,
    streakDays,
    days: mapDayBuckets(recentByDay),
    heatmapDays: mapDayBuckets(yearByDay),
  });
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
