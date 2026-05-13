import { AppShell } from "@/components/AppShell";
import { DuplicateMaintenancePanel } from "@/components/DuplicateMaintenancePanel";
import { PreferencesRouteTabs } from "@/components/PreferencesRouteTabs";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { findDuplicateBookGroups } from "@/lib/duplicates";

export const dynamic = "force-dynamic";

export default async function PreferencesDuplicatesPage() {
  const user = await requireAdmin();
  const books = await prisma.book.findMany({
    orderBy: [{ sortTitle: "asc" }],
    select: {
      id: true,
      title: true,
      author: true,
      isbn: true,
      filePath: true,
    },
  });
  const duplicateGroups = findDuplicateBookGroups(books);

  return (
    <AppShell user={user}>
      <main className="settings-page px-5 py-6 pr-12">
        <div className="mb-5">
          <h1 className="text-2xl font-medium tracking-tight text-zinc-200">Preferences</h1>
          <p className="mt-1 text-sm text-zinc-400">Duplicate maintenance and library cleanup tools.</p>
          <PreferencesRouteTabs active="duplicates" />
        </div>
        <DuplicateMaintenancePanel groups={duplicateGroups} />
      </main>
    </AppShell>
  );
}
