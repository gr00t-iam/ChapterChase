# ChapterChase

ChapterChase is a self-hosted ebook library web app. It indexes EPUB and PDF files from mounted library folders, preserves your existing NAS folder layout, and serves a browser-based reader with page-turn animation and text-to-speech auto-advance.

## Current Features

- Multi-user web login with first-run admin setup.
- Admin-managed library folders.
- Manual library scans that detect new, changed, missing, and failed files.
- EPUB metadata, cover, and text extraction.
- PDF metadata and text extraction when the PDF contains readable text.
- Metadata enrichment from Open Library and Google Books.
- Per-user reading progress.
- Browser reader at `/reader/[id]` with page-turn animation and local Kokoro TTS through sherpa-onnx.
- Docker-first self-hosting with separate `/library` and `/data` mounts.

## Local Development

```bash
npm install
copy .env.example .env
npm run db:generate
npm run db:push
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), create the first admin account, then add a library folder from **Admin > Library Folders**.

For local testing, set `CHAPTERCHASE_LIBRARY_DIR` or enter a full path such as:

- Windows: `C:\Users\you\Books`
- NAS mounted on Windows: `Z:\Books`
- Linux/macOS: `/mnt/books`

ChapterChase does not move or rename your books. It stores only database records, extracted covers, and parsed text cache under `CHAPTERCHASE_DATA_DIR`.

## Text To Speech

ChapterChase uses the native Node sherpa-onnx package with `kokoro-en-v0_19`. The default voice is speaker ID `5` (`am_adam`), and each user can change the voice in **Settings > Preferences > Speech voice**.

The model runs on the ChapterChase server. Windows PCs, Macs, iPhones, Android phones, and tablets only receive normal WAV audio from the server, so client devices do not need sherpa-onnx or the model files installed.

Download the model files outside git and place the extracted folder at:

```text
data/tts/kokoro-en-v0_19
```

Or run:

```bash
npm run tts:download
```

For Docker, place it under the `/data` volume at:

```text
/data/tts/kokoro-en-v0_19
```

The folder must contain `model.onnx`, `voices.bin`, `tokens.txt`, and `espeak-ng-data`. You can override the location with:

```env
CHAPTERCHASE_TTS_MODEL_DIR="/absolute/path/to/kokoro-en-v0_19"
```

## Docker

```bash
docker compose up --build
```

Edit `docker-compose.yml` so the left side of the `/library` volume points at your mounted NAS share:

```yaml
volumes:
  - chapterchase-data:/data
  - /mnt/books:/library:ro
```

Windows example after mounting a NAS share:

```yaml
volumes:
  - chapterchase-data:/data
  - C:/Mounted/Books:/library:ro
```

Then click **Browse for Media Folders** and select `/library` inside ChapterChase.

## Media Folder Browser

ChapterChase works like Kavita: the folder browser shows paths visible to the running server/container. If the app is hosted on a NAS or Docker host, mount the NAS book share into the app first, then browse to that mounted path from the web UI.

Set `CHAPTERCHASE_MEDIA_ROOTS` to control the starting locations shown in the browser. Multiple roots use your OS path delimiter:

```env
CHAPTERCHASE_MEDIA_ROOTS="/library:/other-books"
```

On Windows development machines:

```env
CHAPTERCHASE_MEDIA_ROOTS="C:\Mounted\Books;D:\Ebooks"
```

Browsers cannot safely send arbitrary Windows Explorer paths to a remote NAS-hosted web app, so ChapterChase intentionally browses server-visible folders rather than client-only folders.

By default, admins can also type and browse any absolute server-visible path. Set `CHAPTERCHASE_RESTRICT_MEDIA_ROOTS=true` to lock browsing to only the roots listed in `CHAPTERCHASE_MEDIA_ROOTS`.

## Production Notes

- Keep `/library` read-only when possible.
- Back up the `/data` volume; it contains `chapterchase.db`, covers, and reader cache.
- Use a reverse proxy with HTTPS for remote access and better iPad PWA behavior.
- Run scans manually from the admin UI after adding books. Scheduled scan orchestration can be added with a host cron job running `npm run scan` or a container sidecar.

