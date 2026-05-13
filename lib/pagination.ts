export type ReaderPage = {
  title?: string;
  text: string;
};

export function paginateText(text: string, size = 1800) {
  const paragraphs = text
    .replace(/\r/g, "")
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  const pages: ReaderPage[] = [];
  let buffer = "";

  for (const paragraph of paragraphs.length ? paragraphs : [text]) {
    if (buffer && `${buffer}\n\n${paragraph}`.length > size) {
      pages.push({ text: buffer });
      buffer = paragraph;
    } else {
      buffer = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
    }
  }

  if (buffer) {
    pages.push({ text: buffer });
  }

  return pages.length ? pages : [{ text: "No readable text was extracted for this book." }];
}
