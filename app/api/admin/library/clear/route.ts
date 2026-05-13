import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST() {
  await requireAdmin();
  await prisma.book.deleteMany({});
  return Response.json({
    ok: true,
    message: "This only removed entries from your library; your files remain safe.",
  });
}
