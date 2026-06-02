import { readReaderCache } from "@/lib/book-cache";

export const defaultReadingSpeedWpm = 285;

export async function estimateBookWordCount(cachePath: string | null) {
  const cache = await readReaderCache(cachePath);
  return cache.pages.reduce((sum, page) => sum + countWords(page.text), 0);
}

export function estimateRemainingMinutes(totalWords: number, progressPercent: number, readingSpeedWpm = defaultReadingSpeedWpm) {
  const normalizedProgress = normalizeProgressPercent(progressPercent);
  const remainingWords = Math.max(0, Math.round(totalWords * (1 - normalizedProgress / 100)));
  const safeSpeed = readingSpeedWpm > 0 ? readingSpeedWpm : defaultReadingSpeedWpm;
  return Math.ceil(remainingWords / safeSpeed);
}

export function formatReadingTimeLabel(minutes: number) {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return "Done";
  }

  if (minutes < 60) {
    return `${minutes} min left`;
  }

  const hours = Math.max(1, Math.round(minutes / 60));
  return `${hours} hr${hours === 1 ? "" : "s"} left`;
}

export function formatProjectionDuration(minutes: number) {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return "Less than 1 hour";
  }

  const hours = minutes / 60;
  if (hours < 24) {
    const roundedHours = Math.max(1, Math.round(hours));
    return `${roundedHours} hour${roundedHours === 1 ? "" : "s"}`;
  }

  const days = Math.max(1, Math.round(hours / 24));
  return `${days} day${days === 1 ? "" : "s"}`;
}

export function normalizeProgressPercent(progressPercent: number) {
  const normalized = progressPercent <= 1 ? progressPercent * 100 : progressPercent;
  return Math.max(0, Math.min(100, normalized));
}

function countWords(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return 0;
  }
  return trimmed.split(/\s+/).filter(Boolean).length;
}
