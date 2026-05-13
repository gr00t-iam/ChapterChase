import { randomBytes } from "node:crypto";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(request: Request, { params }: RouteContext<"/api/books/[id]/want-to-read">) {
  const user = await requireUser();
  const { id } = await params;
  const body = (await request.json()) as { wantToRead?: boolean };

  if (body.wantToRead) {
    await prisma.wantToRead.upsert({
      where: { userId_bookId: { userId: user.id, bookId: id } },
      create: { id: randomBytes(12).toString("hex"), userId: user.id, bookId: id },
      update: {},
    });
  } else {
    await prisma.wantToRead.deleteMany({ where: { userId: user.id, bookId: id } });
  }

  return Response.json({ ok: true, wantToRead: Boolean(body.wantToRead) });
}
