# ChapterChase Apple Preview

## What runs offline

The iPhone/iPad app has a native SwiftUI library, on-device EPUB/PDF files,
locally saved reading progress, StPageFlip page turns, and Apple's native
AVSpeechSynthesizer. Imported and downloaded books open without the NAS or
internet. EPUB support in this preview is text-only; embedded illustrations,
annotations, NAS progress synchronization and advanced web preferences are not
yet supported. PDF read-aloud requires extractable text (OCR is not included).
NAS sessions last only for the app session; passwords are never saved.

## Install on iPhone or iPad without a paid developer membership

Apple still requires device signing. GitHub's `ChapterChase-unsigned.ipa` is a
build artifact, not a directly installable or signed release. A Windows-only
installation workflow requires a third-party re-signing tool and an Apple ID;
this project does not collect Apple credentials or bypass signing.

The supported free-account route uses your Mac:

1. Install Xcode from the Mac App Store and launch it once.
2. Download and extract `ChapterChase-Xcode-project.zip` from the preview release.
3. Open `ios/ChapterChase.xcodeproj` in Xcode.
4. In Xcode Settings > Accounts, add your Apple ID.
5. Select the ChapterChase target > Signing & Capabilities. Enable automatic
   signing, select your Personal Team, and change the bundle identifier to a
   unique value if Xcode requests it.
6. Connect your iPhone/iPad to the Mac, trust the computer, and enable Developer
   Mode in device Settings > Privacy & Security when requested.
7. Select the device in Xcode and press Run. Trust the developer in device
   Settings > General > VPN & Device Management if requested.
8. Repeat for your other device. Free Personal Team provisioning expires after
   seven days, so rebuild/install again when the signing profile expires.

## Windows sideloading option

AltStore Classic can re-sign the unsigned IPA with your own free Apple ID.
Follow its current official Windows setup instructions:
https://faq.altstore.io/altstore-classic/how-to-install-altstore-windows

1. Install the Apple iTunes/iCloud components required by that guide and
   AltServer from https://altstore.io/. Do not use unofficial installers.
2. Connect and trust your iPhone/iPad, then install AltStore using AltServer.
3. Download `ChapterChase-unsigned.ipa` to the device's Files app.
4. In AltStore's My Apps tab, tap + and select the IPA to sign and install it.
5. Enable Developer Mode/trust if requested. Refresh the app through AltServer
   before its seven-day free-account signing expires.

This is a third-party installation option, not a tested ChapterChase installer.
Enter Apple credentials only into the signing tool you have chosen, never into
ChapterChase or GitHub. Re-signing still requires connectivity to Apple; an
expired signing profile can stop the app opening even though books are offline.

## Connect to NAS

Update the NAS server from the same repository so `/api/mobile/library` exists.
Use an HTTPS ChapterChase address (for example a Tailscale Serve address), not
the SMB `\\nas\Books` path. Enable Tailscale on both the NAS and Apple device.
Open Connect to NAS, sign in with your ChapterChase account, and download books.
Alternatively import EPUB/PDF from the Files app; no NAS login is needed.

## MacBook / Mac Mini

Download the ARM64 DMG for Apple Silicon or x64 DMG for Intel. The desktop app
stores its own local database and books; Library > Connect to NAS opens the
remote library, and Download current NAS book saves it locally. Add/scan the
local Books folder to index downloads. These preview DMGs are not notarized;
macOS may require approving the app under Privacy & Security. Do not disable
Gatekeeper system-wide. iOS and macOS builds are separate applications.

## Build from source

Run `npm ci` and `node scripts/build-mobile-reader.mjs`, install XcodeGen with
`brew install xcodegen`, then run `xcodegen generate --spec ios/project.yml`.
The Apple Preview GitHub workflow builds simulator and unsigned device apps
plus Intel/Apple Silicon desktop DMGs. Generated reader resources and Xcode
projects are bundled into the testing archive, not committed.

The workflow tests offline PDF rendering in WebKit with asynchronous stream
iteration disabled (matching older iOS), then opens a local PDF in the native
iPhone simulator. Simulator reader errors fail the build and are retained as
diagnostic artifacts.

## Device acceptance tests

Import EPUB and PDF; reopen after force-quit; rotate portrait/landscape; flip
pages; start/pause/stop speech; download from NAS; turn on airplane mode and
reopen a downloaded book; verify progress after restarting. Compilation and
automated runtime checks do not replace these physical-device checks.
