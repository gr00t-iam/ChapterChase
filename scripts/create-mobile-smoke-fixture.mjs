import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
const directory = path.join(process.argv[2], "Documents", "Books");
await mkdir(directory, { recursive: true });
const text = "BT /F1 24 Tf 60 700 Td (ChapterChase offline reading) Tj 0 -45 Td (Page turns. Native speech. No clutter.) Tj ET";
const objects = [
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
];
let pdf = "%PDF-1.4\n";
const offsets = [];
objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
const xref = pdf.length;
pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.map(offset => String(offset).padStart(10, "0") + " 00000 n ").join("\n")}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
await writeFile(path.join(directory, "smoke.pdf"), pdf);
await writeFile(path.join(directory, "catalog.json"), JSON.stringify([{ id: "smoke", title: "Offline Reader Test", author: "ChapterChase", format: "pdf", fileName: "smoke.pdf", percent: 0, pageIndex: 0 }]));
