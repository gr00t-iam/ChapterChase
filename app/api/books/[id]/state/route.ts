import { randomBytes } from "node:crypto";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(request: Request, { params }: RouteContext<"/api/books/[id]/state">) {
  const user = await requireUser();
  const { id } = await params;
  const body = (await request.json()) as { action?: "mark-read" | "mark-unread" | "collection"; collectionName?: string };

  if (body.action === "mark-read") {
    await prisma.readingProgress.upsert({
      where: { userId_bookId: { userId: user.id, bookId: id } },
      create: { id: randomBytes(12).toString("hex"), userId: user.id, bookId: id, percent: 1, pageIndex: 0 },
      update: { percent: 1 },
    });
  }

  if (body.action === "mark-unread") {
    await prisma.readingProgress.upsert({
      where: { userId_bookId: { userId: user.id, bookId: id } },
      create: { id: randomBytes(12).toString("hex"), userId: user.id, bookId: id, percent: 0, pageIndex: 0 },
      update: { percent: 0, pageIndex: 0, locator: null },
    });
  }

  if (body.action === "collection") {
    const name = body.collectionName?.trim() || "Favorites";
    const collection = await prisma.collection.upsert({
      where: { userId_name: { userId: user.id, name } },
      create: { id: randomBytes(12).toString("hex"), userId: user.id, name },
      update: {},
    });

    await prisma.collectionBook.upsert({
      where: { collectionId_bookId: { collectionId: collection.id, bookId: id } },
      create: { id: randomBytes(12).toString("hex"), userId: user.id, collectionId: collection.id, bookId: id },
      update: {},
    });
  }

  return Response.json({ ok: true });
}
