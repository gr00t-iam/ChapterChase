import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function PATCH(request: Request, { params }: RouteContext<"/api/books/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const body = (await request.json()) as {
    title?: string;
    author?: string | null;
    description?: string | null;
    publisher?: string | null;
    publishedDate?: string | null;
    isbn?: string | null;
    language?: string | null;
  };

  const title = body.title?.trim();
  if (!title) {
    return Response.json({ error: "Title is required." }, { status: 400 });
  }

  const book = await prisma.book.update({
    where: { id },
    data: {
      title,
      sortTitle: sortTitle(title),
      author: cleanNullable(body.author),
      description: cleanNullable(body.description),
      publisher: cleanNullable(body.publisher),
      publishedDate: cleanNullable(body.publishedDate),
      isbn: cleanNullable(body.isbn),
      language: cleanNullable(body.language),
    },
    select: {
      id: true,
      title: true,
      author: true,
      description: true,
      publisher: true,
      publishedDate: true,
      isbn: true,
      language: true,
      coverPath: true,
    },
  });

  return Response.json({ book });
}

export async function DELETE(_request: Request, { params }: RouteContext<"/api/books/[id]">) {
  await requireAdmin();
  const { id } = await params;
  await prisma.book.delete({ where: { id } });
  return Response.json({
    ok: true,
    message: "This will only remove the entry from your library; your files will remain safe.",
  });
}

function cleanNullable(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed || null;
}

function sortTitle(title: string) {
  return title.replace(/^(the|a|an)\s+/i, "").toLowerCase();
}
