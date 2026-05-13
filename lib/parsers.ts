import fs from "node:fs/promises";
import path from "node:path";
import AdmZip from "adm-zip";
import { XMLParser } from "fast-xml-parser";
import { cacheDir, coversDir } from "@/lib/paths";
import { paginateText } from "@/lib/book-cache";
import type { EnrichedMetadata } from "@/lib/metadata";

export type ParsedBook = EnrichedMetadata & {
  coverPath?: string;
  cachePath?: string;
  pageCount?: number;
};

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
});

export async function parseBookFile(filePath: string, bookId: string) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".epub") {
    return parseEpub(filePath, bookId);
  }
  if (extension === ".pdf") {
    return parsePdf(filePath, bookId);
  }
  throw new Error(`Unsupported format: ${extension}`);
}

async function parseEpub(filePath: string, bookId: string): Promise<ParsedBook> {
  const zip = new AdmZip(filePath);
  const container = zip.readAsText("META-INF/container.xml");
  const containerXml = xmlParser.parse(container);
  const opfPath = containerXml?.container?.rootfiles?.rootfile?.["@_full-path"];

  if (!opfPath) {
    throw new Error("Could not find EPUB package document.");
  }

  const opf = zip.readAsText(opfPath);
  const opfXml = xmlParser.parse(opf);
  const pkg = opfXml.package;
  const metadata = pkg?.metadata ?? {};
  const manifestItems = asArray(pkg?.manifest?.item);
  const spineItems = asArray(pkg?.spine?.itemref);
  const opfDir = path.posix.dirname(opfPath);

  const identifiers = asArray(metadata["dc:identifier"]).map(readXmlValue).filter(isPresent);
  const isbn = identifiers.find((value) => /97[89][-\d ]{10,}/.test(value))?.replace(/[^\dX]/gi, "");
  const title = readXmlValue(metadata["dc:title"]);
  const author = asArray(metadata["dc:creator"]).map(readXmlValue).filter(isPresent).join(", ");
  const language = readXmlValue(metadata["dc:language"]);
  const publisher = readXmlValue(metadata["dc:publisher"]);
  const publishedDate = readXmlValue(metadata["dc:date"]);
  const description = readXmlValue(metadata["dc:description"]);
  const coverPath = await extractEpubCover(zip, manifestItems, metadata, opfDir, bookId);
  const pages = extractEpubPages(zip, manifestItems, spineItems, opfDir);
  const cachePath = path.join(cacheDir, `${bookId}.json`);

  await fs.mkdir(cacheDir, { recursive: true });
  await fs.writeFile(cachePath, JSON.stringify({ pages }, null, 2), "utf8");

  return {
    title,
    author: author || undefined,
    description,
    isbn,
    language,
    publisher,
    publishedDate,
    coverPath,
    cachePath,
    pageCount: pages.length,
  };
}

async function parsePdf(filePath: string, bookId: string): Promise<ParsedBook> {
  const { PDFParse } = await import("pdf-parse");
  const buffer = await fs.readFile(filePath);
  const parser = new PDFParse({ data: buffer });
  const [infoResult, textResult] = await Promise.all([parser.getInfo(), parser.getText()]);
  await parser.destroy();
  const info = infoResult.info as Record<string, string | undefined> | undefined;
  const title = info?.Title;
  const author = info?.Author;
  const pages = paginateText(textResult.text ?? "", 1600);
  const cachePath = path.join(cacheDir, `${bookId}.json`);

  await fs.mkdir(cacheDir, { recursive: true });
  await fs.writeFile(cachePath, JSON.stringify({ pages }, null, 2), "utf8");

  return {
    title,
    author,
    cachePath,
    pageCount: infoResult.total || pages.length,
  };
}

async function extractEpubCover(
  zip: AdmZip,
  manifestItems: Array<Record<string, string>>,
  metadata: Record<string, unknown>,
  opfDir: string,
  bookId: string
) {
  const metaItems = asArray(metadata.meta) as Array<Record<string, string>>;
  const coverId = metaItems.find((item) => item["@_name"] === "cover")?.["@_content"];
  const coverItem =
    manifestItems.find((item) => coverId && item["@_id"] === coverId) ??
    manifestItems.find((item) => String(item["@_properties"] ?? "").includes("cover-image")) ??
    manifestItems.find((item) => String(item["@_media-type"] ?? "").startsWith("image/"));

  if (!coverItem?.["@_href"]) {
    return undefined;
  }

  const entryPath = normalizeZipPath(opfDir, coverItem["@_href"]);
  const entry = zip.getEntry(entryPath);
  if (!entry) {
    return undefined;
  }

  const extension = path.extname(entryPath) || ".jpg";
  const coverPath = path.join(coversDir, `${bookId}${extension}`);
  await fs.mkdir(coversDir, { recursive: true });
  await fs.writeFile(coverPath, entry.getData());
  return coverPath;
}

function extractEpubPages(
  zip: AdmZip,
  manifestItems: Array<Record<string, string>>,
  spineItems: Array<Record<string, string>>,
  opfDir: string
) {
  const byId = new Map(manifestItems.map((item) => [item["@_id"], item]));
  const pages = [];

  for (const spineItem of spineItems) {
    const item = byId.get(spineItem["@_idref"]);
    if (!item?.["@_href"]) {
      continue;
    }

    const entry = zip.getEntry(normalizeZipPath(opfDir, item["@_href"]));
    if (!entry) {
      continue;
    }

    const html = entry.getData().toString("utf8");
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim();
    const text = htmlToText(html);
    for (const page of paginateText(text)) {
      pages.push({ title, text: page.text });
    }
  }

  return pages;
}

function htmlToText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<\/(p|div|h\d|li|section|article)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeZipPath(base: string, href: string) {
  return path.posix.normalize(path.posix.join(base === "." ? "" : base, decodeURIComponent(href)));
}

function readXmlValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value.trim() || undefined;
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (value && typeof value === "object" && "#text" in value) {
    return readXmlValue((value as Record<string, unknown>)["#text"]);
  }
  return undefined;
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function isPresent(value: string | undefined): value is string {
  return Boolean(value);
}
