import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.isVerified) return Response.json({ error: "Sign in required." }, { status: 401 });
  const books = await prisma.book.findMany({
    where: { status: "READY" },
    orderBy: { sortTitle: "asc" },
    select: { id: true, title: true, author: true, format: true, progress: { where: { userId: user.id }, select: { percent: true, pageIndex: true }, take: 1 } },
  });
  return Response.json({ books: books.map(({ progress, ...book }) => ({ ...book, percent: progress[0]?.percent ?? 0, pageIndex: progress[0]?.pageIndex ?? 0 })) }, { headers: { "Cache-Control": "private, no-store" } });
}
