import { AppShell } from "@/components/AppShell";
import { LibraryAutomationOptions } from "@/components/LibraryAutomationOptions";
import { LibraryFolderCard } from "@/components/LibraryFolderCard";
import { MediaFolderEditor } from "@/components/MediaFolderEditor";
import { PreferencesRouteTabs } from "@/components/PreferencesRouteTabs";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function PreferencesLibraryFoldersPage() {
  const user = await requireAdmin();
  const folders = await prisma.libraryFolder.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { books: true } } },
  });

  return (
    <AppShell user={user}>
      <main className="settings-page px-5 py-6 pr-12">
        <div className="mb-5">
          <h1 className="text-2xl font-medium tracking-tight text-zinc-200">Preferences</h1>
          <p className="mt-1 text-sm text-zinc-400">Library folder configuration, scan tasks, and automation settings.</p>
          <PreferencesRouteTabs active="library-folders" />
        </div>
        <div className="mb-6">
          <MediaFolderEditor />
        </div>
        <div className="mb-6">
          <LibraryAutomationOptions />
        </div>
        <div className="space-y-4">
          {folders.map((folder) => (
            <LibraryFolderCard key={folder.id} folder={folder} />
          ))}
        </div>
      </main>
    </AppShell>
  );
}
