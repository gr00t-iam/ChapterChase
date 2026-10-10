# Standalone Offline PWA Design

## Approved Direction

Create an offline-first ChapterChase PWA for macOS, iPadOS and iOS. Keep the Windows desktop and native Apple applications and releases available. Publish the completed PWA source and downloadable static build to GitHub, with a separate PWA release and installation instructions.

## Architecture

Build a separate static application under `pwa/`, rather than attempting to cache authenticated Next.js server pages. Bundle browser dependencies locally using the existing esbuild toolchain. Reuse the existing offline reader's PageFlip, EPUB parsing and PDF.js logic through a narrowly scoped browser integration, preserving the native bridge and native build tests.

Produce a self-contained `pwa/dist/` folder with relative paths, a scoped manifest and service worker, icons, app shell, reader assets and dependency licenses. It must work beneath the GitHub Pages repository path, not only at the domain root. Do not publish the Next.js server, API keys, databases or real books to Pages.

## Local Library

Store EPUB/PDF blobs, embedded title/author/cover metadata, last-opened time and reading progress in a separate IndexedDB database. Use Dexie, already a repository dependency. Existing desktop databases and existing web-local databases remain untouched.

Allow multi-file import from Files/Finder, library search and title sorting, continue-reading cards, book removal with confirmation, and a storage status indicator. Removing a local book deletes only the browser copy. Handle unsupported files, malformed books and quota errors without destroying existing records. Ask for persistent browser storage when supported, but never describe it as guaranteed permanent storage.

## Reader

Retain the realistic PageFlip animation, responsive single/two-page layout and locally rendered PDFs. Keep extracted PDF text hidden rather than showing text boxes below the pages. Load near-visible PDF images lazily and release distant renderings. EPUB initially retains the native preview's text-only limitation, explicitly documented.

Use device-default Web Speech synthesis with play/pause/stop, cancellation before speaking and the existing short mobile reliability delay. Split long speech into manageable chunks and invalidate stale speech callbacks on navigation or close. No server voice, network model or voice dropdown is required. Provide visible errors for PDFs without extractable text and devices without an available offline speech voice; do not promise that every installed system voice works offline.

Keep controls compact and collapsible. Store progress locally and restore after a full app restart, including after offline launch. Font size and paper/night themes are local preferences; repagination must preserve approximate reading position.

## Offline App Lifecycle

Precache the complete app shell and bundled reader dependencies. Display offline readiness only after successful service-worker installation and cache verification. A fresh browser/device still requires one online HTTPS visit before offline use.

Scope caches and navigation fallbacks to the PWA path. Do not cache NAS login responses or other origins. New versions install separately, with an explicit update action instead of reloading a reader mid-session. Never clear IndexedDB as part of an app-shell cache upgrade.

## NAS Retrieval Boundary

The standalone app never requires NAS access or ChapterChase login to launch. Provide an optional saved HTTPS NAS-library address and an Open NAS Library action. The user signs in on that server, downloads a source book, then imports the file into the standalone app.

This first version deliberately avoids direct cross-origin credentialed API calls from GitHub Pages: those require separately configured NAS CORS, cookie and authentication policies. Remote retrieval still requires a reachable NAS. No VPN-free remote NAS connection is claimed, and no SMB share is exposed publicly. Local Files imports work without a NAS account.

## Publication

Keep Windows and Apple release tags/assets unchanged. Add a PWA download entry to the repository README and a separate `PWA - ChapterChase Offline Preview` GitHub release containing a static ZIP. Add a Pages workflow for the static artifact. GitHub Pages must be enabled/configured in repository settings before claiming that an installation URL is live; verify the deployed URL rather than merely uploading an artifact.

## Acceptance Tests

1. Import EPUB and PDF fixtures; assert actual metadata and rendered pages.
2. Close and reopen the browser context with preserved storage, disable networking, and open both books from the local library.
3. Assert app-shell/assets and reader need no NAS/API calls, including under a repository subpath.
4. Verify page turns, portrait/landscape bounds, no between-page scrollbars or extracted-text boxes, and progress restoration.
5. Verify speech cancellation/auto-advance through a deterministic speech mock; separately document physical-device offline speech checks as pending.
6. Verify deletion, malformed imports, quota failure and update behavior preserve unrelated books.
7. Run Chromium and WebKit browser tests plus existing native reader/build regressions affected by shared changes.
8. Publish only after automated gates pass. Actual iPhone/iPad/macOS installation and airplane-mode checks remain user acceptance tests until those devices are available.

## Out Of Scope For This First Release

NAS administration, server metadata services, account synchronization, OCR, EPUB illustrations/full publisher layout, and native Apple signing. The existing self-hosted and native applications remain separate and available.
