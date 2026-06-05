import assert from "node:assert/strict";
import { decodeHtmlEntities } from "../lib/html-entities";
import { createPdfDocumentSource, getInitialPdfRenderEndPage } from "../lib/pdf-reader";

assert.equal(
  decodeHtmlEntities("You&apos;ll see &#39;straight&#39; and &#x2019;curly&#x2019; apostrophes."),
  "You'll see 'straight' and 'curly' apostrophes.",
  "reader EPUB text should decode common named, decimal, and hex apostrophe entities"
);

const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
const pdfSource = await createPdfDocumentSource(new Blob([pdfBytes], { type: "application/pdf" }));

assert.deepEqual(Object.keys(pdfSource), ["data"], "PDF.js should receive bytes directly instead of fetching a blob URL");
assert.ok(pdfSource.data instanceof Uint8Array, "PDF document source data should be a Uint8Array");
assert.deepEqual([...pdfSource.data], [...pdfBytes], "PDF document source should preserve the file bytes");

assert.equal(getInitialPdfRenderEndPage(490), 1, "large PDFs should render the first page before rendering the rest");
assert.equal(getInitialPdfRenderEndPage(1), 1, "single-page PDFs should still render their only page");
