import { AppShell } from "@/components/AppShell";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await requireAdmin();
  const [users, folders, books, failed] = await Promise.all([
    prisma.user.count(),
    prisma.libraryFolder.count(),
    prisma.book.count(),
    prisma.book.count({ where: { status: "FAILED" } }),
  ]);

  return (
    <AppShell user={user}>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <p className="text-sm font-medium uppercase tracking-[0.25em] text-sky-300">Admin</p>
        <h1 className="mt-2 text-3xl font-semibold">Server overview</h1>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Users" value={users} />
          <Metric label="Folders" value={folders} />
          <Metric label="Books" value={books} />
          <Metric label="Failed imports" value={failed} />
        </div>
      </main>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-white/10 bg-white/[0.03] p-5">
      <p className="text-sm text-zinc-400">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
    </div>
  );
}
