import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { downloadCoverImage } from "@/lib/covers";
import { enrichMetadata } from "@/lib/metadata";
import { parseBookFile } from "@/lib/parsers";
import { finishScanActivity, startScanActivity, updateScanActivity } from "@/lib/scan-activity";
import { cleanTitleString, looksLikeFilenameTitle, sortTitle, titleFromFilePath } from "@/lib/titles";

type BookFormat = "EPUB" | "PDF";

const supportedExtensions = new Map<string, BookFormat>([
  [".epub", "EPUB"],
  [".pdf", "PDF"],
]);

export type ScanResult = {
  scanned: number;
  added: number;
  updated: number;
  missing: number;
  failed: number;
};

export async function scanLibraryFolder(libraryFolderId: string): Promise<ScanResult> {
  const folder = await prisma.libraryFolder.findUnique({ where: { id: libraryFolderId } });
  if (!folder || !folder.enabled) {
    throw new Error("Library folder is not enabled or does not exist.");
  }

  startScanActivity(folder.id, folder.name);
  const result: ScanResult = { scanned: 0, added: 0, updated: 0, missing: 0, failed: 0 };
  try {
    const allowed = new Set(folder.formats.split(",").map((format) => format.trim().toLowerCase()));
    const files = await findBookFiles(folder.rootPath, allowed);
    const seen = new Set(files.map((file) => file.fullPath));
    updateScanActivity(folder.id, {
      phase: "scanning",
      totalFiles: files.length,
      processedFiles: 0,
      message: files.length ? `Scanning: ${path.basename(files[0].fullPath)}` : "No EPUB or PDF files found.",
      currentFile: files[0]?.fullPath ? path.basename(files[0].fullPath) : null,
    });

    for (const file of files) {
      result.scanned += 1;
      updateScanActivity(folder.id, {
        phase: "scanning",
        currentFile: path.basename(file.fullPath),
        processedFiles: result.scanned,
        totalFiles: files.length,
        message: `Scanning: ${path.basename(file.fullPath)}`,
      });
      const existing = await prisma.book.findUnique({ where: { filePath: file.fullPath } });

      const shouldRefreshMetadata = !existing?.metadataJson || looksLikeFilenameTitle(existing.title, file.fullPath);
      if (
        existing &&
        !shouldRefreshMetadata &&
        existing.fileMtimeMs === String(file.mtimeMs) &&
        existing.fileSize === String(file.size) &&
        existing.status === "READY" &&
        existing.coverPath
      ) {
        await prisma.book.update({
          where: { id: existing.id },
          data: { lastSeenAt: new Date(), status: "READY" },
        });
        continue;
      }

      const book =
        existing ??
        (await prisma.book.create({
          data: {
            libraryFolderId: folder.id,
            title: titleFromFilePath(file.fullPath),
            sortTitle: sortTitle(titleFromFilePath(file.fullPath)),
            format: file.format,
            status: "IMPORTING",
            filePath: file.fullPath,
            relativePath: path.relative(folder.rootPath, file.fullPath),
            fileSize: String(file.size),
            fileMtimeMs: String(file.mtimeMs),
          },
        }));

      try {
        const parsed = await parseBookFile(file.fullPath, book.id);
        const parsedTitle = cleanTitleString(parsed.title ?? "");
        const fallbackTitle = titleFromFilePath(file.fullPath);
        const enriched = await enrichMetadata({
          title: parsedTitle || fallbackTitle,
          author: parsed.author ?? undefined,
          description: parsed.description ?? undefined,
          isbn: parsed.isbn ?? undefined,
          language: parsed.language ?? undefined,
          publisher: parsed.publisher ?? undefined,
          publishedDate: parsed.publishedDate ?? undefined,
        });
        const fileHash = await hashFile(file.fullPath);
        const title = cleanTitleString(enriched.title ?? parsedTitle ?? fallbackTitle);
        const coverPath = parsed.coverPath ?? (await downloadCoverImage(enriched.coverUrl, book.id)) ?? existing?.coverPath;

        await prisma.book.update({
          where: { id: book.id },
          data: {
            title,
            sortTitle: sortTitle(title),
            author: enriched.author ?? parsed.author,
            description: enriched.description ?? parsed.description,
            isbn: enriched.isbn ?? parsed.isbn,
            language: enriched.language ?? parsed.language,
            publisher: enriched.publisher ?? parsed.publisher,
            publishedDate: enriched.publishedDate ?? parsed.publishedDate,
            coverPath,
            cachePath: parsed.cachePath,
            pageCount: parsed.pageCount,
            metadataJson: JSON.stringify({ embedded: parsed, enriched }),
            status: "READY",
            error: null,
            fileHash,
            fileSize: String(file.size),
            fileMtimeMs: String(file.mtimeMs),
            relativePath: path.relative(folder.rootPath, file.fullPath),
            lastSeenAt: new Date(),
          },
        });

        if (existing) {
          result.updated += 1;
        } else {
          result.added += 1;
        }
      } catch (error) {
        result.failed += 1;
        await prisma.book.update({
          where: { id: book.id },
          data: {
            status: "FAILED",
            error: error instanceof Error ? error.message : "Import failed.",
            fileSize: String(file.size),
            fileMtimeMs: String(file.mtimeMs),
            lastSeenAt: new Date(),
          },
        });
      }
    }

    const knownBooks = await prisma.book.findMany({
      where: { libraryFolderId: folder.id },
      select: { id: true, filePath: true },
    });

    for (const book of knownBooks) {
      if (!seen.has(book.filePath)) {
        result.missing += 1;
        await prisma.book.update({
          where: { id: book.id },
          data: { status: "MISSING" },
        });
      }
    }

    await prisma.libraryFolder.update({
      where: { id: folder.id },
      data: { lastScanAt: new Date() },
    });

    finishScanActivity(
      folder.id,
      `Scan complete: ${result.added} added, ${result.updated} updated, ${result.failed} failed.`
    );
    return result;
  } catch (error) {
    finishScanActivity(folder.id, error instanceof Error ? error.message : "Scan failed.", true);
    throw error;
  }
}

async function findBookFiles(rootPath: string, allowedFormats: Set<string>) {
  const files: Array<{
    fullPath: string;
    size: number;
    mtimeMs: number;
    format: BookFormat;
  }> = [];

  async function walk(current: string) {
    const entries = await fs.readdir(/* turbopackIgnore: true */ current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(/* turbopackIgnore: true */ current, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }

      const extension = path.extname(entry.name).toLowerCase();
      const format = supportedExtensions.get(extension);
      if (!format || !allowedFormats.has(format.toLowerCase())) {
        continue;
      }

      const stat = await fs.stat(/* turbopackIgnore: true */ fullPath);
      files.push({ fullPath, size: stat.size, mtimeMs: Math.trunc(stat.mtimeMs), format });
    }
  }

  await walk(rootPath);
  return files;
}

async function hashFile(filePath: string) {
  const buffer = await fs.readFile(/* turbopackIgnore: true */ filePath);
  return createHash("sha256").update(buffer).digest("hex");
}
