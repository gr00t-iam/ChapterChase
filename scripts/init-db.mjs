import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const databaseUrl = process.env.DATABASE_URL ?? "file:../data/chapterchase.db";
const dbPath = resolveSqlitePath(databaseUrl);

fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "email" TEXT NOT NULL UNIQUE,
  "username" TEXT UNIQUE,
  "name" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'USER',
  "isVerified" BOOLEAN NOT NULL DEFAULT false,
  "verificationToken" TEXT UNIQUE,
  "resetPasswordToken" TEXT UNIQUE,
  "resetPasswordExpires" DATETIME,
  "readerTheme" TEXT NOT NULL DEFAULT 'paper',
  "ttsVoice" TEXT NOT NULL DEFAULT '5',
  "uiLayout" TEXT NOT NULL DEFAULT 'flat',
  "defaultReadingMode" TEXT NOT NULL DEFAULT 'auto',
  "blurUnreadSummaries" BOOLEAN NOT NULL DEFAULT false,
  "disableAnimations" BOOLEAN NOT NULL DEFAULT false,
  "collapseSeriesRelationships" BOOLEAN NOT NULL DEFAULT false,
  "annotationHighlightColors" TEXT NOT NULL DEFAULT '["#facc15","#38bdf8","#fb7185","#4ade80"]',
  "shareProfile" BOOLEAN NOT NULL DEFAULT false,
  "shareSeriesReviews" BOOLEAN NOT NULL DEFAULT false,
  "viewSharedAnnotations" BOOLEAN NOT NULL DEFAULT false,
  "readingProfiles" TEXT NOT NULL DEFAULT '[]',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS "Session" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "token" TEXT NOT NULL UNIQUE,
  "userId" TEXT NOT NULL,
  "expiresAt" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "LibraryFolder" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "rootPath" TEXT NOT NULL UNIQUE,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "formats" TEXT NOT NULL DEFAULT 'EPUB,PDF',
  "scanIntervalMinutes" INTEGER,
  "lastScanAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS "AppSetting" (
  "key" TEXT NOT NULL PRIMARY KEY,
  "value" TEXT NOT NULL,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS "Book" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "libraryFolderId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "sortTitle" TEXT NOT NULL,
  "author" TEXT,
  "description" TEXT,
  "isbn" TEXT,
  "language" TEXT,
  "publisher" TEXT,
  "publishedDate" TEXT,
  "format" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'IMPORTING',
  "filePath" TEXT NOT NULL UNIQUE,
  "relativePath" TEXT NOT NULL,
  "fileSize" TEXT NOT NULL,
  "fileMtimeMs" TEXT NOT NULL,
  "fileHash" TEXT,
  "coverPath" TEXT,
  "cachePath" TEXT,
  "pageCount" INTEGER,
  "metadataJson" TEXT,
  "error" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Book_libraryFolderId_fkey" FOREIGN KEY ("libraryFolderId") REFERENCES "LibraryFolder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "ReadingProgress" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "bookId" TEXT NOT NULL,
  "pageIndex" INTEGER NOT NULL DEFAULT 0,
  "locator" TEXT,
  "percent" REAL NOT NULL DEFAULT 0,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ReadingProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReadingProgress_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "WantToRead" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "bookId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WantToRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WantToRead_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Collection" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Collection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "CollectionBook" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "collectionId" TEXT NOT NULL,
  "bookId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CollectionBook_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CollectionBook_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CollectionBook_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "ReadingSession" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "bookId" TEXT NOT NULL,
  "durationSeconds" INTEGER NOT NULL DEFAULT 0,
  "wordsRead" INTEGER NOT NULL DEFAULT 0,
  "pagesRead" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReadingSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReadingSession_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Annotation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "bookId" TEXT NOT NULL,
  "quote" TEXT NOT NULL,
  "note" TEXT,
  "color" TEXT NOT NULL DEFAULT '#facc15',
  "locator" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Annotation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Annotation_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Book_libraryFolderId_idx" ON "Book"("libraryFolderId");
