const hardcoverEndpoint = "https://api.hardcover.app/v1/graphql";

export type HardcoverMetadata = {
  title?: string;
  description?: string;
  publishedDate?: string;
  coverUrl?: string;
  source: "Hardcover";
};

type HardcoverGraphQLResponse<T> = {
  data?: T;
  errors?: Array<{ message?: string }>;
};

type HardcoverBookResult = {
  title?: string | null;
  description?: string | null;
  release_date?: string | null;
  cached_image_url?: string | null;
};

const hardcoverSearchQuery = `
  query ChapterChaseHardcoverMetadata($title: String!, $author: String!, $isbn: String!) {
    books(
      where: {
        _or: [
          { isbns: { _contains: [$isbn] } }
          {
            _and: [
              { title: { _eq: $title } }
              { contributions: { author: { name: { _eq: $author } } } }
            ]
          }
          { title: { _eq: $title } }
        ]
      }
      order_by: { users_count: desc }
      limit: 1
    ) {
      title
      description
      release_date
      cached_image_url
    }
  }
`;

export async function fetchHardcoverMetadata(input: { isbn?: string | null; title?: string | null; author?: string | null }) {
  const variables = buildHardcoverVariables(input);
  if (!variables.title && !variables.isbn) {
    return null;
  }

  const token = process.env.HARDCOVER_API_KEY?.trim();
  if (!token) {
    throw new Error("HARDCOVER_API_KEY is not configured.");
  }

  const response = await fetch(hardcoverEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token.replace(/^Bearer\s+/i, "")}`,
      "User-Agent": "ChapterChase/0.1 metadata downloader",
    },
    body: JSON.stringify({
      query: hardcoverSearchQuery,
      variables,
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(`Hardcover returned ${response.status}.`);
  }

  const payload = (await response.json()) as HardcoverGraphQLResponse<{ books?: HardcoverBookResult[] }>;
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).filter(Boolean).join("; ") || "Hardcover metadata query failed.");
  }

  const book = payload.data?.books?.[0];
  if (!book) {
    return null;
  }

  return {
    title: cleanMetadataText(book.title),
    description: cleanMetadataText(book.description),
    publishedDate: cleanMetadataText(book.release_date),
    coverUrl: cleanMetadataText(book.cached_image_url),
    source: "Hardcover",
  } satisfies HardcoverMetadata;
}

function buildHardcoverVariables(input: { isbn?: string | null; title?: string | null; author?: string | null }) {
  return {
    title: input.title?.trim() ?? "",
    author: input.author?.trim() ?? "",
    isbn: normalizeIsbn(input.isbn),
  };
}

function normalizeIsbn(isbn: string | null | undefined) {
  const normalized = isbn?.replace(/[^0-9X]/gi, "").trim();
  return normalized || "";
}

function cleanMetadataText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}
