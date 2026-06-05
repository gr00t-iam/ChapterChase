import assert from "node:assert/strict";
import {
  buildWordTimingMap,
  chunkFloat32Audio,
  createWordMap,
  resolveChunkWordRange,
  samplesToMilliseconds,
} from "../lib/piper-sync";

const wordMap = createWordMap("Hello, brave new world.");
assert.deepEqual(
  wordMap.map((entry) => ({ word: entry.word, index: entry.index, startChar: entry.startChar, endChar: entry.endChar })),
  [
    { word: "Hello,", index: 0, startChar: 0, endChar: 6 },
    { word: "brave", index: 1, startChar: 7, endChar: 12 },
    { word: "new", index: 2, startChar: 13, endChar: 16 },
    { word: "world.", index: 3, startChar: 17, endChar: 23 },
  ],
  "word map should preserve original character indices while skipping spaces"
);

const timings = buildWordTimingMap({
  text: "Hello, brave new world.",
  durationMs: 4000,
  punctuationPaddingMs: 150,
});
assert.equal(timings.length, 4, "timing map should include each word");
assert.equal(timings[0]?.word, "Hello,");
assert.equal(timings.at(-1)?.word, "world.");
assert.ok((timings[0]?.end ?? 0) > 700, "punctuation should add measurable weight to timed words");
assert.equal(timings.at(-1)?.end, 4000, "last word should end at total duration");

assert.equal(samplesToMilliseconds(22050, 22050), 1000, "sample counts should convert to milliseconds with the provided sample rate");

const chunks = chunkFloat32Audio(new Float32Array(5000), 2048);
assert.deepEqual(
  chunks.map((chunk) => ({ startSample: chunk.startSample, endSample: chunk.endSample, length: chunk.samples.length })),
  [
    { startSample: 0, endSample: 2048, length: 2048 },
    { startSample: 2048, endSample: 4096, length: 2048 },
    { startSample: 4096, endSample: 5000, length: 904 },
  ],
  "audio chunks should preserve sample boundaries for progressive playback"
);

const secondChunkWordRange = resolveChunkWordRange({
  chunkStartMs: 1200,
  chunkEndMs: 2600,
  timings,
});
assert.deepEqual(secondChunkWordRange, { startWordIndex: 0, endWordIndex: 2 }, "chunk word range should include words that overlap the chunk boundaries");
