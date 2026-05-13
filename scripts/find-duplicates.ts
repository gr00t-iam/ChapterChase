import { findDuplicateBookGroups } from "../lib/duplicates";
import { prisma } from "../lib/db";

const books = await prisma.book.findMany({
  select: {
    id: true,
    title: true,
    author: true,
    isbn: true,
    filePath: true,
  },
});

const groups = findDuplicateBookGroups(books);

if (!groups.length) {
  console.log("No duplicate books found.");
  process.exit(0);
}

for (const group of groups) {
  console.log(`\n${group.reason}: ${group.key}`);
  for (const book of group.books) {
    console.log(`- ${book.title} (${book.author ?? "Unknown"})`);
    console.log(`  id: ${book.id}`);
    console.log(`  file: ${book.filePath}`);
  }
}

await prisma.$disconnect();
