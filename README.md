# ChapterChase

ChapterChase is an EPUB/PDF library and page-turn reader with self-hosted NAS access and offline desktop and Apple testing previews.

## Downloads

Choose your platform. These are testing previews, not production releases.

| Platform | Download | Notes |
| --- | --- | --- |
| Offline PWA: Mac / iPhone / iPad | [Open / Install PWA](https://gr00t-iam.github.io/ChapterChase/) | [Installation guide](docs/pwa-install.md); local books, no login required. |
| Windows x64 | [Windows installer (.exe)](https://github.com/gr00t-iam/ChapterChase/releases/download/v0.2.0-windows-preview/ChapterChase.Setup.0.2.0.exe) | Unsigned; Windows may show SmartScreen. |
| macOS Apple Silicon | [Mac ARM64 (.dmg)](https://github.com/gr00t-iam/ChapterChase/releases/download/v0.2.0-preview/ChapterChase-0.2.0-arm64.dmg) | Apple Silicon MacBook / Mac Mini; not notarized. |
| macOS Intel | [Mac Intel (.dmg)](https://github.com/gr00t-iam/ChapterChase/releases/download/v0.2.0-preview/ChapterChase-0.2.0.dmg) | Intel Macs; not notarized. |
| iPhone / iPad | [Apple installation guide](docs/apple-testing.md) | IPA requires signing; not directly installable. |

- [Windows release](https://github.com/gr00t-iam/ChapterChase/releases/tag/v0.2.0-windows-preview)
- [Apple release: macOS, iOS and iPadOS](https://github.com/gr00t-iam/ChapterChase/releases/tag/v0.2.0-preview)
- [Standalone PWA release](https://github.com/gr00t-iam/ChapterChase/releases/tag/v0.3.0-pwa-preview)

Windows and Apple installers are kept in separate releases. GitHub's automatically generated source archives are source code, not installers.

## Offline Use

Desktop applications keep a local database and local books. The native iPhone/iPad preview imports EPUB/PDF files and downloads books from a ChapterChase NAS server; downloaded books and local progress are available offline. See the [Apple guide](docs/apple-testing.md) for preview limitations and signing requirements.

The separate standalone PWA has a cached app shell, browser-local EPUB/PDF books and progress, and optional NAS-library links. It opens without login or server access after initial installation. See the [PWA guide](docs/pwa-install.md). Remote NAS downloads still require a reachable NAS; offline reading does not. The original NAS web app remains a separate server-dependent application.

## Self-Hosted Web App

ChapterChase indexes mounted EPUB/PDF folders, preserves file layouts, extracts metadata and covers, and provides per-user reading progress. It includes first-run administrator setup, multi-user login, scheduled scanning, metadata enrichment, and StPageFlip page turns.

## Local Development

```powershell
npm install
copy .env.example .env
npm run db:generate
npm run db:push
npm run dev
```

Open http://localhost:3000 and create the first administrator account. Manage folders through Preferences > Library Folders.

Example library paths: a local Windows Books folder, a mapped drive such as `X:\Books`, or `/mnt/books` on Linux/macOS.

## Docker / NAS

```sh
docker compose up --build
```

Edit your Compose library mount to use the actual host folder:

```yaml
volumes:
  - chapterchase-data:/data
  - /mnt/books:/library:ro
```

On the NAS, use its real filesystem path on the left and `/library` on the right. Select `/library` in ChapterChase, not a host path or client-only Windows drive.

The server folder browser lists only paths visible to the process/container. `CHAPTERCHASE_MEDIA_ROOTS` supplies starting roots (colon-separated on Linux, semicolon-separated on Windows). Set `CHAPTERCHASE_RESTRICT_MEDIA_ROOTS=true` to restrict browsing to configured roots.

## Deployment Safety

- Keep media mounts read-only where possible; ChapterChase does not rename or move indexed books.
- Back up `/data`, including the SQLite database, covers and cache.
- Keep credentials, books and runtime data out of GitHub.
- Use HTTPS for web installation and remote access. Do not expose SMB publicly.
- Server-generated speech needs its configured speech service/model. Native desktop/mobile speech uses the device speech engine.
- Build desktop packages on the target OS/architecture. The Apple Preview workflow produces Apple testing artifacts.

