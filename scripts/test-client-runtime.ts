import assert from "node:assert/strict";
import { createClientId } from "../lib/client-id";
import {
  isLocalKokoroReady,
  localKokoroDtype,
  localKokoroModelId,
  localKokoroVoiceId,
  normalizeTtsEngine,
  shouldUseLocalKokoro,
  supportsLocalKokoroRuntime,
} from "../lib/local-kokoro-tts";
import { getServiceWorkerContainer } from "../lib/offline-client";
import { defaultTtsChunkMaxCharacters, splitTextIntoTtsChunks } from "../lib/tts-client";

const originalCryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");

Object.defineProperty(globalThis, "crypto", {
  configurable: true,
  value: {
    getRandomValues(bytes: Uint8Array) {
      for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = index + 1;
      }
      return bytes;
    },
  },
});

const generatedId = createClientId("reader-highlight");
assert.match(
  generatedId,
  /^reader-highlight-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  "createClientId should fall back to getRandomValues when crypto.randomUUID is unavailable"
);

Object.defineProperty(globalThis, "crypto", {
  configurable: true,
  value: {},
});

const fallbackId = createClientId("local-book");
assert.match(fallbackId, /^local-book-[a-z0-9]+-[a-z0-9]+-[a-z0-9]+$/);
assert.notEqual(fallbackId, createClientId("local-book"), "non-crypto fallback IDs should remain unique enough for client records");

if (originalCryptoDescriptor) {
  Object.defineProperty(globalThis, "crypto", originalCryptoDescriptor);
} else {
  delete (globalThis as { crypto?: Crypto }).crypto;
}

assert.equal(getServiceWorkerContainer(), null, "service worker helpers should no-op outside supported browser contexts");

const chunks = splitTextIntoTtsChunks("one two three four five six seven eight nine ten", 18);
let expectedWordOffset = 0;
for (const chunk of chunks) {
  assert.equal(chunk.wordOffset, expectedWordOffset, "TTS chunk offsets should keep word tracking aligned across generated audio chunks");
  expectedWordOffset += chunk.wordCount;
}
assert.equal(expectedWordOffset, 10, "TTS chunks should preserve the source word count");
assert.ok(
  splitTextIntoTtsChunks("word ".repeat(80)).every((chunk) => chunk.text.length <= defaultTtsChunkMaxCharacters),
  "default TTS chunks should stay short enough for quick first audio generation"
);

assert.equal(normalizeTtsEngine("local"), "local", "local TTS engine preference should be accepted");
assert.equal(normalizeTtsEngine("server"), "server", "server TTS engine preference should be accepted");
assert.equal(normalizeTtsEngine("invalid"), "auto", "unknown TTS engine preferences should fall back to auto");
assert.equal(shouldUseLocalKokoro("local", { status: "not-installed" }), true, "explicit local mode should attempt on-device TTS");
assert.equal(shouldUseLocalKokoro("server", { status: "ready" }), false, "server mode should bypass on-device TTS");
assert.equal(
  shouldUseLocalKokoro("auto", { status: "ready", modelId: localKokoroModelId, voice: localKokoroVoiceId, dtype: localKokoroDtype }),
  true,
  "auto mode should use on-device TTS after the Kokoro model is installed"
);
assert.equal(shouldUseLocalKokoro("auto", { status: "not-installed" }), false, "auto mode should use server TTS until local Kokoro is ready");
assert.equal(
  isLocalKokoroReady({ status: "ready", modelId: localKokoroModelId, voice: localKokoroVoiceId, dtype: localKokoroDtype }),
  true,
  "the local Kokoro install marker should require the expected model, voice, and dtype"
);
assert.equal(
  isLocalKokoroReady({ status: "ready", modelId: localKokoroModelId, voice: "af_heart", dtype: localKokoroDtype }),
  false,
  "a stale local Kokoro install marker for another voice should not be treated as ready"
);

const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    fetch() {
      return undefined;
    },
  },
});
assert.equal(supportsLocalKokoroRuntime(), false, "on-device Kokoro should require browser Worker support to keep the reader responsive");
if (originalWindowDescriptor) {
  Object.defineProperty(globalThis, "window", originalWindowDescriptor);
} else {
  delete (globalThis as { window?: Window }).window;
}
