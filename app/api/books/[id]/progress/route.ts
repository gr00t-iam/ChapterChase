import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(request: Request, { params }: RouteContext<"/api/books/[id]/progress">) {
  const user = await requireUser();
  const { id } = await params;
  const body = (await request.json()) as { pageIndex?: number; percent?: number; durationSeconds?: number; wordsRead?: number; pagesRead?: number };
  const pageIndex = Math.max(0, Math.trunc(body.pageIndex ?? 0));
  const percent = Math.max(0, Math.min(1, Number(body.percent ?? 0)));
  const durationSeconds = Math.max(0, Math.min(3600, Math.trunc(body.durationSeconds ?? 0)));
  const wordsRead = Math.max(0, Math.min(50000, Math.trunc(body.wordsRead ?? 0)));
  const pagesRead = Math.max(0, Math.min(5000, Math.trunc(body.pagesRead ?? 0)));

  await prisma.$transaction([
    prisma.readingProgress.upsert({
      where: { userId_bookId: { userId: user.id, bookId: id } },
      create: { userId: user.id, bookId: id, pageIndex, percent },
      update: { pageIndex, percent },
    }),
    ...(durationSeconds || wordsRead || pagesRead
      ? [
          prisma.readingSession.create({
            data: { userId: user.id, bookId: id, durationSeconds, wordsRead, pagesRead },
          }),
        ]
      : []),
  ]);

  return Response.json({ ok: true });
}
