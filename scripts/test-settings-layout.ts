import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

function assertCssRule(pattern: RegExp, message: string) {
  assert.match(css, pattern, message);
}

assertCssRule(
  /\.settings-grid\s*\{[\s\S]*?align-items:\s*start;/,
  "settings form grid should not stretch controls to match tall adjacent cards"
);
assertCssRule(
  /\.settings-field input,\s*\.settings-field select\s*\{[\s\S]*?height:\s*2\.7rem;[\s\S]*?align-self:\s*start;/,
  "settings inputs and selects should keep a fixed control height inside stretched grid rows"
);
assertCssRule(
  /\.settings-local-tts\s*\{[\s\S]*?grid-column:\s*1\s*\/\s*-1;/,
  "on-device speech card should occupy its own full-width settings row"
);
assertCssRule(
  /\.local-tts-card\s*\{[\s\S]*?grid-template-columns:\s*minmax\(18rem,\s*1fr\)\s+minmax\(12rem,\s*16rem\)\s+auto;/,
  "local speech card should reserve readable text, profile, and action columns on roomy screens"
);
assertCssRule(
  /@media\s*\(max-width:\s*1080px\)\s*\{[\s\S]*?\.local-tts-card\s*\{[\s\S]*?grid-template-columns:\s*1fr;/,
  "local speech card should collapse before tablet widths make the columns cramped"
);
assertCssRule(
  /@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.settings-danger-zone\s*\{[\s\S]*?grid-template-columns:\s*1fr;/,
  "settings danger zone should stack its text and button on phone widths"
);
