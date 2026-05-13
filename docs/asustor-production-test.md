# ChapterChase Asustor Production Test Setup

This guide runs ChapterChase directly on an Asustor NAS with Docker. The NAS book folder stays the source of truth; ChapterChase only stores its database, covers, and reader cache in a separate app data folder.

## What You Need

- An Asustor NAS model that supports Docker Engine.
- ADM access with permission to install apps from App Central.
- SSH enabled, or Portainer CE installed for a web UI deployment.
- A shared folder for books, for example `/share/Books`.
- A shared folder for app data, for example `/share/Docker/chapterchase/data`.

ASUSTOR documents Docker Engine as an App Central app and lists Docker Compose support in current Docker Engine packages. ASUSTOR also recommends Portainer as a GUI for managing Docker apps when you do not want to use command-line Docker.

## 1. Install Docker

1. Sign in to ADM.
2. Open **App Central**.
3. Install **Docker Engine**.
4. Optional but recommended: install **Portainer CE** from App Central so you can deploy the compose file as a stack.

## 2. Create NAS Folders

Create or confirm these folders in ADM **Access Control > Shared Folders** or with SSH:

```bash
mkdir -p /share/Books
mkdir -p /share/Docker/chapterchase/data
```

Put EPUB and PDF files somewhere under `/share/Books`. ChapterChase scans recursively and does not move or rename these files.

## 3. Get The App Onto The NAS

Use either Git over SSH or upload a release folder:

```bash
cd /share/Docker
git clone <your-chapterchase-repo-url> chapterchase-app
cd chapterchase-app
```

If you upload a ZIP instead, extract it to `/share/Docker/chapterchase-app`.

## 4. Configure Docker Compose

Edit `docker-compose.yml` so the volume mounts point at your real NAS folders:

```yaml
services:
  chapterchase:
    build: .
    container_name: chapterchase
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: "file:/data/chapterchase.db"
      CHAPTERCHASE_DATA_DIR: "/data"
      CHAPTERCHASE_LIBRARY_DIR: "/library"
      CHAPTERCHASE_MEDIA_ROOTS: "/library:/share:/mnt"
      CHAPTERCHASE_RESTRICT_MEDIA_ROOTS: "false"
      NODE_ENV: "production"
    volumes:
      - /share/Docker/chapterchase/data:/data
      - /share/Books:/library:ro
    restart: unless-stopped
```

The left side is the NAS path. The right side is the path ChapterChase sees inside the container. In the web UI, choose `/library` when adding the library.

Keep the book mount read-only while testing. If you later add features that intentionally write sidecar files, remove `:ro`.

## 5. Start With SSH

From the folder containing `docker-compose.yml`:

```bash
docker compose up --build -d
docker compose logs -f chapterchase
```

Open:

```text
http://<nas-ip>:3000
```

## 6. Start With Portainer

1. Open Portainer from ADM.
2. Go to **Stacks**.
3. Add a stack named `chapterchase`.
4. Paste the compose file from step 4.
5. Deploy the stack.
6. Open `http://<nas-ip>:3000`.

## 7. First Run

1. Create the first admin account.
2. Go to **Admin > Library Folders**.
3. Click **Browse for Media Folders**.
4. Select `/library`, or type another server-visible path if you mounted a different folder.
5. Save.
6. Click **Force Scan**.

After the scan, books should appear on the home grid with extracted or downloaded cover art. Opening a book should use `/reader/[id]`, not a 404.

## 8. Metadata And Covers

During scans, ChapterChase:

- Reads embedded EPUB/PDF metadata.
- Extracts embedded EPUB covers when present.
- Searches Open Library and Google Books for title, author, ISBN, description, publisher, language, and cover URLs.
- Downloads usable remote cover images into `/data/covers`.
- Keeps your original book files untouched.

If a book has weak embedded metadata, rename the file or folder with useful title/author text before scanning. Manual metadata editing can be added later as the highest-priority override.

## 9. LAN And iPad Testing

1. From a different computer or iPad on the same network, open `http://<nas-ip>:3000`.
2. Sign in.
3. Open a book.
4. Confirm page turns animate.
5. Press TTS play and confirm speech starts.
6. Advance a few pages, close the reader, reopen it, and confirm progress resumes.

For remote access or the best iPad PWA behavior, put ChapterChase behind HTTPS with a reverse proxy. Do not expose plain HTTP directly to the public internet.

## 10. Updating

```bash
cd /share/Docker/chapterchase-app
git pull
docker compose up --build -d
```

The `/data` folder persists across rebuilds. Back it up regularly because it contains `chapterchase.db`, downloaded covers, and parsed reader cache.
