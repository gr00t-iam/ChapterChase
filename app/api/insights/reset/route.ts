import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST() {
  const user = await requireUser();

  await prisma.readingSession.deleteMany({ where: { userId: user.id } });

  return Response.json({ ok: true });
}
