import { randomBytes } from "node:crypto";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  const user = await requireUser();
  const searchParams = new URL(request.url).searchParams;
  const query = searchParams.get("q")?.trim();
  const bookId = searchParams.get("bookId")?.trim();
  const annotations = await prisma.annotation.findMany({
    where: {
      userId: user.id,
      ...(bookId ? { bookId } : {}),
      ...(query
        ? {
            OR: [{ quote: { contains: query } }, { note: { contains: query } }, { book: { title: { contains: query } } }],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      quote: true,
      note: true,
      color: true,
      locator: true,
      createdAt: true,
      book: { select: { id: true, title: true, author: true } },
    },
  });

  return Response.json({ annotations });
}

export async function POST(request: Request) {
  const user = await requireUser();
  const body = (await request.json()) as { id?: string; bookId?: string; quote?: string; note?: string; color?: string; locator?: string };
  const quote = body.quote?.trim().slice(0, 2000);
  if (!body.bookId || !quote) {
    return Response.json({ error: "Book and quote are required." }, { status: 400 });
  }

  const annotation = await prisma.annotation.create({
    data: {
      id: body.id?.trim() || randomBytes(12).toString("hex"),
      userId: user.id,
      bookId: body.bookId,
      quote,
      note: body.note?.trim() || null,
      color: body.color ?? "#facc15",
      locator: body.locator ?? null,
    },
  });

  return Response.json({ annotation });
}

export async function DELETE(request: Request) {
  const user = await requireUser();
  const body = (await request.json().catch(() => ({}))) as {
    id?: string;
    ids?: string[];
    bookId?: string;
    quote?: string;
    color?: string;
    locator?: string;
    pageIndex?: number;
  };

  if (Array.isArray(body.ids) && body.ids.length > 0) {
    const result = await prisma.annotation.deleteMany({
      where: {
        userId: user.id,
        id: { in: body.ids.filter((id) => typeof id === "string" && id.trim()).map((id) => id.trim()) },
      },
    });
    if (typeof body.pageIndex !== "number") {
      return Response.json({ deleted: result.count });
    }
  }

  if (body.id) {
    const result = await prisma.annotation.deleteMany({
      where: { userId: user.id, id: body.id },
    });
    if (result.count > 0 || !body.bookId) {
      return Response.json({ deleted: result.count });
    }
  }

  if (!body.bookId) {
    return Response.json({ error: "Annotation id or book id is required." }, { status: 400 });
  }

  if (typeof body.pageIndex === "number") {
    const result = await prisma.annotation.deleteMany({
      where: {
        userId: user.id,
        bookId: body.bookId,
        locator: { contains: `"pageIndex":${body.pageIndex}` },
      },
    });
    return Response.json({ deleted: result.count });
  }

  if (!body.quote && !body.locator) {
    return Response.json({ error: "Highlight quote or locator is required." }, { status: 400 });
  }

  const result = await prisma.annotation.deleteMany({
    where: {
      userId: user.id,
      bookId: body.bookId,
      ...(body.quote ? { quote: body.quote } : {}),
      ...(body.color ? { color: body.color } : {}),
      ...(body.locator ? { locator: body.locator } : {}),
    },
  });

  return Response.json({ deleted: result.count });
}
