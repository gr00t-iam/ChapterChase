import assert from "node:assert/strict";
import * as offlineLibrary from "../lib/offline-library";
assert.equal(typeof offlineLibrary.bookFileUrl, "function", "Source downloads need a safe endpoint URL builder");
const { bookFileUrl } = offlineLibrary;

assert.equal(bookFileUrl("book-123"), "/api/books/book-123/file");
assert.equal(bookFileUrl("book-123", true), "/api/books/book-123/file?download=1");
assert.equal(bookFileUrl("book/with?characters", true), "/api/books/book%2Fwith%3Fcharacters/file?download=1");
console.log("PASS: source download URLs stay on the authenticated book endpoint and encode identifiers.");