CREATE INDEX IF NOT EXISTS "Book_title_idx" ON "Book"("title");
CREATE INDEX IF NOT EXISTS "Book_author_idx" ON "Book"("author");
CREATE INDEX IF NOT EXISTS "Book_status_idx" ON "Book"("status");
CREATE UNIQUE INDEX IF NOT EXISTS "ReadingProgress_userId_bookId_key" ON "ReadingProgress"("userId", "bookId");
CREATE UNIQUE INDEX IF NOT EXISTS "WantToRead_userId_bookId_key" ON "WantToRead"("userId", "bookId");
CREATE INDEX IF NOT EXISTS "WantToRead_bookId_idx" ON "WantToRead"("bookId");
CREATE UNIQUE INDEX IF NOT EXISTS "Collection_userId_name_key" ON "Collection"("userId", "name");
CREATE INDEX IF NOT EXISTS "Collection_userId_idx" ON "Collection"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "CollectionBook_collectionId_bookId_key" ON "CollectionBook"("collectionId", "bookId");
CREATE INDEX IF NOT EXISTS "CollectionBook_userId_idx" ON "CollectionBook"("userId");
CREATE INDEX IF NOT EXISTS "CollectionBook_bookId_idx" ON "CollectionBook"("bookId");
CREATE INDEX IF NOT EXISTS "ReadingSession_userId_createdAt_idx" ON "ReadingSession"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "ReadingSession_bookId_idx" ON "ReadingSession"("bookId");
CREATE INDEX IF NOT EXISTS "Annotation_userId_createdAt_idx" ON "Annotation"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "Annotation_bookId_idx" ON "Annotation"("bookId");
`);

addColumnIfMissing("User", "readerTheme", "TEXT NOT NULL DEFAULT 'paper'");
addColumnIfMissing("User", "username", "TEXT");
addColumnIfMissing("User", "isVerified", "BOOLEAN NOT NULL DEFAULT false");
addColumnIfMissing("User", "verificationToken", "TEXT");
addColumnIfMissing("User", "resetPasswordToken", "TEXT");
addColumnIfMissing("User", "resetPasswordExpires", "DATETIME");
addColumnIfMissing("User", "uiLayout", "TEXT NOT NULL DEFAULT 'flat'");
addColumnIfMissing("User", "ttsVoice", "TEXT NOT NULL DEFAULT '5'");
addColumnIfMissing("User", "defaultReadingMode", "TEXT NOT NULL DEFAULT 'auto'");
addColumnIfMissing("User", "blurUnreadSummaries", "BOOLEAN NOT NULL DEFAULT false");
addColumnIfMissing("User", "disableAnimations", "BOOLEAN NOT NULL DEFAULT false");
addColumnIfMissing("User", "collapseSeriesRelationships", "BOOLEAN NOT NULL DEFAULT false");
addColumnIfMissing("User", "annotationHighlightColors", "TEXT NOT NULL DEFAULT '[\"#facc15\",\"#38bdf8\",\"#fb7185\",\"#4ade80\"]'");
addColumnIfMissing("User", "shareProfile", "BOOLEAN NOT NULL DEFAULT false");
addColumnIfMissing("User", "shareSeriesReviews", "BOOLEAN NOT NULL DEFAULT false");
addColumnIfMissing("User", "viewSharedAnnotations", "BOOLEAN NOT NULL DEFAULT false");
addColumnIfMissing("User", "readingProfiles", "TEXT NOT NULL DEFAULT '[]'");
db.exec(`
CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX IF NOT EXISTS "User_verificationToken_key" ON "User"("verificationToken");
CREATE UNIQUE INDEX IF NOT EXISTS "User_resetPasswordToken_key" ON "User"("resetPasswordToken");
UPDATE "User" SET "isVerified" = true WHERE "role" = 'ADMIN';
`);

db.close();
console.log(`Initialized ChapterChase database at ${dbPath}`);

function resolveSqlitePath(url) {
  if (!url.startsWith("file:")) {
    throw new Error("Only SQLite file: DATABASE_URL values are supported.");
  }

  const raw = url.slice("file:".length);
  if (path.isAbsolute(raw)) {
    return raw;
  }

  return path.resolve(process.cwd(), "prisma", raw);
}

function addColumnIfMissing(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info("${table}")`).all();
  if (!columns.some((entry) => entry.name === column)) {
    db.exec(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${definition}`);
  }
}
