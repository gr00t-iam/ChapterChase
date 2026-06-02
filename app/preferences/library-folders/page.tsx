import { AppShell } from "@/components/AppShell";
import { LibraryAutomationOptions } from "@/components/LibraryAutomationOptions";
import { LibraryFolderCard } from "@/components/LibraryFolderCard";
import { LocalLibraryImporter } from "@/components/LocalLibraryImporter";
import { MediaFolderEditor } from "@/components/MediaFolderEditor";
import { PreferencesRouteTabs } from "@/components/PreferencesRouteTabs";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function PreferencesLibraryFoldersPage() {
  const user = await requireAdmin();
  const [folders, books] = await Promise.all([
    prisma.libraryFolder.findMany({
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { books: true } } },
    }),
    prisma.book.findMany({
      where: { status: "READY" },
      orderBy: [{ sortTitle: "asc" }, { title: "asc" }],
      select: { id: true, title: true, author: true, coverPath: true, updatedAt: true },
    }),
  ]);

  return (
    <AppShell user={user}>
      <main className="settings-page px-5 py-6 pr-12">
        <div className="mb-5">
          <h1 className="text-2xl font-medium tracking-tight text-zinc-200">Preferences</h1>
          <p className="mt-1 text-sm text-zinc-400">Library folder configuration, scan tasks, and automation settings.</p>
          <PreferencesRouteTabs active="library-folders" />
        </div>
        <div className="library-source-stack">
          <section className="library-source-section" aria-labelledby="local-device-library">
            <div className="library-source-heading">
              <h2 id="local-device-library">Local device library</h2>
              <p>Files selected from this browser and stored only on the current device.</p>
            </div>
            <LocalLibraryImporter />
          </section>
          <section className="library-source-section" aria-labelledby="server-library-folders">
            <div className="library-source-heading">
              <h2 id="server-library-folders">Server library folders</h2>
              <p>Folders scanned by the ChapterChase server, container, or mounted network storage.</p>
            </div>
            <MediaFolderEditor
              books={books.map((book) => ({
                ...book,
                coverVersion: book.updatedAt.getTime(),
              }))}
            />
            <LibraryAutomationOptions />
            <div className="space-y-4">
              {folders.map((folder) => (
                <LibraryFolderCard key={folder.id} folder={folder} />
              ))}
            </div>
          </section>
        </div>
      </main>
    </AppShell>
  );
}
