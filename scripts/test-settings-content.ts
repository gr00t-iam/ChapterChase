import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const settingsForm = readFileSync(join(root, "components", "UserSettingsForm.tsx"), "utf8");
const localImporter = readFileSync(join(root, "components", "LocalLibraryImporter.tsx"), "utf8");
const mediaFolderEditor = readFileSync(join(root, "components", "MediaFolderEditor.tsx"), "utf8");
const homePage = readFileSync(join(root, "app", "page.tsx"), "utf8");
const bookshelfPage = readFileSync(join(root, "app", "books", "page.tsx"), "utf8");
const libraryFoldersPage = readFileSync(join(root, "app", "preferences", "library-folders", "page.tsx"), "utf8");
const css = readFileSync(join(root, "app", "globals.css"), "utf8");

assert.match(settingsForm, /reader-theme-preview/, "reading profiles should show a selected theme preview");
assert.doesNotMatch(settingsForm, /Add Night Profile|Add Scroll Profile|Add E-Ink Profile|Add Reseda Profile/, "reading profiles should not expose add-profile buttons");
assert.doesNotMatch(settingsForm, /updateProfile\(|deleteProfile\(|resetProfiles\(/, "reading profiles should not expose profile editing controls");
assert.doesNotMatch(settingsForm, /Blur Unread Summaries|Collapse Series Relationships/, "dead preference toggles should not be shown");
assert.doesNotMatch(settingsForm, /Share Profile|Share Series Reviews/, "social sharing toggles should be removed from settings");
assert.match(settingsForm, /Highlighted words/, "social settings should show highlighted words instead of sharing toggles");
assert.doesNotMatch(
  css,
  /\.profile-card\[data-reader-theme="scroll"\]\s*\{[\s\S]*?var\(--bg-texture\)/,
  "Ancient Scroll preview should use the scroll texture instead of the bookshelf texture"
);

assert.doesNotMatch(homePage, /LocalLibraryImporter/, "home page should not render the local source importer");
assert.doesNotMatch(bookshelfPage, /LocalLibraryImporter/, "bookshelf page should not render the local source importer");
assert.match(libraryFoldersPage, /LocalLibraryImporter/, "library folders preferences should render the local source importer");
assert.match(libraryFoldersPage, /Server library folders/, "library folders preferences should label server-managed folders");
assert.match(libraryFoldersPage, /Local device library/, "library folders preferences should label local-device imports");
assert.doesNotMatch(mediaFolderEditor, /Folder cover image settings are handled per book in v1/, "cover image tab should not show the old placeholder");
assert.match(mediaFolderEditor, /Choose a book/, "cover image tab should let the user choose the target book");
assert.match(mediaFolderEditor, /Upload custom cover image/, "cover image tab should let the user upload a custom cover");

assert.doesNotMatch(localImporter, /inputRef\.current\?\.click/, "local file picker should not rely on programmatic clicks");
assert.match(localImporter, /local-library-file-button/, "local file picker should expose a direct tappable file input");
assert.doesNotMatch(css, /\.local-library-importer input\s*\{[\s\S]*?display:\s*none;/, "local file input should not be display:none on mobile Safari");
