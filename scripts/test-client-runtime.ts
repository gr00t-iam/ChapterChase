import assert from "node:assert/strict";
import { createClientId } from "../lib/client-id";
import { getServiceWorkerContainer } from "../lib/offline-client";

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
