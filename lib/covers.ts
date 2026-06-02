import fs from "node:fs/promises";
import path from "node:path";
import { coversDir } from "@/lib/paths";

const minCoverBytes = 1024;

export async function downloadCoverImage(coverUrl: string | undefined, bookId: string) {
  const result = await downloadCoverImageWithDiagnostics(coverUrl, bookId);
  return result.coverPath;
}

export async function downloadCoverImageWithDiagnostics(coverUrl: string | undefined, bookId: string) {
  if (!coverUrl) {
    return { error: "Missing cover URL." };
  }

  try {
    const response = await fetch(coverUrl, {
      headers: { "User-Agent": "ChapterChase/0.1" },
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      return { error: `Cover URL returned ${response.status}.` };
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) {
      return { error: `Cover URL returned ${contentType || "unknown content"} instead of an image.` };
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < minCoverBytes) {
      return { error: "Downloaded cover image was too small." };
    }

    const extension = extensionForContentType(contentType) ?? extensionFromUrl(coverUrl) ?? ".jpg";
    const coverPath = path.join(/* turbopackIgnore: true */ coversDir, `${bookId}-remote${extension}`);
    await fs.mkdir(/* turbopackIgnore: true */ coversDir, { recursive: true });
    await fs.writeFile(/* turbopackIgnore: true */ coverPath, bytes);
    return { coverPath };
  } catch {
    return { error: "Unable to download cover image." };
  }
}

export async function saveCoverBytes(bookId: string, bytes: Buffer, contentType: string) {
  const extension = extensionForContentType(contentType) ?? ".jpg";
  const coverPath = path.join(/* turbopackIgnore: true */ coversDir, `${bookId}-custom${extension}`);
  await fs.mkdir(/* turbopackIgnore: true */ coversDir, { recursive: true });
  await fs.writeFile(/* turbopackIgnore: true */ coverPath, bytes);
  return coverPath;
}

function extensionForContentType(contentType: string) {
  if (contentType.includes("png")) {
    return ".png";
  }
  if (contentType.includes("webp")) {
    return ".webp";
  }
  if (contentType.includes("gif")) {
    return ".gif";
  }
  if (contentType.includes("jpeg") || contentType.includes("jpg")) {
    return ".jpg";
  }
  return undefined;
}

function extensionFromUrl(url: string) {
  try {
    const extension = path.extname(new URL(url).pathname).toLowerCase();
    return [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(extension) ? extension : undefined;
  } catch {
    return undefined;
  }
}
