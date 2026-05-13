"use server";

import fs from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function addLibraryFolderAction(formData: FormData) {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const rootPath = normalizeLibraryRootPath(String(formData.get("rootPath") ?? ""));
  const scanInterval = Number(formData.get("scanIntervalMinutes") ?? 0);

  if (!name || !rootPath) {
    throw new Error("Library name and root path are required.");
  }

  let stat;
  try {
    stat = await fs.stat(rootPath);
  } catch {
    throw new Error("Library path is not accessible from this ChapterChase server. Confirm the mapped drive or UNC share is connected, then try again.");
  }
  if (!stat.isDirectory()) {
    throw new Error("Library path must be a directory.");
  }

  await prisma.libraryFolder.upsert({
    where: { rootPath },
    create: {
      name,
      rootPath,
      scanIntervalMinutes: scanInterval > 0 ? scanInterval : null,
    },
    update: {
      name,
      enabled: true,
      scanIntervalMinutes: scanInterval > 0 ? scanInterval : null,
    },
  });

  revalidateLibraryManagementPaths();
  revalidatePath("/");
}

function normalizeLibraryRootPath(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  if (process.platform === "win32") {
    const driveRoot = /^([a-z]):?\\?$/i.exec(trimmed);
    if (driveRoot) {
      return `${driveRoot[1].toUpperCase()}:\\`;
    }
  }

  return path.normalize(trimmed);
}

export async function scanLibraryAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const { scanLibraryFolder } = await import("@/lib/scanner");
  await scanLibraryFolder(id);
  revalidateLibraryManagementPaths();
  revalidatePath("/");
}

export async function toggleLibraryFolderAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const enabled = String(formData.get("enabled") ?? "") === "true";

  await prisma.libraryFolder.update({
    where: { id },
    data: { enabled },
  });

  revalidateLibraryManagementPaths();
  revalidatePath("/");
  revalidatePath("/books");
}

export async function removeLibraryFolderAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");

  if (!id) {
    throw new Error("Library folder id is required.");
  }

  await prisma.libraryFolder.delete({ where: { id } });

  revalidateLibraryManagementPaths();
  revalidatePath("/");
  revalidatePath("/books");
}

function revalidateLibraryManagementPaths() {
  revalidatePath("/preferences/library-folders");
  revalidatePath("/admin/libraries");
}
