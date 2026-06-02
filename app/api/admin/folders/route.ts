import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { appendServerLog } from "@/lib/server-logs";

export const dynamic = "force-dynamic";

export async function GET() {
  await requireAdmin();
  const folders = await prisma.libraryFolder.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      rootPath: true,
      enabled: true,
      formats: true,
      scanIntervalMinutes: true,
      lastScanAt: true,
      updatedAt: true,
      _count: { select: { books: true } },
    },
  });

  await appendServerLog("INFO", "Admin loaded library folder paths", { count: folders.length });
  return Response.json({ folders });
}
