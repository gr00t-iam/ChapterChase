import assert from "node:assert/strict";
import { createClientId } from "../lib/client-id";
import {
  getLocalKokoroModelProfile,
  isLocalKokoroReady,
  localKokoroCacheVersion,
  localKokoroDefaultProfileId,
  localKokoroDtype,
  localKokoroModelProfiles,
  localKokoroModelId,
  localKokoroVoiceId,
  normalizeTtsEngine,
  resolveLocalKokoroProfileId,
  shouldUseLocalKokoro,
  supportsLocalKokoroRuntime,
} from "../lib/local-kokoro-tts";
import { kokoroVoices } from "../lib/kokoro-voices";
import { getServiceWorkerContainer } from "../lib/offline-client";
import { normalizeSettingsSection, settingsSectionPath } from "../lib/settings-tabs";
import {
  defaultTtsChunkMaxCharacters,
  generatedSpeechWordTrackingEnabled,
  localTtsChunkMaxCharacters,
  selectTtsChunkMaxCharacters,
  splitTextIntoTtsChunks,
} from "../lib/tts-client";

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

assert.equal(normalizeSettingsSection("account"), "Account", "account section links should open the Account tab");
assert.equal(normalizeSettingsSection("reading-profiles"), "Reading Profiles", "hyphenated settings section links should resolve to their tab");
assert.equal(normalizeSettingsSection("unknown"), "Account", "unknown settings sections should fall back to Account");
assert.equal(settingsSectionPath("Account"), "/settings?section=account", "settings gear should link to the account section explicitly");
assert.equal(settingsSectionPath("Reading Profiles"), "/settings?section=reading-profiles", "settings section paths should be stable and readable");

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
assert.ok(localTtsChunkMaxCharacters > defaultTtsChunkMaxCharacters, "local TTS chunks should be longer to hide on-device generation latency");
assert.equal(selectTtsChunkMaxCharacters(false), defaultTtsChunkMaxCharacters, "server TTS should keep short startup chunks");
assert.equal(selectTtsChunkMaxCharacters(true), localTtsChunkMaxCharacters, "on-device TTS should use longer chunks to reduce between-sentence stalls");
assert.equal(generatedSpeechWordTrackingEnabled, false, "generated speech should not use estimated word highlighting until real alignment data exists");

assert.equal(normalizeTtsEngine("local"), "local", "local TTS engine preference should be accepted");
assert.equal(normalizeTtsEngine("server"), "server", "server TTS engine preference should be accepted");
assert.equal(normalizeTtsEngine("invalid"), "auto", "unknown TTS engine preferences should fall back to auto");
assert.equal(localKokoroDefaultProfileId, "balanced", "the smaller browser model should remain the default local speech download");
assert.equal(resolveLocalKokoroProfileId("full"), "full", "the full local speech model profile should be accepted");
assert.equal(resolveLocalKokoroProfileId("unexpected"), "balanced", "unknown local speech model profiles should fall back to balanced");
assert.equal(getLocalKokoroModelProfile("balanced").modelFile, "model_quantized.onnx", "balanced local speech should use the 95 MB quantized model");
assert.equal(getLocalKokoroModelProfile("full").modelFile, "model.onnx", "full local speech should use the full model file");
assert.equal(localKokoroModelProfiles.full.dtype, "fp32", "full local speech should request the fp32 ONNX model");
assert.equal(shouldUseLocalKokoro("local", { status: "not-installed" }), true, "explicit local mode should attempt on-device TTS");
assert.equal(shouldUseLocalKokoro("server", { status: "ready" }), false, "server mode should bypass on-device TTS");
assert.equal(
  shouldUseLocalKokoro("auto", { status: "ready", modelId: localKokoroModelId, voice: localKokoroVoiceId, dtype: localKokoroDtype, cacheVersion: localKokoroCacheVersion }),
  true,
  "auto mode should use on-device TTS after the Kokoro model is installed"
);
assert.equal(
  shouldUseLocalKokoro("auto", {
    status: "ready",
    modelId: localKokoroModelId,
    profileId: "full",
    voice: "af_bella",
    dtype: "fp32",
    modelFile: "model.onnx",
    cacheVersion: localKokoroCacheVersion,
  }),
  true,
  "auto mode should use on-device TTS after the full local speech model is installed"
);
assert.equal(shouldUseLocalKokoro("auto", { status: "not-installed" }), false, "auto mode should use server TTS until local Kokoro is ready");
assert.equal(
  isLocalKokoroReady({ status: "ready", modelId: localKokoroModelId, voice: localKokoroVoiceId, dtype: localKokoroDtype, cacheVersion: localKokoroCacheVersion }),
  true,
  "the local Kokoro install marker should require the expected model, dtype, and cache backend"
);
assert.equal(
  isLocalKokoroReady({ status: "ready", modelId: localKokoroModelId, voice: "af_heart", dtype: localKokoroDtype, cacheVersion: localKokoroCacheVersion }),
  true,
  "the local Kokoro install marker should track the model cache, not one selected voice"
);
assert.equal(
  isLocalKokoroReady({ status: "ready", modelId: localKokoroModelId, voice: localKokoroVoiceId, dtype: localKokoroDtype }),
  false,
  "legacy local Kokoro markers should not be treated as ready after the cache backend changes"
);
assert.equal(
  isLocalKokoroReady(
    {
      status: "ready",
      modelId: localKokoroModelId,
      profileId: "full",
      voice: "af_bella",
      dtype: "fp32",
      modelFile: "model.onnx",
      cacheVersion: localKokoroCacheVersion,
    },
    "full"
  ),
  true,
  "the full local speech install marker should be ready only when the full model profile is selected"
);
assert.equal(
  isLocalKokoroReady(
    {
      status: "ready",
      modelId: localKokoroModelId,
      profileId: "full",
      voice: "af_bella",
      dtype: "fp32",
      modelFile: "model.onnx",
      cacheVersion: localKokoroCacheVersion,
    },
    "balanced"
  ),
  false,
  "a full local speech install marker should not satisfy the balanced profile control"
);
assert.equal(kokoroVoices.find((voice) => voice.name === "af_bella")?.label, "Bella", "settings should display the friendly voice name only");
assert.equal(kokoroVoices.find((voice) => voice.name === "am_adam")?.label, "Adam", "settings should not expose Kokoro voice ids in labels");
assert.equal(kokoroVoices.find((voice) => voice.name === "af_heart")?.label, "Heart", "all visible voice options should map to a real browser voice file");
assert.equal(kokoroVoices.map((voice) => String(voice.name)).includes("af"), false, "settings should not expose the legacy aggregate voice id that cannot load in the browser");

const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalCachesDescriptor = Object.getOwnPropertyDescriptor(globalThis, "caches");
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    fetch() {
      return undefined;
    },
  },
});
assert.equal(supportsLocalKokoroRuntime(), false, "on-device Kokoro should require browser Worker support to keep the reader responsive");
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    Worker: function Worker() {},
    indexedDB: {},
    fetch() {
      return undefined;
    },
  },
});
delete (globalThis as { caches?: CacheStorage }).caches;
assert.equal(supportsLocalKokoroRuntime(), false, "on-device Kokoro should require Cache API storage for large model files");
if (originalWindowDescriptor) {
  Object.defineProperty(globalThis, "window", originalWindowDescriptor);
} else {
  delete (globalThis as { window?: Window }).window;
}
if (originalCachesDescriptor) {
  Object.defineProperty(globalThis, "caches", originalCachesDescriptor);
} else {
  delete (globalThis as { caches?: CacheStorage }).caches;
}
