import { ReadingInsightsDashboard } from "@/components/ReadingInsightsDashboard";
import { AppShell } from "@/components/AppShell";
import { hasUsers, requireUser } from "@/lib/auth";
import { getReadingInsights } from "@/lib/reading-insights";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  if (!(await hasUsers())) {
    redirect("/setup");
  }

  const user = await requireUser();
  const insights = await getReadingInsights(user.id);

  return (
    <AppShell user={user}>
      <main className="px-5 py-6 pr-12">
        <div className="mb-5">
          <h1 className="text-2xl font-medium tracking-tight text-zinc-200">Reading Insights</h1>
          <p className="mt-1 text-sm text-zinc-400">Your recent reading rhythm, time, and speed.</p>
        </div>
        <ReadingInsightsDashboard initialInsights={insights} />
      </main>
    </AppShell>
  );
}
