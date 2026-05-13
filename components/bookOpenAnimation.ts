"use client";

import type { AnimationEvent, MouseEvent } from "react";

export function beginBookOpen(event: MouseEvent<HTMLAnchorElement>, bookId: string, onOpenBook: (bookId: string) => void) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
    return;
  }

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  event.preventDefault();
  onOpenBook(bookId);
}

export function finishBookOpen(
  event: AnimationEvent<HTMLAnchorElement>,
  bookId: string,
  onAnimationEnd: (bookId: string) => void
) {
  if (event.animationName !== "book-pull-down") {
    return;
  }
  onAnimationEnd(bookId);
}
