const namedEntities: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "\u2013",
  mdash: "\u2014",
  hellip: "\u2026",
  lsquo: "'",
  rsquo: "'",
  ldquo: '"',
  rdquo: '"',
};

const numericEntityOverrides: Record<number, string> = {
  160: " ",
  8216: "'",
  8217: "'",
  8220: '"',
  8221: '"',
};

export function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi, (entity, value: string) => {
    if (value.startsWith("#x") || value.startsWith("#X")) {
      return decodeNumericEntity(entity, value.slice(2), 16);
    }

    if (value.startsWith("#")) {
      return decodeNumericEntity(entity, value.slice(1), 10);
    }

    return namedEntities[value.toLowerCase()] ?? entity;
  });
}

function decodeNumericEntity(entity: string, rawValue: string, radix: 10 | 16) {
  const codePoint = Number.parseInt(rawValue, radix);
  if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
    return entity;
  }

  return numericEntityOverrides[codePoint] ?? String.fromCodePoint(codePoint);
}
