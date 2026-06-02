import { AppShell } from "@/components/AppShell";
import { AdminDashboard } from "@/components/AdminDashboard";
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
        <AdminDashboard initialCounts={{ users, folders, books, failedImports: failed }} />
      </main>
    </AppShell>
  );
}
