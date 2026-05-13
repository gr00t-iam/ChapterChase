import { ReadingInsightsDashboard } from "@/components/ReadingInsightsDashboard";
import { AppShell } from "@/components/AppShell";
import { hasUsers, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  if (!(await hasUsers())) {
    redirect("/setup");
  }

  const user = await requireUser();
  const since = startOfDay(addDays(new Date(), -6));
  const yearSince = startOfDay(addDays(new Date(), -364));
  const sessions = await prisma.readingSession.findMany({
    where: { userId: user.id, createdAt: { gte: yearSince } },
    select: { createdAt: true, durationSeconds: true, wordsRead: true, pagesRead: true },
  });
  const days = Array.from({ length: 7 }, (_, offset) => {
    const day = new Date(since);
    day.setDate(since.getDate() + offset);
    const date = day.toISOString().slice(0, 10);
    const daySessions = sessions.filter((session) => session.createdAt.toISOString().slice(0, 10) === date);
    return {
      date,
      seconds: daySessions.reduce((sum, session) => sum + session.durationSeconds, 0),
      words: daySessions.reduce((sum, session) => sum + session.wordsRead, 0),
      pages: daySessions.reduce((sum, session) => sum + session.pagesRead, 0),
    };
  });
  const recentSessions = sessions.filter((session) => session.createdAt >= since);
  const heatmapDays = Array.from({ length: 365 }, (_, offset) => {
    const day = new Date(yearSince);
    day.setDate(yearSince.getDate() + offset);
    const date = day.toISOString().slice(0, 10);
    const daySessions = sessions.filter((session) => session.createdAt.toISOString().slice(0, 10) === date);
    return {
      date,
      seconds: daySessions.reduce((sum, session) => sum + session.durationSeconds, 0),
      words: daySessions.reduce((sum, session) => sum + session.wordsRead, 0),
      pages: daySessions.reduce((sum, session) => sum + session.pagesRead, 0),
    };
  });
  const totalSeconds = recentSessions.reduce((sum, session) => sum + session.durationSeconds, 0);
  const totalWords = recentSessions.reduce((sum, session) => sum + session.wordsRead, 0);

  return (
    <AppShell user={user}>
      <main className="px-5 py-6 pr-12">
        <div className="mb-5">
          <h1 className="text-2xl font-medium tracking-tight text-zinc-200">Reading Insights</h1>
          <p className="mt-1 text-sm text-zinc-400">Your recent reading rhythm, time, and speed.</p>
        </div>
        <ReadingInsightsDashboard
          initialInsights={{
            totalHours: totalSeconds / 3600,
            averageWpm: totalSeconds > 0 ? Math.round(totalWords / (totalSeconds / 60)) : 0,
            days,
            heatmapDays,
          }}
        />
      </main>
    </AppShell>
  );
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
