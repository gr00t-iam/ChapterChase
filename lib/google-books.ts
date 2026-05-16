const googleBooksEndpoint = "https://www.googleapis.com/books/v1/volumes";

export type GoogleBooksMetadata = {
  title?: string;
  description?: string;
  publishedDate?: string;
  coverUrl?: string;
  source: "Google Books";
};

type GoogleBooksVolumeInfo = {
  title?: string;
  authors?: string[];
  description?: string;
  publishedDate?: string;
  imageLinks?: {
    extraLarge?: string;
    large?: string;
    medium?: string;
    small?: string;
    thumbnail?: string;
    smallThumbnail?: string;
  };
};

type GoogleBooksItem = {
  volumeInfo?: GoogleBooksVolumeInfo;
};

type GoogleBooksResponse = {
  totalItems?: number;
  items?: GoogleBooksItem[];
};

export async function fetchGoogleBooksMetadata(input: { isbn?: string | null; title?: string | null; author?: string | null }) {
  const apiKey = process.env.GOOGLE_BOOKS_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GOOGLE_BOOKS_API_KEY is not configured.");
  }

  const volumeInfo = await searchGoogleBooks(input, apiKey);
  if (!volumeInfo) {
    return null;
  }

  const coverUrl = pickBestCoverUrl(volumeInfo.imageLinks);

  return {
    title: cleanText(volumeInfo.title),
    description: cleanText(volumeInfo.description),
    publishedDate: cleanText(volumeInfo.publishedDate),
    coverUrl,
    source: "Google Books",
  } satisfies GoogleBooksMetadata;
}

async function searchGoogleBooks(
  input: { isbn?: string | null; title?: string | null; author?: string | null },
  apiKey: string,
): Promise<GoogleBooksVolumeInfo | null> {
  const isbn = normalizeIsbn(input.isbn);
  const title = input.title?.trim();
  const author = input.author?.trim();

  // Try strategies in priority order until we get a result
  const queries: string[] = [];
  if (isbn) {
    queries.push(`isbn:${isbn}`);
  }
  if (title && author) {
    queries.push(`intitle:${title}+inauthor:${author}`);
  }
  if (title) {
    queries.push(`intitle:${title}`);
  }

  if (!queries.length) {
    return null;
  }

  for (const q of queries) {
    const url = `${googleBooksEndpoint}?q=${encodeURIComponent(q)}&maxResults=1&key=${apiKey}`;
    const response = await fetch(url, {
      headers: { "User-Agent": "ChapterChase/0.1 metadata downloader" },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(`Google Books API returned ${response.status}.`);
    }

    const payload = (await response.json()) as GoogleBooksResponse;
    const volumeInfo = payload.items?.[0]?.volumeInfo;
    if (volumeInfo?.title) {
      return volumeInfo;
    }
  }

  return null;
}

function pickBestCoverUrl(imageLinks: GoogleBooksVolumeInfo["imageLinks"]): string | undefined {
  if (!imageLinks) return undefined;
  const url =
    imageLinks.extraLarge ??
    imageLinks.large ??
    imageLinks.medium ??
    imageLinks.small ??
    imageLinks.thumbnail ??
    imageLinks.smallThumbnail;
  // Google Books URLs use http; upgrade to https and strip curl param
  return url ? url.replace(/^http:/, "https:").replace(/&edge=curl/, "") : undefined;
}

function normalizeIsbn(isbn: string | null | undefined) {
  const normalized = isbn?.replace(/[^0-9X]/gi, "").trim();
  return normalized || "";
}

function cleanText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}
