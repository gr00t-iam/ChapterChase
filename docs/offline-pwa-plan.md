# Offline PWA Implementation Plan

**Goal:** Deliver the approved standalone offline PWA without replacing desktop or native apps.
**Spec:** [Design](offline-pwa-design.md)
**Architecture:** Static esbuild output under `pwa/dist/`, a separate Dexie library, and an iframe integration for the existing offline mobile reader. Browser speech remains outside the native bridge.

## Tasks

- [x] Library and reader: write browser fixture tests first; implement imports, metadata, local progress, search, deletion and optional NAS link. Bundle no remote dependencies.
- [x] Offline lifecycle: test repository subpath, cache installation, restart without network and non-destructive updates; implement scoped worker and explicit update control.
- [x] Reliability: test malformed imports, quota errors, speech cancellation, sizing and persistence in Chromium/WebKit; verify existing native reader regressions.
- [x] Publication: add install docs, Pages workflow and separate ZIP release; verify the live HTTPS page and keep existing application releases unchanged.

## Interfaces

- `pwa/library.js`: isolated `ChapterChaseStandalone` Dexie database; `importBook`, `listBooks`, `saveProgress`, `deleteBook`, `exportBook`.
- `pwa/speech.js`: default-only browser speech controller with invalidation and chunking.
- `pwa/reader-entry.js`: same-origin, source-checked iframe command/message adapter. Existing native reader source remains compatible.
- `scripts/build-pwa.mjs`: deterministic static build and cache manifest; no environment files or user books copied.
- `scripts/test-pwa.mjs`: generated fixtures, local subpath server, real browser/offline integration and screenshots outside repository.
- `pwa/sw.js`: scope-only shell caching, readiness acknowledgments, waiting update activation on explicit request.

## Review Focus

IndexedDB quota failures; malformed ZIP/PDF; EPUB metadata injection; stale speech/progress callbacks; scoped updates that must never remove book data. NAS URLs are HTTPS only and cannot contain embedded credentials. Physical Apple device acceptance remains explicitly pending.

## Execution Record

Design approved by user; implementation and GitHub publication explicitly authorized. Work is isolated on `codex/offline-pwa`. User-owned `docs/superpowers/` remains untouched. Inline execution uses focused browser tests and a final source review.

Browser gates passed in Chromium and WebKit, including quota failure, explicit updates and cold offline restart. Speech uses a deterministic native-API stub. Native EPUB/PDF regressions passed at phone/desktop dimensions; lint, Next production build and download URL tests passed.

Ruling: keep progress in a separate IndexedDB table to avoid rewriting blob records on WebKit. PWA-only dependency aliases select patched PDF.js 6.4.299 and Sharp 0.35.5 without upgrading existing native/server PDF.js. Build traces reject older PDF.js in the PWA output. Configured environment credentials were checked against the generated static assets; none were included.

Ruling: add Download Original File to the NAS book menu because its existing Download for Offline action stores a browser copy rather than exporting to Files. Physical NAS retrieval remains a user acceptance check.

## Published Verification

- GitHub Actions run `38086016962` passed build, lint, download URL tests, speech tests, Chromium/WebKit browser gates and Pages deployment for `678efdc`.
- Live site: https://gr00t-iam.github.io/ChapterChase/ . A fresh Chromium profile imported an EPUB, flipped a page, closed completely, then reopened the deployed site offline and restored the saved page without browser errors.
- Release: https://github.com/gr00t-iam/ChapterChase/releases/tag/v0.3.0-pwa-preview . The CI-built static ZIP contains only the app shell, reader, textures, icons, manifest, worker and dependency licenses.
- Existing Windows and Apple release asset lists were checked and retained. Physical Apple installation, actual speech audio and live NAS retrieval are not claimed as verified.
