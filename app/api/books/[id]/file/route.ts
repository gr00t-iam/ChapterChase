import fs from "node:fs/promises";
import path from "node:path";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(_request: Request, { params }: RouteContext<"/api/books/[id]/file">) {
  await requireUser();
  const { id } = await params;
  const book = await prisma.book.findUnique({ where: { id }, select: { filePath: true, format: true } });

  if (!book || book.format !== "PDF") {
    notFound();
  }

  const data = await fs.readFile(/* turbopackIgnore: true */ book.filePath);
  const fileName = path.basename(book.filePath);
  return new Response(data, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${encodeURIComponent(fileName)}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
