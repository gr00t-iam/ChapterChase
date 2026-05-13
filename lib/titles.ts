import path from "node:path";

const knownCompoundWords = [
  "a",
  "an",
  "the",
  "of",
  "and",
  "or",
  "in",
  "on",
  "for",
  "to",
  "with",
  "from",
  "by",
  "bug",
  "bugs",
  "hunter",
  "hunters",
  "diary",
  "book",
  "guide",
  "cookbook",
  "handbook",
  "manual",
  "secrets",
  "secret",
  "best",
  "job",
  "hunting",
  "programming",
  "python",
  "javascript",
  "typescript",
  "react",
  "next",
  "node",
  "data",
  "science",
  "machine",
  "learning",
  "deep",
  "artificial",
  "intelligence",
  "android",
  "angular",
  "swift",
  "large",
  "scale",
  "systems",
  "design",
  "patterns",
  "network",
  "protocols",
  "algorithms",
  "architecture",
  "enterprise",
  "applications",
  "development",
  "developer",
  "developers",
  "code",
  "coding",
  "learn",
  "beginner",
  "beginners",
  "advanced",
  "complete",
  "practical",
  "principles",
  "expressions",
  "regular",
  "challenge",
  "challenges",
  "managers",
  "smart",
  "face",
];

const smallWords = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "from", "in", "nor", "of", "on", "or", "the", "to", "with"]);
const knownWords = new Set(knownCompoundWords);

export function titleFromFilePath(filePath: string) {
  return cleanTitleString(path.basename(filePath, path.extname(filePath)));
}

export function cleanTitleString(value: string | null | undefined) {
  const cleaned = decodeBasicEntities(value ?? "")
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/\b(?:epub|pdf|mobi|azw3)\b/gi, " ")
    .replace(/\b(?:retail|ebook|scan|ocr|fixed|converted)\b/gi, " ")
    .replace(/\[[^\]]*]/g, " ")
    .replace(/\([^)]*(?:isbn|retail|ebook|scan|ocr)[^)]*\)/gi, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/[_.,;]+/g, " ")
    .replace(/\s+-\s+/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const segmented = shouldSegmentCompactTitle(cleaned) ? segmentCompactTitle(cleaned) ?? cleaned : cleaned;
  return titleCase(segmented || "Untitled Book");
}

export function sortTitle(title: string) {
  return cleanTitleString(title).replace(/^(the|a|an)\s+/i, "").toLowerCase();
}

export function looksLikeFilenameTitle(title: string | null | undefined, filePath: string) {
  if (!title) {
    return true;
  }

  const rawBase = path.basename(filePath, path.extname(filePath)).trim().toLowerCase();
  const cleanBase = titleFromFilePath(filePath).toLowerCase();
  const cleanTitle = cleanTitleString(title).toLowerCase();
  return cleanTitle === cleanBase || title.trim().toLowerCase() === rawBase || /[_-]/.test(title);
}

function shouldSegmentCompactTitle(value: string) {
  return /^[a-z]{10,}$/.test(value) && !/\s/.test(value);
}

function segmentCompactTitle(value: string) {
  const lower = value.toLowerCase();
  const memo = new Map<number, string[] | null>();

  function walk(index: number): string[] | null {
    if (index === lower.length) {
      return [];
    }
    if (memo.has(index)) {
      return memo.get(index) ?? null;
    }

    let best: string[] | null = null;
    for (let end = lower.length; end > index; end -= 1) {
      const word = lower.slice(index, end);
      if (!knownWords.has(word)) {
        continue;
      }
      const rest = walk(end);
      if (!rest) {
        continue;
      }
      const candidate = [word, ...rest];
      if (!best || candidate.join("").length > best.join("").length || candidate.length < best.length) {
        best = candidate;
      }
    }

    memo.set(index, best);
    return best;
  }

  const words = walk(0);
  return words && words.join("").length === lower.length ? words.join(" ") : null;
}

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index > 0 && smallWords.has(lower)) {
        return lower;
      }
      if (/^(?:isbn|pdf|epub|api|ux|ui|ai|ml|nlp|html|css|sql|ios|net)$/i.test(word)) {
        return word.toUpperCase().replace("NET", ".NET");
      }
      if (/^\d+$/.test(word)) {
        return word;
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function decodeBasicEntities(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}
