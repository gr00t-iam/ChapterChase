import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const user = await requireUser();
  const collections = await prisma.collection.findMany({
    where: { userId: user.id },
    orderBy: { name: "asc" },
    select: { id: true, name: true, _count: { select: { books: true } } },
  });

  return Response.json({ collections });
}
