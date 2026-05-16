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
      const text = await response.text().catch(() => "(unable to read error body)");
      throw new Error(`Google Books API returned ${response.status}: ${text}`);
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
  if (!trimmed) return undefined;
  return decodeHtmlEntities(trimmed);
}

function decodeHtmlEntities(text: string): string {
  const map: { [key: string]: string } = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&#8216;": "'", // left single quote
    "&#8217;": "'", // right single quote / apostrophe
    "&#8220;": '"', // left double quote
    "&#8221;": '"', // right double quote
    "&ndash;": "–",
    "&mdash;": "—",
    "&hellip;": "…",
  };

  let result = text;
  for (const [entity, char] of Object.entries(map)) {
    result = result.split(entity).join(char);
  }

  // Also handle numeric entities like &#123;
  result = result.replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(parseInt(dec, 10)));
  // And hex entities like &#x1F;
  result = result.replace(/&#x([0-9a-f]+);/gi, (match, hex) => String.fromCharCode(parseInt(hex, 16)));

  return result;
}
