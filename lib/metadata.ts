export type EnrichedMetadata = {
  title?: string;
  author?: string;
  description?: string;
  isbn?: string;
  language?: string;
  publisher?: string;
  publishedDate?: string;
  coverUrl?: string;
  source?: string;
};

const timeoutMs = 6000;

async function fetchJson<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "ChapterChase/0.1" },
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function enrichMetadata(input: EnrichedMetadata) {
  const byIsbn = input.isbn ? await fromOpenLibraryIsbn(input.isbn) : null;
  if (byIsbn) {
    return mergeMetadata(input, byIsbn);
  }

  const query = [input.title, input.author].filter(Boolean).join(" ");
  if (!query) {
    return input;
  }

  const google = await fromGoogleBooks(query);
  return google ? mergeMetadata(input, google) : input;
}

function mergeMetadata(primary: EnrichedMetadata, fallback: EnrichedMetadata) {
  return {
    ...fallback,
    ...Object.fromEntries(
      Object.entries(primary).filter(([, value]) => value !== undefined && value !== null && value !== "")
    ),
  } satisfies EnrichedMetadata;
}

async function fromOpenLibraryIsbn(isbn: string): Promise<EnrichedMetadata | null> {
  const data = await fetchJson<Record<string, unknown>>(
    `https://openlibrary.org/isbn/${encodeURIComponent(isbn)}.json`
  );
  if (!data) {
    return null;
  }

  return {
    title: typeof data.title === "string" ? data.title : undefined,
    description: typeof data.description === "string" ? data.description : undefined,
    isbn,
    publisher: Array.isArray(data.publishers) ? String(data.publishers[0] ?? "") : undefined,
    publishedDate: typeof data.publish_date === "string" ? data.publish_date : undefined,
    coverUrl: `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-L.jpg`,
    source: "Open Library",
  };
}

async function fromGoogleBooks(query: string): Promise<EnrichedMetadata | null> {
  type GoogleBook = {
    items?: Array<{
      volumeInfo?: {
        title?: string;
        authors?: string[];
        description?: string;
        industryIdentifiers?: Array<{ type: string; identifier: string }>;
        language?: string;
        publisher?: string;
        publishedDate?: string;
        imageLinks?: { thumbnail?: string; smallThumbnail?: string };
      };
    }>;
  };

  const data = await fetchJson<GoogleBook>(
    `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=1`
  );
  const info = data?.items?.[0]?.volumeInfo;
  if (!info) {
    return null;
  }

  return {
    title: info.title,
    author: info.authors?.join(", "),
    description: info.description,
    isbn: info.industryIdentifiers?.find((item) => item.type.includes("ISBN"))?.identifier,
    language: info.language,
    publisher: info.publisher,
    publishedDate: info.publishedDate,
    coverUrl: info.imageLinks?.thumbnail?.replace("http://", "https://") ?? info.imageLinks?.smallThumbnail,
    source: "Google Books",
  };
}
