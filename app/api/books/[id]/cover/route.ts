import fs from "node:fs/promises";
import path from "node:path";
import { notFound } from "next/navigation";
import { requireAdmin, requireUser } from "@/lib/auth";
import { downloadCoverImageWithDiagnostics, saveCoverBytes } from "@/lib/covers";
import { prisma } from "@/lib/db";

export async function GET(_request: Request, { params }: RouteContext<"/api/books/[id]/cover">) {
  await requireUser();
  const { id } = await params;
  const book = await prisma.book.findUnique({ where: { id }, select: { coverPath: true } });

  if (!book?.coverPath) {
    notFound();
  }

  const data = await fs.readFile(/* turbopackIgnore: true */ book.coverPath);
  return new Response(data, {
    headers: {
      "Content-Type": contentType(book.coverPath),
      "Cache-Control": "public, max-age=86400",
    },
  });
}

export async function POST(request: Request, { params }: RouteContext<"/api/books/[id]/cover">) {
  await requireAdmin();
  const { id } = await params;
  const contentTypeHeader = request.headers.get("content-type") ?? "";
  let coverPath: string | undefined;
  let error = "Unable to save cover image.";

  if (contentTypeHeader.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("file");
    if (file instanceof File && file.size > 0) {
      coverPath = await saveCoverBytes(id, Buffer.from(await file.arrayBuffer()), file.type || "image/jpeg");
    } else {
      error = "No image file was uploaded.";
    }
  } else {
    const body = (await request.json()) as { coverUrl?: string; aiPrompt?: string };
    const coverUrl = body.aiPrompt?.trim() ? pollinationsCoverUrl(body.aiPrompt) : normalizeCoverUrl(body.coverUrl?.trim());
    const result = await downloadCoverImageWithDiagnostics(coverUrl, id);
    coverPath = result.coverPath;
    error = result.error ?? error;
  }

  if (!coverPath) {
    return Response.json({ error }, { status: 400 });
  }

  const book = await prisma.book.update({
    where: { id },
    data: { coverPath },
    select: { id: true, coverPath: true },
  });

  return Response.json({ book });
}

function pollinationsCoverUrl(prompt: string) {
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=600&height=900`;
}

function normalizeCoverUrl(coverUrl: string | undefined) {
  if (!coverUrl) {
    return undefined;
  }

  try {
    const url = new URL(coverUrl);
    if (url.hostname === "pollinations.ai" && url.pathname.startsWith("/prompt/")) {
      url.hostname = "image.pollinations.ai";
    }
    return url.toString();
  } catch {
    return coverUrl;
  }
}

function contentType(filePath: string) {
  switch (path.extname(filePath).toLowerCase()) {
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    default:
      return "image/jpeg";
  }
}
