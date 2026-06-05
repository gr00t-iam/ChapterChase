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
  resolveLocalKokoroVoiceId,
  resolveLocalKokoroProfileId,
  shouldUseLocalKokoro,
  supportsLocalKokoroRuntime,
} from "../lib/local-kokoro-tts";
import { piperVoices } from "../lib/piper-voices";
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
assert.equal(localKokoroDtype, "low", "the balanced local Piper profile should remain the default");
assert.equal(getLocalKokoroModelProfile("balanced").femaleVoiceId, "en_US-lessac-low", "balanced local speech should use the smaller female Piper voice");
assert.equal(getLocalKokoroModelProfile("full").maleVoiceId, "en_US-ryan-high", "full local speech should use the higher-quality male Piper voice");
assert.equal(localKokoroModelProfiles.full.quality, "high", "full local speech should request the high-quality Piper voice");
assert.equal(resolveLocalKokoroVoiceId("1", "balanced"), "en_US-lessac-low", "non-male Piper voices should map to the female local Piper voice");
assert.equal(resolveLocalKokoroVoiceId("2", "full"), "en_US-ryan-high", "Ryan should map to the male local Piper voice");
assert.equal(shouldUseLocalKokoro("local", { status: "not-installed" }), true, "explicit local mode should attempt on-device TTS");
assert.equal(shouldUseLocalKokoro("server", { status: "ready" }), false, "server mode should bypass on-device TTS");
assert.equal(
  shouldUseLocalKokoro("auto", { status: "ready", modelId: localKokoroModelId, voiceId: localKokoroVoiceId, quality: localKokoroDtype, cacheVersion: localKokoroCacheVersion }),
  true,
  "auto mode should use on-device TTS after the Piper voice is installed"
);
assert.equal(
  shouldUseLocalKokoro("auto", {
    status: "ready",
    modelId: localKokoroModelId,
    profileId: "full",
    voiceId: "en_US-lessac-high",
    quality: "high",
    cacheVersion: localKokoroCacheVersion,
  }),
  true,
  "auto mode should use on-device TTS after the full local speech voice is installed"
);
assert.equal(shouldUseLocalKokoro("auto", { status: "not-installed" }), false, "auto mode should use server TTS until local Kokoro is ready");
assert.equal(
  isLocalKokoroReady({ status: "ready", modelId: localKokoroModelId, voiceId: localKokoroVoiceId, quality: localKokoroDtype, cacheVersion: localKokoroCacheVersion }),
  true,
  "the local Piper install marker should require the expected model, quality, and cache backend"
);
assert.equal(
  isLocalKokoroReady(
    { status: "ready", modelId: localKokoroModelId, profileId: "balanced", voiceId: "en_US-ryan-low", quality: localKokoroDtype, cacheVersion: localKokoroCacheVersion },
    "balanced",
    "am_adam"
  ),
  true,
  "the local Piper install marker should accept the matching mapped voice"
);
assert.equal(
  isLocalKokoroReady({ status: "ready", modelId: localKokoroModelId, voiceId: localKokoroVoiceId, quality: localKokoroDtype }),
  false,
  "legacy local Piper markers should not be treated as ready after the cache backend changes"
);
assert.equal(
  isLocalKokoroReady(
    {
      status: "ready",
      modelId: localKokoroModelId,
      profileId: "full",
      voiceId: "en_US-lessac-high",
      quality: "high",
      cacheVersion: localKokoroCacheVersion,
    },
    "full"
  ),
  true,
  "the full local speech install marker should be ready only when the full Piper profile is selected"
);
assert.equal(
  isLocalKokoroReady(
    {
      status: "ready",
      modelId: localKokoroModelId,
      profileId: "full",
      voiceId: "en_US-lessac-high",
      quality: "high",
      cacheVersion: localKokoroCacheVersion,
    },
    "balanced"
  ),
  false,
  "a full local speech install marker should not satisfy the balanced Piper profile control"
);
assert.equal(piperVoices.find((voice) => voice.id === 1)?.label, "Amy", "settings should display the friendly Piper voice label");
assert.equal(piperVoices.find((voice) => voice.id === 2)?.name, "en_US-ryan-medium", "settings should preserve the server Piper voice id for Ryan");
assert.equal(piperVoices.every((voice) => voice.name.startsWith("en_")), true, "visible speech voices should map to concrete Piper voice files");

const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
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
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: {
    hardwareConcurrency: 4,
    storage: {},
  },
});
assert.equal(supportsLocalKokoroRuntime(), false, "on-device Piper should require OPFS storage for large voice files");
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: {
    hardwareConcurrency: 4,
    storage: {
      getDirectory() {
        return Promise.resolve(null);
      },
    },
  },
});
assert.equal(supportsLocalKokoroRuntime(), true, "on-device Piper should accept browsers with Worker and OPFS support");
if (originalWindowDescriptor) {
  Object.defineProperty(globalThis, "window", originalWindowDescriptor);
} else {
  delete (globalThis as { window?: Window }).window;
}
if (originalNavigatorDescriptor) {
  Object.defineProperty(globalThis, "navigator", originalNavigatorDescriptor);
} else {
  delete (globalThis as { navigator?: Navigator }).navigator;
}
