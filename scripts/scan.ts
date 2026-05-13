import { prisma } from "../lib/db";
import { scanLibraryFolder } from "../lib/scanner";

async function main() {
  const folders = await prisma.libraryFolder.findMany({ where: { enabled: true } });

  for (const folder of folders) {
    const result = await scanLibraryFolder(folder.id);
    console.log(`${folder.name}:`, result);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
