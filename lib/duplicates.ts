type DuplicateCandidate = {
  id: string;
  title: string;
  author: string | null;
  isbn: string | null;
  filePath: string;
};

export type DuplicateGroup = {
  key: string;
  reason: "ISBN" | "Title/Author";
  books: DuplicateCandidate[];
};

export function findDuplicateBookGroups(books: DuplicateCandidate[]): DuplicateGroup[] {
  const groups = new Map<string, DuplicateGroup>();

  for (const book of books) {
    const isbn = normalizeIsbn(book.isbn);
    if (isbn) {
      addToGroup(groups, `isbn:${isbn}`, "ISBN", book);
    }

    const titleAuthor = `${normalizeText(book.title)}|${normalizeText(book.author ?? "")}`;
    if (titleAuthor.replace("|", "")) {
      addToGroup(groups, `title-author:${titleAuthor}`, "Title/Author", book);
    }
  }

  return [...groups.values()]
    .filter((group) => group.books.length > 1)
    .sort((a, b) => b.books.length - a.books.length || a.key.localeCompare(b.key));
}

function addToGroup(groups: Map<string, DuplicateGroup>, key: string, reason: DuplicateGroup["reason"], book: DuplicateCandidate) {
  const group = groups.get(key) ?? { key, reason, books: [] };
  group.books.push(book);
  groups.set(key, group);
}

function normalizeIsbn(isbn: string | null) {
  return isbn?.replace(/[^0-9X]/gi, "").toUpperCase() ?? "";
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/^(the|a|an)\s+/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
