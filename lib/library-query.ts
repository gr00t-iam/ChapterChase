import { prisma } from "@/lib/db";

export async function getLibraryBooks({
  query,
  userId,
  wantToReadOnly = false,
  collectionId,
}: {
  query?: string;
  userId: string;
  wantToReadOnly?: boolean;
  collectionId?: string;
}) {
  return prisma.book.findMany({
    where: {
      status: { in: ["READY", "MISSING", "FAILED"] },
      ...(wantToReadOnly ? { wantToRead: { some: { userId } } } : {}),
      ...(collectionId ? { collectionBooks: { some: { userId, collectionId } } } : {}),
      ...(query
        ? {
            OR: [
              { title: { contains: query } },
              { author: { contains: query } },
              { description: { contains: query } },
              { isbn: { contains: query } },
            ],
          }
        : {}),
    },
    orderBy: [{ sortTitle: "asc" }],
    select: {
      id: true,
      title: true,
      author: true,
      description: true,
      coverPath: true,
      format: true,
      status: true,
      progress: {
        where: { userId },
        select: { percent: true, updatedAt: true },
        take: 1,
      },
      wantToRead: {
        where: { userId },
        select: { id: true },
        take: 1,
      },
      collectionBooks: {
        where: { userId },
        select: { id: true, collection: { select: { id: true, name: true } } },
      },
    },
  });
}
