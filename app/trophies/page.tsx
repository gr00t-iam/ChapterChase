import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { TrophyRoom } from "@/components/TrophyRoom";
import { hasUsers, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function TrophiesPage() {
  if (!(await hasUsers())) {
    redirect("/setup");
  }

  const user = await requireUser();
  const since = new Date();
  since.setDate(since.getDate() - 6);
  since.setHours(0, 0, 0, 0);
  const sessions = await prisma.readingSession.findMany({
    where: { userId: user.id, createdAt: { gte: since } },
    select: { createdAt: true },
  });
  const streakDays = new Set(sessions.map((session) => session.createdAt.toISOString().slice(0, 10))).size;
  const longCompletedBooks = await prisma.book.count({
    where: {
      pageCount: { gte: 500 },
      progress: { some: { userId: user.id, percent: { gte: 1 } } },
    },
  });
  const trophies = [
    ...(streakDays >= 7
      ? [
          {
            id: "seven-day-streak",
            title: "Seven-Day Flame",
            description: "Read every day across a full 7-day window.",
            tone: "gold" as const,
          },
        ]
      : []),
    ...(longCompletedBooks > 0
      ? [
          {
            id: "long-book-finisher",
            title: "Long Haul Finisher",
            description: "Finished a book with 500 or more pages.",
            tone: "emerald" as const,
          },
        ]
      : []),
  ];

  return (
    <AppShell user={user}>
      <main className="px-5 py-6 pr-12">
        <div className="mb-5">
          <h1 className="text-2xl font-medium tracking-tight text-zinc-200">Trophy Room</h1>
          <p className="mt-1 text-sm text-zinc-400">Milestones, focus badges, and reading achievements.</p>
        </div>
        <TrophyRoom trophies={trophies} />
      </main>
    </AppShell>
  );
}
