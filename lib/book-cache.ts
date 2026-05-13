import fs from "node:fs/promises";
import { paginateText, type ReaderPage } from "@/lib/pagination";

export type { ReaderPage };
export { paginateText };

export type ReaderCache = {
  pages: ReaderPage[];
};

export async function readReaderCache(cachePath: string | null) {
  if (!cachePath) {
    return { pages: [] } satisfies ReaderCache;
  }

  try {
    const raw = await fs.readFile(cachePath, "utf8");
    const parsed = JSON.parse(raw) as ReaderCache;
    return { pages: parsed.pages?.filter((page) => page.text.trim()) ?? [] };
  } catch {
    return { pages: [] } satisfies ReaderCache;
  }
}
