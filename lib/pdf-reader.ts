export type PdfDocumentSource = {
  data: Uint8Array;
};

const initialPdfRenderPageCount = 1;

export async function createPdfDocumentSource(blob: Blob): Promise<PdfDocumentSource> {
  return { data: new Uint8Array(await blob.arrayBuffer()) };
}

export function getInitialPdfRenderEndPage(totalPages: number) {
  return Math.max(0, Math.min(totalPages, initialPdfRenderPageCount));
}
