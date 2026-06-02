import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (...segments: string[]) => readFileSync(join(root, ...segments), "utf8");

const adminPage = read("app", "admin", "page.tsx");
const mediaFolderEditor = read("components", "MediaFolderEditor.tsx");
const readingInsights = read("components", "ReadingInsightsDashboard.tsx");
const insightsPage = read("app", "insights", "page.tsx");
const wantToReadPage = read("app", "want-to-read", "page.tsx");
const libraryGrid = read("components", "LibraryGrid.tsx");
const appFrame = read("components", "AppFrame.tsx");
const libraryBooksContext = read("components", "LibraryBooksContext.tsx");
const css = read("app", "globals.css");

assert.doesNotMatch(mediaFolderEditor, /"advanced"|Advanced scan settings|>\s*Advanced\s*</, "library folders should not show an empty Advanced tab");

assert.match(adminPage, /AdminDashboard/, "admin page should use the interactive admin dashboard");
assert.ok(existsSync(join(root, "components", "AdminDashboard.tsx")), "admin dashboard component should exist");
assert.ok(existsSync(join(root, "app", "api", "admin", "failed-imports", "route.ts")), "failed imports admin API should exist");
assert.ok(existsSync(join(root, "app", "api", "admin", "folders", "route.ts")), "folders admin API should exist");
assert.ok(existsSync(join(root, "app", "api", "admin", "system-health", "route.ts")), "system health admin API should exist");
assert.ok(existsSync(join(root, "app", "api", "admin", "system-logs", "route.ts")), "system logs admin API should exist");

const adminDashboard = existsSync(join(root, "components", "AdminDashboard.tsx")) ? read("components", "AdminDashboard.tsx") : "";
assert.match(adminDashboard, /Failed imports/, "admin dashboard should expose a Failed imports card");
assert.match(adminDashboard, /Reset Failed Imports/, "admin dashboard should expose stale failed-import reset");
assert.match(adminDashboard, /Live System Logs/, "admin dashboard should show live system logs");
assert.match(adminDashboard, /System Health Check/, "admin dashboard should show health checks");
assert.match(adminDashboard, /setInterval\(/, "admin dashboard should poll for new log lines");
assert.match(adminDashboard, /\/api\/admin\/folders/, "folders card should dynamically load folder paths");

assert.match(readingInsights, /Daily Goal/, "reading insights should include a Daily Goal card");
assert.match(readingInsights, /Library Projections/, "reading insights should include projections");
assert.match(readingInsights, /This Week/, "reading insights should include This Week range");
assert.match(readingInsights, /This Month/, "reading insights should include This Month range");
assert.match(readingInsights, /Yearly/, "reading insights should include Yearly range");
assert.match(readingInsights, /Current streak/, "reading insights should show current streak");
assert.match(readingInsights, /Longest streak/, "reading insights should show longest streak");
assert.match(readingInsights, /ReadingActivityBarChart/, "week and month ranges should use a bar chart");
assert.match(insightsPage, /getReadingInsights/, "insights page should use shared server-side insights data");

assert.match(wantToReadPage, /ReadingSuggestionsCarousel/, "want-to-read page should render reading suggestions");
assert.match(wantToReadPage, /getWantToReadPageBooks/, "want-to-read books should include reading-time labels");
assert.match(libraryBooksContext, /readingTimeLabel/, "library book views should carry reading-time labels");
assert.match(libraryGrid, /reading-time/, "shelf cards should render reading-time badges");
assert.match(css, /\.reading-suggestions-track\s*\{[\s\S]*?scrollbar-width:\s*none;/, "reading suggestions carousel should hide Firefox scrollbar chrome");
assert.match(css, /\.reading-suggestions-track::-webkit-scrollbar\s*\{[\s\S]*?display:\s*none;/, "reading suggestions carousel should hide WebKit scrollbar chrome");

assert.match(libraryGrid, /ShelfBookPreview/, "wooden bookshelf should render the preview inside the shelf layout");
assert.doesNotMatch(appFrame, /BookPreviewCard/, "app sidebar should no longer render the book preview card");
assert.match(css, /shelf-book-preview/, "shelf preview should have dedicated styling");
