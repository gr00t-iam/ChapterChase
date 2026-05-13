import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  await requireAdmin();
  const body = (await request.json()) as { ids?: unknown };
  const ids = Array.isArray(body.ids) ? body.ids.filter((id): id is string => typeof id === "string" && id.length > 0) : [];

  if (!ids.length) {
    return Response.json({ error: "No books selected." }, { status: 400 });
  }

  await prisma.book.deleteMany({ where: { id: { in: ids } } });
  return Response.json({
    ok: true,
    message: "This only removed entries from your library; your files remain safe.",
  });
}
