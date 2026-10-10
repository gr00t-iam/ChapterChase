# ChapterChase Offline PWA

## Install On iPhone / iPad

1. Open https://gr00t-iam.github.io/ChapterChase/ in Safari while connected to the internet.
2. Wait until the header says **Ready offline**.
3. Open Safari's Share menu, select **Add to Home Screen**, and choose **Open as Web App** if offered. Tap Add.
4. Launch ChapterChase from its new Home Screen icon. Wait for **Ready offline** there too: installed web apps can have separate browser storage.
5. Tap **Add Books**, then select EPUB/PDF files from Files. Wait until each imported book appears.
6. Open a book, turn a page, close it, then enable airplane mode and reopen ChapterChase. Verify the book opens at your saved position.

No Apple Developer membership, sideloading, VPN, ChapterChase account or NAS session is needed for local reading. An initial online HTTPS visit is necessary to install the app shell. Every device has its own library; importing in Safari does not guarantee the same files are available in the installed web app.

## Install On MacBook / Mac Mini

Open the same URL in Safari. On supported macOS versions choose File > Add to Dock. Launch the Dock app, wait for **Ready offline**, then import books there. A current Chromium browser also offers an Install app option. The existing native Mac DMGs remain available separately.

## Books And Storage

- EPUB and PDF files are copied into IndexedDB on the current device. Each import is limited to 200 MB. Original files are untouched.
- Embedded EPUB title/author/cover metadata is used. PDFs use their title/author properties and a first-page thumbnail. Missing titles fall back to a cleaned filename.
- A book's trash icon removes only the local browser copy. Its download icon exports the stored original file.
- **Keep on this device** requests persistent browser storage. The browser may refuse. Clearing site data, removing the web app or storage eviction can remove books and progress. Keep original-file backups.
- Existing desktop and native Apple libraries are not automatically migrated. Import the original files into the PWA.
- EPUB rendering in this preview is text-only; publisher layout and illustrations are not preserved. PDF text-to-speech requires an existing text layer; there is no OCR.

## Optional NAS Retrieval

In Settings save your HTTPS ChapterChase NAS address. **Open NAS Library** opens that server in a separate browser window. Sign in there, choose **Download Original File** from the book's three-dot menu, then import the resulting EPUB/PDF from Files/Finder into the PWA. Update your NAS server from this repository if that menu item is missing. **Download for Offline** is different: it saves inside the NAS web app's own browser storage, not the standalone PWA.

The PWA does not send NAS credentials to GitHub or call cross-origin NAS APIs. It does not make a private NAS reachable over the internet. Remote retrieval still needs your configured secure connection, possibly Tailscale; once imported, reading needs neither the NAS nor a VPN. Do not expose SMB shares publicly.

## Reading And Speech

StPageFlip supports swiping/page turns and single-page portrait/two-page landscape. Use Aa for font size and Paper/Night themes. The down arrow hides the controls; the up arrow brings them back.

**Start Reading** uses the device's default Web Speech voice. Pause resumes from the current short text chunk. Reading pauses when the app is backgrounded. Offline voice availability depends on your device; install a system voice and test in airplane mode. Browser automation verifies speech state logic, not actual audio on your physical device.

## Updates

An **Update available** button appears after a new app version is cached. Close the current book, then click the button to activate it. Updates replace only app-shell caches; the book database is retained. Do not clear site data to update.

## Static ZIP / Self-Hosting

The separate PWA release contains `ChapterChase-PWA-0.3.0-preview.zip`. Extract and host its contents on an HTTPS static web server. Opening the HTML directly from a file URL cannot install a service worker. Relative URLs support hosting under a subdirectory.

Build and test from the repository:

```sh
npm ci --ignore-scripts
npm run pwa:test-speech
npm run pwa:build
npx playwright install chromium webkit
npm run pwa:test
```

Only `pwa/dist/` is published. No server, API key, user book, database or environment file is included. The Offline PWA workflow runs browser gates before deploying GitHub Pages.

## Verification Scope

Automated tests cover EPUB/PDF metadata and rendering, page turns, font settings, malformed/duplicate imports, quota failure, non-destructive updates, offline browser restarts, saved progress and local deletion in Chromium/WebKit. Existing native reader regressions remain separate gates. Physical iPhone/iPad/Mac installation, touch gestures and real offline speech still require device testing.
