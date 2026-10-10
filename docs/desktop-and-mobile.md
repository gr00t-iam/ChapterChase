# Desktop and mobile migration

## Desktop preview

ChapterChase Desktop bundles the existing reader, a local Node server, and its own
SQLite database. The NAS does not need to be reachable to launch or read local
books. This is an Electron desktop application, with a web-rendered interface.

Build on each target OS and architecture using Node 22 or newer:

```sh
npm ci
npm run db:generate
npm --prefix desktop ci
npm run desktop:prepare
npm run desktop:start
npm run desktop:package
```

Installers appear in `desktop/dist`. Windows produces NSIS, macOS DMG, and Linux
AppImage. macOS signing/notarization and Windows signing are not yet configured.
These are preview builds, not verified releases for every platform.

1. Create your local account on the first launch. It is separate from your NAS account.
2. Use Library > Show local Books folder to find the permanent device folder.
3. In Preferences > Library Folders, add that folder and scan it.
4. To retrieve books, choose Library > Connect to NAS and enter the NAS app URL.
5. Sign in to the NAS window, open a book, and choose Library > Download current NAS book.
6. Save in the local Books folder and scan your local library again.
7. Disconnect from the network and reopen a downloaded book in the local window.

On Windows, the desktop reader uses the installed system voice directly, including
pause, resume, and stop. It does not require the Piper server for speech. The
toolbar starts compact; expand Controls to access the other reader tools.

Local data resides under the OS application-data directory, not the installer.
The downloaded book is a real file; reinstalling the application should not
delete it. Reading progress currently belongs to the local installation and
does not automatically synchronize back to the NAS. Online metadata and voices
that have not been downloaded may still need a connection.

## Diagnose NAS access

Before testing offline access, establish which connection fails:

1. On the NAS LAN, open `http://10.0.0.55:3000`.
2. If that fails, check the ChapterChase container is running, inspect its logs,
   and verify published TCP port 3000 and NAS firewall rules.
3. If LAN access works but remote access fails, connect both devices to Tailscale
   and test `http://NAS-TAILSCALE-IP:3000`. Check tailnet access rules for port 3000.
4. For browser offline functionality, use HTTPS. An HTTP LAN/Tailscale IP address
   is not a secure browser origin, so service-worker registration is unavailable.
5. On the NAS host running Tailscale, an HTTPS endpoint can be established with:

```sh
tailscale serve --bg http://127.0.0.1:3000
```

Use the HTTPS address printed by Tailscale. Run on the NAS host, not inside the
ChapterChase container. Existing Tailscale Serve configuration may require a
different route/port; inspect `tailscale serve status` before changing it.

## Native iPhone and iPad plan

Desktop Electron installers cannot run on iOS. Build a separate iOS client with
a bundled reader UI (for existing PageFlip behavior), native document storage,
and a connection/login flow against the NAS API. The reader must launch without
fetching the application shell from the NAS.

Required next work:

- Provide a versioned authenticated library catalog/download API for native clients.
- Store downloaded files, catalog, highlights, and progress in native local storage.
- Queue progress changes offline and reconcile them with the NAS on reconnect.
- Package the reader assets locally, including PDF.js workers and fonts.
- Build and test on macOS/Xcode, then distribute through TestFlight or App Store.

No iOS binary is included in the desktop preview. NAS connectivity, desktop
packaging on macOS/Linux, and iOS offline startup need device verification.
