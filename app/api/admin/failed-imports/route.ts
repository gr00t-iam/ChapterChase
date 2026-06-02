import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { appendServerLog } from "@/lib/server-logs";

export const dynamic = "force-dynamic";

export async function GET() {
  await requireAdmin();
  const failedImports = await prisma.book.findMany({
    where: { status: "FAILED" },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      filePath: true,
      error: true,
      updatedAt: true,
    },
  });

  await appendServerLog("INFO", "Admin loaded failed imports", { count: failedImports.length });
  return Response.json({ failedImports });
}

export async function POST() {
  await requireAdmin();
  const result = await prisma.book.deleteMany({ where: { status: "FAILED" } });
  await appendServerLog("WARN", "Admin reset failed imports", { deleted: result.count });
  return Response.json({ ok: true, deleted: result.count, failedImports: [] });
}
