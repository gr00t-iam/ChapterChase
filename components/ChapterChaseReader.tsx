"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode, TouchEvent as ReactTouchEvent } from "react";
import { ChevronLeft, ChevronRight, ChevronsDown, ChevronsUp, Highlighter, Pause, Pin, Play, Search, Trash2, Type, X } from "lucide-react";
import { PageFlip } from "page-flip";
import { ReadingSprintTimer } from "@/components/ReadingSprintTimer";
import type { ReaderPage } from "@/lib/book-cache";
import { createClientId } from "@/lib/client-id";
import { updateLocalLibraryProgress } from "@/lib/local-library";
import { getOfflineBook } from "@/lib/offline-library";
import { cacheCurrentReading, cacheWantToReadList, postProgress, syncPendingProgress } from "@/lib/offline-client";
import { defaultKokoroVoiceId, resolveKokoroVoiceId } from "@/lib/kokoro-voices";
import {
  generatedSpeechWordTrackingEnabled,
  normalizeTtsEngine,
  selectTtsChunkMaxCharacters,
  splitTextIntoTtsChunks,
  ttsChunkRequestTimeoutMs,
  ttsInitialRequestTimeoutMs,
  type TtsChunk,
  type TtsEngine,
} from "@/lib/tts-client";
import type { PDFDocumentProxy } from "pdfjs-dist";

type ReaderProps = {
  bookId: string;
  title: string;
  author: string | null;
  format: string;
  pages: ReaderPage[];
  initialPage: number;
  initialTheme?: string;
  initialTtsVoice?: string;
  metadataJson?: string | null;
  localFileBlob?: Blob;
};

type FlipPage = {
  title?: string;
  text: string;
  image?: string;
  loading?: boolean;
};

type PdfJsModule = typeof import("pdfjs-dist");

type ReaderHighlight = {
  id: string;
  pageIndex: number;
  text: string;
  occurrence: number;
  color: string;
  createdAt: string;
};

type HighlightPopover = {
  pageIndex: number;
  text: string;
  occurrence: number;
  x: number;
  y: number;
};

type HighlightActionPopover = {
  highlightId: string;
  pageIndex: number;
  x: number;
  y: number;
};

type XRayMatch = {
  id: string;
  pageIndex: number;
  snippet: string;
};

type XRayProfile = {
  role: string;
  summary: string;
  notablePages: number[];
};

type SpeakingWord = {
  pageIndex: number;
  wordIndex: number;
};

type ReaderWordTracker = {
  pageIndex: number;
  nextWordIndex: number;
};

const readerThemes = new Set(["paper", "night", "scroll", "eink", "reseda", "deepsea"]);
const defaultHighlightColor = "#facc15";
const readerTextSettingsStorageKey = "chapterchase:reader:textSettings";
const readerFixedPageModeStorageKey = "chapterchase:reader:fixedPageMode";
const readerToolbarCollapsedStorageKey = "readerToolbarCollapsed";
const highlightPalette = [
  { label: "Yellow", value: "#facc15" },
  { label: "Green", value: "#86efac" },
  { label: "Blue", value: "#93c5fd" },
  { label: "Pink", value: "#f9a8d4" },
] as const;
type ReaderFontOption = { label: string; value: string };
type ReaderFontGroup = { group: string; fonts: ReaderFontOption[] };

const readerFontOptions: ReaderFontGroup[] = [
  {
    group: "Serif",
    fonts: [
      { label: "Merriweather", value: "Merriweather, Georgia, serif" },
      { label: "Playfair Display", value: "\"Playfair Display\", Georgia, serif" },
      { label: "Lora", value: "Lora, Georgia, serif" },
      { label: "EB Garamond", value: "\"EB Garamond\", Georgia, serif" },
      { label: "Crimson Text", value: "\"Crimson Text\", Georgia, serif" },
    ],
  },
  {
    group: "Sans-Serif",
    fonts: [
      { label: "Roboto", value: "Roboto, Arial, sans-serif" },
      { label: "Open Sans", value: "\"Open Sans\", Arial, sans-serif" },
      { label: "Source Sans 3", value: "\"Source Sans 3\", Arial, sans-serif" },
      { label: "Inter", value: "Inter, Arial, sans-serif" },
      { label: "Atkinson Hyperlegible", value: "\"Atkinson Hyperlegible\", Arial, sans-serif" },
    ],
  },
  {
    group: "Script / Calligraphy",
    fonts: [
      { label: "Cedarville Cursive", value: "\"Cedarville Cursive\", cursive" },
      { label: "Great Vibes", value: "\"Great Vibes\", cursive" },
      { label: "Dancing Script", value: "\"Dancing Script\", cursive" },
      { label: "Pinyon Script", value: "\"Pinyon Script\", cursive" },
      { label: "Alex Brush", value: "\"Alex Brush\", cursive" },
      { label: "Parisienne", value: "Parisienne, cursive" },
    ],
  },
];
const readerFontFlatOptions = readerFontOptions.flatMap((group) => group.fonts);

type ReaderTextSettings = {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  wordSpacing: number;
  boldText: boolean;
};

const defaultReaderTextSettings: ReaderTextSettings = {
  fontFamily: readerFontFlatOptions[5].value,
  fontSize: 18,
  lineHeight: 1.6,
  wordSpacing: 0,
  boldText: false,
};

type LocalReaderSettings = {
  activeReadingProfile?: string;
  ttsVoice?: string;
  ttsEngine: TtsEngine;
  bionicReading: boolean;
};

export default function ChapterChaseReader({
  bookId,
  title,
  author,
  format,
  pages,
  initialPage,
  initialTheme = "paper",
  initialTtsVoice = String(defaultKokoroVoiceId),
  localFileBlob,
}: ReaderProps) {
  const isPdf = format === "PDF";
  const isLocalBook = bookId.startsWith("local-");
  const normalizedInitialTheme = readerThemes.has(initialTheme) ? initialTheme : "paper";
  const fallbackPages = useMemo<FlipPage[]>(
    () => (pages.length ? pages : [{ text: "Loading PDF pages...", loading: true }]),
    [pages]
  );
  const [pdfPages, setPdfPages] = useState<FlipPage[]>(isPdf ? [{ text: "Loading PDF pages...", loading: true }] : []);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const safePages = isPdf ? pdfPages : fallbackPages;
  const pageCount = Math.max(1, safePages.length);
  const [flipIndex, setFlipIndex] = useState(Math.min(initialPage + 1, pageCount));
  const [isReadingActive, setIsReadingActive] = useState(false);
  const [isSpeechPaused, setIsSpeechPaused] = useState(false);
  const [isSpeechUnlocked, setIsSpeechUnlocked] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [speakingWord, setSpeakingWord] = useState<SpeakingWord | null>(null);
  const [isSpeechGenerating, setIsSpeechGenerating] = useState(false);
  const [isToolbarCollapsed, setIsToolbarCollapsed] = useState(false);
  const [localReaderSettings, setLocalReaderSettings] = useState<LocalReaderSettings>({
    bionicReading: false,
    ttsVoice: String(resolveKokoroVoiceId(initialTtsVoice)),
    ttsEngine: "server",
  });
  const [ttsVoice, setTtsVoice] = useState(() => String(resolveKokoroVoiceId(initialTtsVoice)));
  const [readerTheme, setReaderTheme] = useState(normalizedInitialTheme);
  const [readingRulerEnabled, setReadingRulerEnabled] = useState(false);
  const [isTimerVisible, setIsTimerVisible] = useState(false);
  const [isTextSettingsOpen, setIsTextSettingsOpen] = useState(false);
  const [readerTextSettings, setReaderTextSettings] = useState<ReaderTextSettings>(defaultReaderTextSettings);
  const [fixedPageMode, setFixedPageMode] = useState(true);
  const [highlighterMode, setHighlighterMode] = useState(false);
  const [readingRulerPinned, setReadingRulerPinned] = useState(false);
  const [rulerPosition, setRulerPosition] = useState<{ x: number; y: number } | null>(null);
  const [highlightColor, setHighlightColor] = useState(defaultHighlightColor);
  const [highlightPopover, setHighlightPopover] = useState<HighlightPopover | null>(null);
  const [highlightActionPopover, setHighlightActionPopover] = useState<HighlightActionPopover | null>(null);
  const [readerHighlights, setReaderHighlights] = useState<ReaderHighlight[]>([]);
  const [xrayPanel, setXrayPanel] = useState<{ term: string; matches: XRayMatch[]; profile: XRayProfile; tab: "local" | "community" } | null>(null);
  const [sprintState, setSprintState] = useState({ active: false, progress: 0, remainingSeconds: 0 });
  const [sessionStats, setSessionStats] = useState({ seconds: 0, words: 0, pages: 0 });
  const flipbookHostRef = useRef<HTMLDivElement | null>(null);
  const readerStageRef = useRef<HTMLElement | null>(null);
  const scrollPageRefs = useRef<Array<HTMLElement | null>>([]);
  const rulerRef = useRef<HTMLDivElement | null>(null);
  const [readerDomKey] = useState(() => `reader-${bookId}`);
  const pageFlipRef = useRef<PageFlip | null>(null);
  const pageFlipInitTimerRef = useRef<number | null>(null);
  const cleanupResizeRef = useRef<(() => void) | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const speechAudioRef = useRef<HTMLAudioElement | null>(null);
  const speechAudioUrlRef = useRef<string | null>(null);
  const speechAbortControllerRef = useRef<AbortController | null>(null);
  const speechProgressFrameRef = useRef<number | null>(null);
  const speechProgressMetaRef = useRef<{ pageIndex: number; wordCount: number; wordOffset: number } | null>(null);
  const speechChunkMetaRef = useRef<{ pageIndex: number; chunks: TtsChunk[]; index: number } | null>(null);
  const speechPrefetchRef = useRef<{ index: number; controller: AbortController; promise: Promise<Blob> } | null>(null);
  const activeSpeakingWordElementRef = useRef<HTMLElement | null>(null);
  const preservePreparedSpeechAudioOnceRef = useRef(false);
  const pendingHighlightRef = useRef<Pick<HighlightPopover, "pageIndex" | "text" | "occurrence"> | null>(null);
  const pendingHighlightCreatedAtRef = useRef(0);
  const ignoreNextHighlightColorClickRef = useRef(false);
  const autoAdvanceFallbackTimerRef = useRef<number | null>(null);
  const pendingAutoReadPageRef = useRef<number | null>(null);
  const speechTimerRef = useRef<number | null>(null);
  const utteranceIdRef = useRef(0);
  const isReadingActiveRef = useRef(false);
  const readCurrentPageRef = useRef<(targetPageIndex?: number) => void | Promise<void>>(() => undefined);
  const pageIndex = Math.max(0, Math.min(pageCount - 1, flipIndex - 1));
  const isOnCover = flipIndex === 0;
  const latestPage = useRef(pageIndex);
  const pageEnteredAtRef = useRef(0);
  const lastAnalyticsPageRef = useRef(pageIndex);
  const bionicReading = localReaderSettings.bionicReading;
  const readerShellStyle = useMemo(
    () =>
      ({
        "--reader-custom-font": readerTextSettings.fontFamily,
        "--reader-custom-font-size": `${readerTextSettings.fontSize}px`,
        "--reader-custom-line-height": String(readerTextSettings.lineHeight),
        "--reader-custom-word-spacing": `${readerTextSettings.wordSpacing}px`,
        "--reader-custom-font-weight": readerTextSettings.boldText ? "700" : "400",
      }) as CSSProperties,
    [readerTextSettings]
  );

  function updateReaderTextSettings(patch: Partial<ReaderTextSettings>) {
    setReaderTextSettings((current) => {
      const next = { ...current, ...patch };
      saveReaderTextSettings(next);
      return next;
    });
  }

  function toggleFixedPageMode(nextValue: boolean) {
    setFixedPageMode(nextValue);
    window.localStorage.setItem(readerFixedPageModeStorageKey, JSON.stringify(nextValue));
  }

  useEffect(() => {
    latestPage.current = pageIndex;
  }, [pageIndex]);

  useEffect(() => {
    const timer = window.setTimeout(() => setSpeechSupported(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsToolbarCollapsed(loadToolbarCollapsed()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const nextSettings = loadLocalReaderSettings();
      setLocalReaderSettings(nextSettings);
      setTtsVoice(String(resolveKokoroVoiceId(nextSettings.ttsVoice ?? initialTtsVoice)));
      setReaderTheme(
        nextSettings.activeReadingProfile && readerThemes.has(nextSettings.activeReadingProfile)
          ? nextSettings.activeReadingProfile
          : normalizedInitialTheme
      );
      setReaderTextSettings(loadReaderTextSettings());
      setFixedPageMode(loadFixedPageMode());
      setReaderHighlights(loadBookHighlights(bookId));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [bookId, initialTtsVoice, normalizedInitialTheme]);

  useEffect(() => {
    const activeElement = activeSpeakingWordElementRef.current;
    activeElement?.classList.remove("reader-speaking-word");
    activeSpeakingWordElementRef.current = null;

    if (!speakingWord) {
      return;
    }

    const nextElement = readerStageRef.current?.querySelector<HTMLElement>(
      `.reader-word[data-page-index="${speakingWord.pageIndex}"][data-word-index="${speakingWord.wordIndex}"]`
    );
    if (nextElement) {
      nextElement.classList.add("reader-speaking-word");
      activeSpeakingWordElementRef.current = nextElement;
    }
  }, [speakingWord]);

  useEffect(() => {
    if (isLocalBook) {
      return;
    }

    let cancelled = false;

    async function loadPersistedAnnotations() {
      const response = await fetch(`/api/annotations?bookId=${encodeURIComponent(bookId)}`).catch(() => null);
      if (!response?.ok || cancelled) {
        return;
      }

      const payload = (await response.json().catch(() => null)) as {
        annotations?: Array<{ id: string; quote: string; color: string; locator: string | null; createdAt?: string }>;
      } | null;

      const persistedHighlights =
        payload?.annotations
          ?.map((annotation) => {
            const locator = parseHighlightLocator(annotation.locator);
            if (!locator) {
              return null;
            }

            return {
              id: annotation.id,
              pageIndex: locator.pageIndex,
              occurrence: locator.occurrence,
              text: annotation.quote,
              color: annotation.color,
              createdAt: annotation.createdAt ?? new Date().toISOString(),
            } satisfies ReaderHighlight;
          })
          .filter((highlight): highlight is ReaderHighlight => Boolean(highlight)) ?? [];

      if (!persistedHighlights.length || cancelled) {
        return;
      }

      setReaderHighlights((current) => {
        const seen = new Set(current.map(getHighlightAnchorKey));
        const next = [...current];
        for (const highlight of persistedHighlights) {
          const key = getHighlightAnchorKey(highlight);
          if (!seen.has(key)) {
            seen.add(key);
            next.push(highlight);
          }
        }
        saveBookHighlights(bookId, next);
        return next;
      });
    }

    void loadPersistedAnnotations();
    return () => {
      cancelled = true;
    };
  }, [bookId, isLocalBook]);

  useEffect(() => {
    void cacheCurrentReading(bookId);
    void cacheWantToReadList();
    const handleOnline = () => void syncPendingProgress();
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [bookId]);

  useEffect(() => {
    isReadingActiveRef.current = isReadingActive;
  }, [isReadingActive]);

  useEffect(() => {
    function syncSprintState(event: Event) {
      const detail = (event as CustomEvent<{ active: boolean; progress: number; remainingSeconds: number }>).detail;
      if (detail) {
        setSprintState(detail);
      }
    }

    window.addEventListener("chapterchase:reading-sprint", syncSprintState);
    return () => window.removeEventListener("chapterchase:reading-sprint", syncSprintState);
  }, []);

  useEffect(() => {
    const refreshUserSettings = () => {
      const nextSettings = loadLocalReaderSettings();
      setLocalReaderSettings(nextSettings);
      if (nextSettings.activeReadingProfile && readerThemes.has(nextSettings.activeReadingProfile)) {
        setReaderTheme(nextSettings.activeReadingProfile);
      }
      if (nextSettings.ttsVoice) {
        setTtsVoice(String(resolveKokoroVoiceId(nextSettings.ttsVoice)));
      }
    };

    window.addEventListener("storage", refreshUserSettings);
    window.addEventListener("chapterchase:user-settings", refreshUserSettings);
    return () => {
      window.removeEventListener("storage", refreshUserSettings);
      window.removeEventListener("chapterchase:user-settings", refreshUserSettings);
    };
  }, []);

  const saveReaderTheme = useCallback((nextTheme: string) => {
    const theme = readerThemes.has(nextTheme) ? nextTheme : "paper";
    setReaderTheme(theme);
    fetch("/api/user/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ readerTheme: theme }),
    }).catch(() => undefined);
  }, []);

  const clearSpeechProgressTracking = useCallback(() => {
    if (speechProgressFrameRef.current) {
      window.cancelAnimationFrame(speechProgressFrameRef.current);
      speechProgressFrameRef.current = null;
    }
    speechProgressMetaRef.current = null;
    activeSpeakingWordElementRef.current?.classList.remove("reader-speaking-word");
    activeSpeakingWordElementRef.current = null;
    setSpeakingWord(null);
    setIsSpeechGenerating(false);
  }, []);

  const setSpeakingProgressWord = useCallback((nextWord: SpeakingWord | null) => {
    setSpeakingWord((current) => {
      if (current?.pageIndex === nextWord?.pageIndex && current?.wordIndex === nextWord?.wordIndex) {
        return current;
      }
      return nextWord;
    });
  }, []);

  const startSpeechProgressTracking = useCallback(
    (audio: HTMLAudioElement, targetPageIndex: number, wordCount: number, wordOffset = 0) => {
      clearSpeechProgressTracking();
      if (wordCount <= 0) {
        return;
      }

      speechProgressMetaRef.current = { pageIndex: targetPageIndex, wordCount, wordOffset };

      const tick = () => {
        const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
        const leadSeconds = duration > 0 ? Math.min(0.35, Math.max(0.0, duration * 0.08)) : 0;
        const progress = duration > 0 ? Math.max(0, Math.min(0.999, (audio.currentTime + leadSeconds) / duration)) : 0;
        const wordIndex = Math.max(0, Math.min(wordCount - 1, Math.floor(progress * wordCount)));
        setSpeakingProgressWord({ pageIndex: targetPageIndex, wordIndex: wordOffset + wordIndex });

        if (!audio.paused && !audio.ended) {
          speechProgressFrameRef.current = window.requestAnimationFrame(tick);
        } else {
          speechProgressFrameRef.current = null;
        }
      };

      tick();
    },
    [clearSpeechProgressTracking, setSpeakingProgressWord]
  );

  const clearAutoAdvanceFallback = useCallback(() => {
    if (autoAdvanceFallbackTimerRef.current) {
      window.clearTimeout(autoAdvanceFallbackTimerRef.current);
      autoAdvanceFallbackTimerRef.current = null;
    }
    pendingAutoReadPageRef.current = null;
  }, []);

  const cleanupCurrentSpeechAudio = useCallback(() => {
    clearAutoAdvanceFallback();
    clearSpeechProgressTracking();
    if (speechTimerRef.current) {
      window.clearTimeout(speechTimerRef.current);
      speechTimerRef.current = null;
    }
    speechAbortControllerRef.current?.abort();
    speechAbortControllerRef.current = null;
    speechPrefetchRef.current?.controller.abort();
    speechPrefetchRef.current = null;
    speechChunkMetaRef.current = null;
    const audio = speechAudioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      speechAudioRef.current = null;
    }
    if (speechAudioUrlRef.current) {
      URL.revokeObjectURL(speechAudioUrlRef.current);
      speechAudioUrlRef.current = null;
    }
  }, [clearAutoAdvanceFallback, clearSpeechProgressTracking]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      pageFlipRef.current?.update();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [readerTheme, fixedPageMode, isToolbarCollapsed]);

  useEffect(() => {
    const now = Date.now();
    const elapsedSeconds = pageEnteredAtRef.current ? Math.max(1, Math.round((now - pageEnteredAtRef.current) / 1000)) : 0;
    const previousPage = safePages[lastAnalyticsPageRef.current];
    const wordsRead = countWords(previousPage?.text ?? "");
    pageEnteredAtRef.current = now;
    lastAnalyticsPageRef.current = pageIndex;
    if (elapsedSeconds > 0) {
      setSessionStats((current) => ({
        seconds: current.seconds + elapsedSeconds,
        words: current.words + wordsRead,
        pages: current.pages + 1,
      }));
    }

    const percent = pageCount <= 1 ? 1 : pageIndex / (pageCount - 1);
    const timeout = window.setTimeout(() => {
      if (isLocalBook) {
        void updateLocalLibraryProgress(bookId, percent, pageIndex);
      } else {
        void postProgress(`/api/books/${bookId}/progress`, {
          pageIndex,
          percent,
          durationSeconds: elapsedSeconds,
          wordsRead,
          pagesRead: 1,
        });
      }
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [bookId, isLocalBook, pageCount, pageIndex, safePages]);

  useEffect(() => {
    function updateSelection() {
      const selection = window.getSelection();
      const selectedText = selection?.toString().trim() ?? "";

      if (!selection || selection.rangeCount === 0 || selectedText.length < 2) {
        setHighlightPopover(null);
        return;
      }

      setHighlightActionPopover(null);
      const range = selection.getRangeAt(0);
      const textElement = getSelectedReaderTextElement(selection);
      const article = textElement?.closest<HTMLElement>(".reader-book-page");
      const selectedPageIndex = Number(article?.dataset.pageIndex);

      if (!textElement || !Number.isFinite(selectedPageIndex)) {
        setHighlightPopover(null);
        return;
      }

      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        setHighlightPopover(null);
        return;
      }

      const selectionDetails = getSelectionDetails(textElement, range);
      if (!selectionDetails || selectionDetails.text.length < 2) {
        setHighlightPopover(null);
        return;
      }

      pendingHighlightRef.current = {
        pageIndex: selectedPageIndex,
        text: selectionDetails.text,
        occurrence: selectionDetails.occurrence,
      };
      pendingHighlightCreatedAtRef.current = Date.now();

      setHighlightPopover({
        pageIndex: selectedPageIndex,
        text: selectionDetails.text,
        occurrence: selectionDetails.occurrence,
        x: Math.max(8, Math.min(window.innerWidth - 168, rect.left + rect.width / 2 - 84)),
        y: Math.max(58, rect.top - 48),
      });
    }

    function updateSelectionAfterPointer() {
      window.setTimeout(updateSelection, 0);
    }

    document.addEventListener("selectionchange", updateSelection);
    document.addEventListener("mouseup", updateSelectionAfterPointer);
    document.addEventListener("keyup", updateSelectionAfterPointer);
    document.addEventListener("touchend", updateSelectionAfterPointer, { passive: true });
    return () => {
      document.removeEventListener("selectionchange", updateSelection);
      document.removeEventListener("mouseup", updateSelectionAfterPointer);
      document.removeEventListener("keyup", updateSelectionAfterPointer);
      document.removeEventListener("touchend", updateSelectionAfterPointer);
    };
  }, []);

  useEffect(() => {
    function handleHighlightClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      const highlightElement = target?.closest<HTMLElement>(".reader-highlight");
      const highlightId = highlightElement?.dataset.highlightId;
      if (!highlightElement || !highlightId) {
        return;
      }

      const article = highlightElement.closest<HTMLElement>(".reader-book-page");
      const selectedPageIndex = Number(article?.dataset.pageIndex);
      const rect = highlightElement.getBoundingClientRect();
      pendingHighlightRef.current = null;
      setHighlightPopover(null);
      setHighlightActionPopover({
        highlightId,
        pageIndex: Number.isFinite(selectedPageIndex) ? selectedPageIndex : pageIndex,
        x: Math.max(8, Math.min(window.innerWidth - 190, rect.left + rect.width / 2 - 95)),
        y: Math.max(58, rect.top - 48),
      });
      window.getSelection()?.removeAllRanges();
    }

    document.addEventListener("click", handleHighlightClick);
    return () => document.removeEventListener("click", handleHighlightClick);
  }, [pageIndex]);

  const goToFlipPage = useCallback(
    (nextFlipIndex: number) => {
      const clamped = Math.max(0, Math.min(pageCount, nextFlipIndex));
      if (clamped === flipIndex) {
        return;
      }
      utteranceIdRef.current += 1;
      cleanupCurrentSpeechAudio();
      if (pageFlipRef.current) {
        if (Math.abs(clamped - flipIndex) > 1) {
          pageFlipRef.current.turnToPage(clamped);
        } else if (clamped > flipIndex) {
          pageFlipRef.current.flipNext("top");
        } else {
          pageFlipRef.current.flipPrev("top");
        }
      } else {
        setFlipIndex(clamped);
      }
    },
    [cleanupCurrentSpeechAudio, flipIndex, pageCount]
  );

  const extractPdfText = useCallback(
    async (targetPageIndex: number) => {
      if (!pdfDocument) {
        return "";
      }
      const pageNumber = Math.max(1, Math.min(pdfDocument.numPages, targetPageIndex + 1));
      const page = await pdfDocument.getPage(pageNumber);
      const content = await page.getTextContent();
      return content.items.map((item) => ("str" in item ? item.str : "")).join(" ").replace(/\s+/g, " ").trim();
    },
    [pdfDocument]
  );

  const finishSpeechReading = useCallback(() => {
    clearAutoAdvanceFallback();
    clearSpeechProgressTracking();
    isReadingActiveRef.current = false;
    setIsReadingActive(false);
    setIsSpeechPaused(false);
  }, [clearAutoAdvanceFallback, clearSpeechProgressTracking]);

  const advanceReadingAfterSpeech = useCallback(
    (currentPageIndex: number) => {
      const nextPageIndex = currentPageIndex + 1;
      if (nextPageIndex >= pageCount) {
        finishSpeechReading();
        return;
      }

      pendingAutoReadPageRef.current = nextPageIndex;

      if (fixedPageMode && pageFlipRef.current) {
        pageFlipRef.current.flipNext("top");
        autoAdvanceFallbackTimerRef.current = window.setTimeout(() => {
          autoAdvanceFallbackTimerRef.current = null;
          if (!isReadingActiveRef.current || pendingAutoReadPageRef.current !== nextPageIndex) {
            return;
          }
          pendingAutoReadPageRef.current = null;
          setFlipIndex(nextPageIndex + 1);
          void readCurrentPageRef.current(nextPageIndex);
        }, 1250);
        return;
      }

      clearAutoAdvanceFallback();
      setFlipIndex(nextPageIndex + 1);
      window.setTimeout(() => {
        if (!isReadingActiveRef.current) {
          return;
        }
        scrollPageRefs.current[nextPageIndex]?.scrollIntoView({ behavior: "smooth", block: "start" });
        void readCurrentPageRef.current(nextPageIndex);
      }, 160);
    },
    [clearAutoAdvanceFallback, finishSpeechReading, fixedPageMode, pageCount]
  );

  const readCurrentPage = useCallback(async (targetPageIndex = latestPage.current, preservePreparedSpeechAudio = false) => {
    if (!speechSupported) {
      return;
    }

    const clampedPageIndex = Math.max(0, Math.min(pageCount - 1, targetPageIndex));
    const text = isPdf ? await extractPdfText(clampedPageIndex) : (safePages[clampedPageIndex]?.text ?? "");
    if (!text.trim()) {
      finishSpeechReading();
      return;
    }

    if (pendingAutoReadPageRef.current === clampedPageIndex) {
      clearAutoAdvanceFallback();
    }

    utteranceIdRef.current += 1;
    const utteranceId = utteranceIdRef.current;
    const shouldPreservePreparedSpeechAudio = preservePreparedSpeechAudio || preservePreparedSpeechAudioOnceRef.current;
    preservePreparedSpeechAudioOnceRef.current = false;
    if (!shouldPreservePreparedSpeechAudio) {
      cleanupCurrentSpeechAudio();
    }
    isReadingActiveRef.current = true;
    setIsReadingActive(true);
    setIsSpeechPaused(false);
    setSpeechError(null);
    setIsSpeechGenerating(true);

    speechTimerRef.current = window.setTimeout(async () => {
      const controller = new AbortController();
      speechAbortControllerRef.current = controller;

      try {
        const shouldTrackWords = generatedSpeechWordTrackingEnabled && !safePages[clampedPageIndex]?.image;
        const ttsChunkMaxCharacters = selectTtsChunkMaxCharacters(false);
        const chunks = splitTextIntoTtsChunks(text, ttsChunkMaxCharacters).map((chunk) => (shouldTrackWords ? chunk : { ...chunk, wordCount: 0 }));
        speechChunkMetaRef.current = { pageIndex: clampedPageIndex, chunks, index: 0 };

        const playChunk = async (chunkIndex: number) => {
          const meta = speechChunkMetaRef.current;
          if (!meta || meta.pageIndex !== clampedPageIndex) return;
          if (chunkIndex >= meta.chunks.length) {
            // Page finished
            if (utteranceId !== utteranceIdRef.current) return;
            if (isReadingActiveRef.current && clampedPageIndex < pageCount - 1) {
              advanceReadingAfterSpeech(clampedPageIndex);
            } else {
              finishSpeechReading();
            }
            return;
          }

          meta.index = chunkIndex;
          const chunk = meta.chunks[chunkIndex];

          // Use prefetched audio if available for this chunk; otherwise fetch now.
          setIsSpeechGenerating(true);
          let blob: Blob;
          const prefetch = speechPrefetchRef.current;
          if (prefetch && prefetch.index === chunkIndex) {
            blob = await prefetch.promise;
            speechPrefetchRef.current = null;
          } else {
            blob = await fetchPreferredTtsAudioBlob(
              chunk.text,
              ttsVoice,
              controller.signal,
              chunkIndex === 0 ? ttsInitialRequestTimeoutMs : ttsChunkRequestTimeoutMs
            );
          }

          if (utteranceId !== utteranceIdRef.current || controller.signal.aborted) return;

          // Prefetch the next chunk while this one plays.
          const nextIndex = chunkIndex + 1;
          if (nextIndex < meta.chunks.length && !speechPrefetchRef.current) {
            const nextController = new AbortController();
            speechPrefetchRef.current = {
              index: nextIndex,
              controller: nextController,
              promise: fetchPreferredTtsAudioBlob(meta.chunks[nextIndex].text, ttsVoice, nextController.signal, ttsChunkRequestTimeoutMs),
            };
          } else if (nextIndex >= meta.chunks.length && clampedPageIndex < pageCount - 1) {
            void prefetchFirstTtsChunkForPage(clampedPageIndex + 1);
          }

          if (speechAudioUrlRef.current) {
            URL.revokeObjectURL(speechAudioUrlRef.current);
            speechAudioUrlRef.current = null;
          }

          const audioUrl = URL.createObjectURL(blob);
          let audio = speechAudioRef.current;
          if (!audio) {
            audio = new Audio();
            speechAudioRef.current = audio;
          }
          audio.pause();
          audio.muted = false;
          audio.volume = 1;
          speechAudioUrlRef.current = audioUrl;
          audio.defaultPlaybackRate = 1;
          audio.playbackRate = 1;

          audio.onended = () => {
            if (utteranceId !== utteranceIdRef.current) return;
            if (!isReadingActiveRef.current) return;
            void playChunk(chunkIndex + 1);
          };
          audio.onerror = () => {
            if (utteranceId === utteranceIdRef.current) {
              finishSpeechReading();
              setSpeechError("Unable to play generated speech.");
            }
          };

          audio.src = audioUrl;
          setIsSpeechGenerating(false);
          try {
            await audio.play();
          } catch (error) {
            if (utteranceId !== utteranceIdRef.current || controller.signal.aborted) return;
            isReadingActiveRef.current = false;
            setIsReadingActive(false);
            setIsSpeechPaused(true);
            setSpeechError(getSpeechPlaybackPrompt(error));
            return;
          }
          startSpeechProgressTracking(audio, clampedPageIndex, chunk.wordCount, chunk.wordOffset);
        };

        await playChunk(0);
      } catch (error) {
        if (controller.signal.aborted || utteranceId !== utteranceIdRef.current) {
          return;
        }
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        const message = error instanceof Error ? error.message : "Unable to synthesize speech.";
        setSpeechError(message);
        if (utteranceId === utteranceIdRef.current) {
          finishSpeechReading();
        }
      }
    }, 100);

    async function prefetchFirstTtsChunkForPage(nextPageIndex: number) {
      const nextText = isPdf ? await extractPdfText(nextPageIndex) : (safePages[nextPageIndex]?.text ?? "");
      const firstChunk = splitTextIntoTtsChunks(nextText, selectTtsChunkMaxCharacters(false))[0];
      if (!firstChunk?.text) {
        return;
      }

      const controller = new AbortController();
      await fetchPreferredTtsAudioBlob(firstChunk.text, ttsVoice, controller.signal, ttsChunkRequestTimeoutMs).catch(() => undefined);
    }
  }, [
    advanceReadingAfterSpeech,
    cleanupCurrentSpeechAudio,
    clearAutoAdvanceFallback,
    extractPdfText,
    finishSpeechReading,
    isPdf,
    pageCount,
    safePages,
    speechSupported,
    startSpeechProgressTracking,
    ttsVoice,
  ]);

  useEffect(() => {
    readCurrentPageRef.current = readCurrentPage;
  }, [readCurrentPage]);

  useEffect(() => {
    if (!speechSupported) {
      return;
    }

    const timer = window.setTimeout(() => {
      warmKokoroTts(ttsVoice);
    }, 650);
    return () => window.clearTimeout(timer);
  }, [speechSupported, ttsVoice]);

  useEffect(() => {
    if (!isPdf) {
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;
    let loadedDocument: PDFDocumentProxy | null = null;

    async function loadPdf() {
      setPdfPages([{ text: "Loading PDF pages...", loading: true }]);
      setPdfError(null);

      try {
        const readableArea = getScrollReadableAreaSize();
        const pdfjsLib: PdfJsModule = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.mjs", import.meta.url).toString();

        const blob = localFileBlob ?? (await fetchBookFileBlob(bookId));
        objectUrl = URL.createObjectURL(blob);
        const pdf = await pdfjsLib.getDocument(objectUrl).promise;
        loadedDocument = pdf;

        if (cancelled) {
          await pdf.destroy();
          return;
        }

        setPdfDocument(pdf);

        const firstBatch = await renderPdfPages(pdf, 1, Math.min(pdf.numPages, 4), readableArea);
        if (!cancelled) {
          setPdfPages(firstBatch);
        }

        if (pdf.numPages > firstBatch.length) {
          const rest = await renderPdfPages(pdf, firstBatch.length + 1, pdf.numPages, readableArea);
          if (!cancelled) {
            setPdfPages([...firstBatch, ...rest]);
          }
        }
      } catch (error) {
        if (!cancelled) {
          setPdfError(error instanceof Error ? error.message : "Unable to render PDF.");
          setPdfPages([{ text: "", loading: true }]);
        }
      }
    }

    void loadPdf();

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
      void loadedDocument?.destroy();
    };
  }, [bookId, isPdf, localFileBlob]);

  useEffect(() => {
    const host = flipbookHostRef.current;
    if (!host) {
      return;
    }

    if (!fixedPageMode) {
      cleanupResizeRef.current?.();
      cleanupResizeRef.current = null;
      if (pageFlipRef.current) {
        pageFlipRef.current.destroy();
        pageFlipRef.current = null;
      }
      host.replaceChildren();
      return;
    }

    if (pageFlipInitTimerRef.current) {
      window.clearTimeout(pageFlipInitTimerRef.current);
    }

    pageFlipInitTimerRef.current = window.setTimeout(() => {
      const mountedHost = flipbookHostRef.current;
      if (!mountedHost) {
        return;
      }

      if (pageFlipRef.current) {
        pageFlipRef.current.destroy();
        pageFlipRef.current = null;
      }
      mountedHost.replaceChildren();

      const flipbookElement = document.createElement("div");
      flipbookElement.className = "book-container";
      flipbookElement.dataset.readerKey = readerDomKey;
      const pageElements = [
        createCoverPageElement({ title, author, format }),
        ...safePages.map((page, index) => createContentPageElement(page, index, readerHighlights, bionicReading)),
      ];

      if (pageElements.length < 2) {
        return;
      }

      flipbookElement.append(...pageElements);
      mountedHost.appendChild(flipbookElement);
      const pageFlipSize = getResponsivePageFlipSize();

      const pageFlip = new PageFlip(flipbookElement, {
        size: "stretch",
        width: pageFlipSize.width,
        height: pageFlipSize.height,
        minWidth: pageFlipSize.minWidth,
        maxWidth: pageFlipSize.maxWidth,
        minHeight: pageFlipSize.minHeight,
        maxHeight: pageFlipSize.maxHeight,
        mode: pageFlipSize.mode,
        startPage: Math.min(latestPage.current + 1, pageElements.length - 1),
        drawShadow: true,
        flippingTime: 1000,
        showCover: true,
        useMouseEvents: !highlighterMode,
        useMouseTouch: !highlighterMode,
        mobileScrollSupport: !highlighterMode,
        swipeDistance: 28,
        maxShadowOpacity: 0.58,
        autoSize: true,
      });

      pageFlipRef.current = pageFlip;

      if (pageFlip) {
        pageFlip.loadFromHTML(pageElements);
        const handleResize = () => {
          const nextSize = getResponsivePageFlipSize();
          flipbookElement.dataset.mode = nextSize.mode;
          window.requestAnimationFrame(() => pageFlip.update());
        };
        window.addEventListener("resize", handleResize);
        window.addEventListener("orientationchange", handleResize);
        pageFlip.on<number>("flip", (event) => {
          const currentFlipIndex = Math.max(0, Math.min(pageElements.length - 1, event.data));
          const currentReaderIndex = Math.max(0, Math.min(pageCount - 1, currentFlipIndex - 1));
          setFlipIndex(currentFlipIndex);

          if (currentFlipIndex > 0 && isReadingActiveRef.current) {
            if (pendingAutoReadPageRef.current === currentReaderIndex) {
              clearAutoAdvanceFallback();
            }
            readCurrentPageRef.current(currentReaderIndex);
          }
        });
        flipbookElement.dataset.resizeListeners = "attached";
        cleanupResizeRef.current = () => {
          window.removeEventListener("resize", handleResize);
          window.removeEventListener("orientationchange", handleResize);
        };
      }
    }, 0);

    return () => {
      if (pageFlipInitTimerRef.current) {
        window.clearTimeout(pageFlipInitTimerRef.current);
        pageFlipInitTimerRef.current = null;
      }
      cleanupResizeRef.current?.();
      cleanupResizeRef.current = null;
      if (pageFlipRef.current) {
        pageFlipRef.current.destroy();
        pageFlipRef.current = null;
      }
    };
  }, [
    author,
    bionicReading,
    clearAutoAdvanceFallback,
    fixedPageMode,
    format,
    highlighterMode,
    isToolbarCollapsed,
    pageCount,
    readerDomKey,
    readerHighlights,
    safePages,
    title,
  ]);

  useEffect(() => {
    if (fixedPageMode) {
      return;
    }

    scrollPageRefs.current[Math.max(0, flipIndex - 1)]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [fixedPageMode, flipIndex]);

  useEffect(() => {
    const host = flipbookHostRef.current;
    return () => {
      if (pageFlipInitTimerRef.current) {
        window.clearTimeout(pageFlipInitTimerRef.current);
      }
      cleanupResizeRef.current?.();
      cleanupResizeRef.current = null;
      pageFlipRef.current?.destroy();
      pageFlipRef.current = null;
      host?.replaceChildren();
    };
  }, []);

  const unlockSpeechAndStart = useCallback(() => {
    if (!speechSupported) {
      return;
    }

    const AudioContextClass =
      window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass && !audioContextRef.current) {
      audioContextRef.current = new AudioContextClass();
    }
    void audioContextRef.current?.resume();

    cleanupCurrentSpeechAudio();
    setSpeechError(null);
    setIsSpeechUnlocked(true);
    isReadingActiveRef.current = true;
    setIsReadingActive(true);

    // Prime audio playback inside the user gesture call stack.
    // Some browsers (notably iOS Safari / WKWebView) will reject playback if audio.play()
    // happens only after async work/network completes.
    const primer = new Audio();
    primer.volume = 0;
    primer.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
    speechAudioRef.current = primer;
    preservePreparedSpeechAudioOnceRef.current = true;
    void primer.play().catch(() => undefined);

    if (isOnCover) {
      if (pageFlipRef.current) {
        pageFlipRef.current.flipNext("top");
      } else {
        setFlipIndex(1);
        window.setTimeout(() => readCurrentPage(0, true), 160);
      }
    } else {
      readCurrentPage(pageIndex, true);
    }
  }, [cleanupCurrentSpeechAudio, isOnCover, pageIndex, readCurrentPage, speechSupported]);

  const toggleSpeech = () => {
    if (!speechSupported) {
      return;
    }

    if (!isSpeechUnlocked) {
      unlockSpeechAndStart();
      return;
    }

    if (isReadingActive && !isSpeechPaused) {
      // Only abort synthesis if we are still waiting for the next audio chunk.
      if (isSpeechGenerating || !speechAudioRef.current) {
        speechAbortControllerRef.current?.abort();
      }
      speechAudioRef.current?.pause();
      isReadingActiveRef.current = false;
      setIsReadingActive(false);
      setIsSpeechPaused(true);
      return;
    }

    const pausedAudio = speechAudioRef.current;
    if (pausedAudio && pausedAudio.paused && !pausedAudio.ended) {
      void pausedAudio.play().catch((error: unknown) => {
        setSpeechError(getSpeechPlaybackPrompt(error));
        finishSpeechReading();
      });
      const progressMeta = speechProgressMetaRef.current;
      if (progressMeta) {
        startSpeechProgressTracking(pausedAudio, progressMeta.pageIndex, progressMeta.wordCount, progressMeta.wordOffset);
      }
      isReadingActiveRef.current = true;
      setIsReadingActive(true);
      setIsSpeechPaused(false);
      return;
    }

    isReadingActiveRef.current = true;
    setIsReadingActive(true);
    readCurrentPage(pageIndex);
  };

  const stopSpeech = () => {
    utteranceIdRef.current += 1;
    cleanupCurrentSpeechAudio();
    finishSpeechReading();
  };

  const toggleToolbarCollapsed = useCallback(() => {
    setIsToolbarCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(readerToolbarCollapsedStorageKey, JSON.stringify(next));
      window.requestAnimationFrame(() => pageFlipRef.current?.update());
      return next;
    });
  }, []);

  const averageWpm = sessionStats.seconds > 0 ? Math.max(120, Math.round(sessionStats.words / (sessionStats.seconds / 60))) : 220;
  const remainingWords = useMemo(() => safePages.slice(pageIndex + 1).reduce((sum, page) => sum + countWords(page.text), 0), [pageIndex, safePages]);
  const minutesLeft = Math.max(1, Math.round(remainingWords / averageWpm));
  const finishPrediction = formatFinishPrediction(minutesLeft);

  const saveHighlight = useCallback((color = highlightColor) => {
    const pendingHighlight = pendingHighlightRef.current ?? highlightPopover ?? getPendingHighlightFromCurrentSelection();
    if (!pendingHighlight) {
      return;
    }

    const matchingAnchorHighlights = readerHighlights.filter(
      (highlight) =>
        highlight.pageIndex === pendingHighlight.pageIndex &&
        highlight.occurrence === pendingHighlight.occurrence &&
        highlight.text === pendingHighlight.text
    );
    const existingHighlight = matchingAnchorHighlights.find((highlight) => highlight.color === color);

    if (existingHighlight) {
      const removedHighlights = matchingAnchorHighlights;
      const nextHighlights = readerHighlights.filter((highlight) => !removedHighlights.some((removed) => removed.id === highlight.id));
      setReaderHighlights(nextHighlights);
      saveBookHighlights(bookId, nextHighlights);
      if (!isLocalBook) {
        for (const removedHighlight of removedHighlights) {
          fetch("/api/annotations", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: removedHighlight.id,
              bookId,
              quote: removedHighlight.text,
              color: removedHighlight.color,
              locator: JSON.stringify({ pageIndex: removedHighlight.pageIndex, occurrence: removedHighlight.occurrence }),
            }),
          }).catch(() => undefined);
        }
      }
      setHighlightPopover(null);
      pendingHighlightRef.current = null;
      window.getSelection()?.removeAllRanges();
      return;
    }

    const nextHighlight: ReaderHighlight = {
      id: createClientId("reader-highlight"),
      pageIndex: pendingHighlight.pageIndex,
      text: pendingHighlight.text,
      occurrence: pendingHighlight.occurrence,
      color,
      createdAt: new Date().toISOString(),
    };

    setReaderHighlights((current) => {
      const nextHighlights = [
        ...current.filter((highlight) => !matchingAnchorHighlights.some((matched) => matched.id === highlight.id)),
        nextHighlight,
      ];
      saveBookHighlights(bookId, nextHighlights);
      return nextHighlights;
    });
    if (!isLocalBook) {
      for (const removedHighlight of matchingAnchorHighlights) {
        fetch("/api/annotations", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: removedHighlight.id,
            bookId,
            quote: removedHighlight.text,
            color: removedHighlight.color,
            locator: JSON.stringify({ pageIndex: removedHighlight.pageIndex, occurrence: removedHighlight.occurrence }),
          }),
        }).catch(() => undefined);
      }
      fetch("/api/annotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: nextHighlight.id,
          bookId,
          quote: nextHighlight.text,
          color,
          locator: JSON.stringify({ pageIndex: nextHighlight.pageIndex, occurrence: nextHighlight.occurrence }),
        }),
      }).catch(() => undefined);
    }
    setHighlightPopover(null);
    pendingHighlightRef.current = null;
    window.getSelection()?.removeAllRanges();
  }, [bookId, highlightColor, highlightPopover, isLocalBook, readerHighlights]);

  const handleHighlightToggleClick = useCallback(() => {
    if (pendingHighlightRef.current) {
      saveHighlight(highlightColor);
      setHighlighterMode(true);
      return;
    }
    setHighlighterMode((current) => !current);
  }, [highlightColor, saveHighlight]);

  const commitPendingHighlightFromPageClick = useCallback(
    (target: EventTarget | null) => {
      if (!pendingHighlightRef.current) {
        return;
      }

      const element = target instanceof HTMLElement ? target : null;
      if (element?.closest(".highlight-popover, .reader-topbar, .reader-tts-panel, .reading-ruler")) {
        return;
      }

      if (Date.now() - pendingHighlightCreatedAtRef.current < 180) {
        return;
      }

      saveHighlight(highlightColor);
    },
    [highlightColor, saveHighlight]
  );

  const applyHighlightColor = useCallback(
    (color: string) => {
      setHighlightColor(color);
      saveHighlight(color);
    },
    [saveHighlight]
  );

  const removeHighlight = useCallback((highlightId: string) => {
    const target = readerHighlights.find((highlight) => highlight.id === highlightId);
    const next = readerHighlights.filter((highlight) => highlight.id !== highlightId);
    setReaderHighlights(next);
    saveBookHighlights(bookId, next);

    if (target && !isLocalBook) {
      fetch("/api/annotations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: target.id,
          bookId,
          quote: target.text,
          color: target.color,
          locator: JSON.stringify({ pageIndex: target.pageIndex, occurrence: target.occurrence }),
        }),
      }).catch(() => undefined);
    }

    setHighlightActionPopover(null);
    pendingHighlightRef.current = null;
  }, [bookId, isLocalBook, readerHighlights]);

  const clearHighlightsOnCurrentPage = useCallback(() => {
    if (!readerHighlights.some((highlight) => highlight.pageIndex === pageIndex)) {
      return;
    }

    if (!window.confirm("Are you sure you want to remove all highlights from this page?")) {
      return;
    }

    const removedHighlights = readerHighlights.filter((highlight) => highlight.pageIndex === pageIndex);
    const nextHighlights = readerHighlights.filter((highlight) => highlight.pageIndex !== pageIndex);
    setReaderHighlights(nextHighlights);
    saveBookHighlights(bookId, nextHighlights);
    setHighlightPopover(null);
    setHighlightActionPopover(null);
    pendingHighlightRef.current = null;

    if (!isLocalBook) {
      fetch("/api/annotations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId, pageIndex, ids: removedHighlights.map((highlight) => highlight.id) }),
      }).catch(() => undefined);
    }
  }, [bookId, isLocalBook, pageIndex, readerHighlights]);

  const openXrayPanel = useCallback(() => {
    if (!highlightPopover) {
      return;
    }

    setXrayPanel({
      term: highlightPopover.text,
      matches: buildXrayMatches(safePages, highlightPopover.text),
      profile: buildCommunityProfile(safePages, highlightPopover.text),
      tab: "local",
    });
    setHighlightPopover(null);
    pendingHighlightRef.current = null;
    window.getSelection()?.removeAllRanges();
  }, [highlightPopover, safePages]);

  const clampRulerPosition = useCallback((x: number, y: number, ruler: HTMLDivElement, pinned: boolean) => {
    const rect = ruler.getBoundingClientRect();
    const stageRect = readerStageRef.current?.getBoundingClientRect();
    const maxX = Math.max(0, (pinned ? window.innerWidth : (stageRect?.width ?? window.innerWidth)) - rect.width);
    const maxY = Math.max(0, (pinned ? window.innerHeight : (stageRect?.height ?? window.innerHeight)) - rect.height);

    return {
      x: Math.max(0, Math.min(maxX, x)),
      y: Math.max(0, Math.min(maxY, y)),
    };
  }, []);

  const startRulerDrag = useCallback(
    (ruler: HTMLDivElement, clientX: number, clientY: number) => {
      const rect = ruler.getBoundingClientRect();
      const stageRect = readerStageRef.current?.getBoundingClientRect();
      const offsetX = clientX - rect.left;
      const offsetY = clientY - rect.top;
      const baseX = readingRulerPinned ? 0 : (stageRect?.left ?? 0);
      const baseY = readingRulerPinned ? 0 : (stageRect?.top ?? 0);

      const moveTo = (nextClientX: number, nextClientY: number) => {
        setRulerPosition(
          clampRulerPosition(nextClientX - offsetX - baseX, nextClientY - offsetY - baseY, ruler, readingRulerPinned)
        );
      };

      const moveWithMouse = (moveEvent: MouseEvent) => {
        moveTo(moveEvent.clientX, moveEvent.clientY);
      };

      const moveWithTouch = (moveEvent: TouchEvent) => {
        const touch = moveEvent.touches[0];
        if (!touch) {
          return;
        }
        moveEvent.preventDefault();
        moveTo(touch.clientX, touch.clientY);
      };

      const stopDragging = () => {
        window.removeEventListener("mousemove", moveWithMouse);
        window.removeEventListener("mouseup", stopDragging);
        window.removeEventListener("touchmove", moveWithTouch);
        window.removeEventListener("touchend", stopDragging);
        window.removeEventListener("touchcancel", stopDragging);
      };

      window.addEventListener("mousemove", moveWithMouse);
      window.addEventListener("mouseup", stopDragging);
      window.addEventListener("touchmove", moveWithTouch, { passive: false });
      window.addEventListener("touchend", stopDragging);
      window.addEventListener("touchcancel", stopDragging);
    },
    [clampRulerPosition, readingRulerPinned]
  );

  const handleRulerMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if ((event.target as HTMLElement).closest("button")) {
        return;
      }

      event.preventDefault();
      startRulerDrag(event.currentTarget, event.clientX, event.clientY);
    },
    [startRulerDrag]
  );

  const handleRulerTouchStart = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      if ((event.target as HTMLElement).closest("button")) {
        return;
      }

      const touch = event.touches[0];
      if (!touch) {
        return;
      }

      event.preventDefault();
      startRulerDrag(event.currentTarget, touch.clientX, touch.clientY);
    },
    [startRulerDrag]
  );

  const toggleRulerPinned = useCallback(() => {
    const ruler = rulerRef.current;
    if (!ruler) {
      setReadingRulerPinned((current) => !current);
      return;
    }

    const rect = ruler.getBoundingClientRect();
    const stageRect = readerStageRef.current?.getBoundingClientRect();
    const nextPinned = !readingRulerPinned;
    const nextX = nextPinned ? rect.left : rect.left - (stageRect?.left ?? 0);
    const nextY = nextPinned ? rect.top : rect.top - (stageRect?.top ?? 0);

    setRulerPosition(clampRulerPosition(nextX, nextY, ruler, nextPinned));
    setReadingRulerPinned(nextPinned);
  }, [clampRulerPosition, readingRulerPinned]);

  useEffect(() => {
    return () => {
      utteranceIdRef.current += 1;
      cleanupCurrentSpeechAudio();
      void audioContextRef.current?.close();
    };
  }, [cleanupCurrentSpeechAudio]);

  return (
    <main
      className="reader-shell"
      data-reader-theme={readerTheme}
      data-sprint-active={sprintState.active ? "true" : "false"}
      data-fixed-page-mode={fixedPageMode ? "true" : "false"}
      data-highlighter-mode={highlighterMode ? "true" : "false"}
      data-toolbar-collapsed={isToolbarCollapsed ? "true" : "false"}
      style={readerShellStyle}
    >
      {sprintState.active ? (
        <div className="reader-sprint-progress" aria-hidden="true">
          <span style={{ width: `${Math.round(sprintState.progress * 100)}%` }} />
        </div>
      ) : null}
      <svg className="reader-theme-filters" aria-hidden="true" focusable="false">
        <filter id="wavy" x="-4%" y="-4%" width="108%" height="108%">
          <feTurbulence type="fractalNoise" baseFrequency="0.026 0.075" numOctaves="3" seed="47" result="tornNoise" />
          <feDisplacementMap in="SourceGraphic" in2="tornNoise" scale="7" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <filter id="eink-noise" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.82" numOctaves="2" seed="13" result="inkNoise" />
          <feColorMatrix in="inkNoise" type="saturate" values="0" />
          <feBlend in="SourceGraphic" in2="inkNoise" mode="multiply" />
        </filter>
      </svg>
      {speechError ? (
        <p className="reader-speech-status-sr" role="status">
          {speechError}
        </p>
      ) : null}
      <header className="reader-topbar">
        <button aria-label="Close reader" onClick={() => window.history.back()} className="icon-button">
          <X size={20} />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">{title}</h1>
          <p className="truncate text-xs text-zinc-400">{author ?? format}</p>
        </div>
        <div className="text-xs text-zinc-400">
          {pageIndex + 1} / {safePages.length}
        </div>
        <button
          className={`reader-highlight-toggle ${highlighterMode ? "active" : ""}`}
          aria-pressed={highlighterMode}
          onClick={handleHighlightToggleClick}
        >
          <Highlighter size={16} />
          Highlight
        </button>
      </header>

      <section
        className="reader-stage"
        ref={readerStageRef}
        onMouseDown={(event) => commitPendingHighlightFromPageClick(event.target)}
        onTouchStart={(event) => commitPendingHighlightFromPageClick(event.target)}
      >
        {readingRulerEnabled ? (
          <div
            ref={rulerRef}
            className="reading-ruler"
            data-pinned={readingRulerPinned}
            style={rulerPosition ? { left: `${rulerPosition.x}px`, top: `${rulerPosition.y}px` } : undefined}
            onMouseDown={handleRulerMouseDown}
            onTouchStart={handleRulerTouchStart}
          >
            <button
              className="reading-ruler-pin"
              aria-label={readingRulerPinned ? "Unpin reading ruler" : "Pin reading ruler"}
              aria-pressed={readingRulerPinned}
              onClick={(event) => {
                event.stopPropagation();
                toggleRulerPinned();
              }}
            >
              <Pin size={14} />
            </button>
            <button
              className="reading-ruler-close"
              aria-label="Close reading ruler"
              onClick={(event) => {
                event.stopPropagation();
                setReadingRulerEnabled(false);
              }}
            >
              <X size={14} />
            </button>
          </div>
        ) : null}
        {highlightPopover ? (
          <div
            className="highlight-popover"
            style={{ left: `${highlightPopover.x}px`, top: `${highlightPopover.y}px` }}
            onMouseDown={(event) => {
              if ((event.target as HTMLElement).tagName !== "INPUT") {
                event.preventDefault();
              }
            }}
          >
            <div className="highlight-palette" aria-label="Highlight colors">
              {highlightPalette.map((color) => (
                <button
                  key={color.value}
                  aria-label={`${color.label} highlight`}
                  title={color.label}
                  style={{ backgroundColor: color.value }}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    ignoreNextHighlightColorClickRef.current = true;
                    applyHighlightColor(color.value);
                  }}
                  onTouchStart={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    ignoreNextHighlightColorClickRef.current = true;
                    applyHighlightColor(color.value);
                  }}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (ignoreNextHighlightColorClickRef.current) {
                      ignoreNextHighlightColorClickRef.current = false;
                      return;
                    }
                    applyHighlightColor(color.value);
                  }}
                />
              ))}
            </div>
            <button className="highlight-popover-xray" onClick={openXrayPanel}>
              <Search size={14} />
              X-Ray
            </button>
          </div>
        ) : null}
        {highlightActionPopover ? (
          <div
            className="highlight-popover highlight-action-popover"
            style={{ left: `${highlightActionPopover.x}px`, top: `${highlightActionPopover.y}px` }}
            onMouseDown={(event) => event.preventDefault()}
          >
            <button className="highlight-clear-button" onClick={() => removeHighlight(highlightActionPopover.highlightId)}>
              <Trash2 size={14} />
              Clear Highlight
            </button>
          </div>
        ) : null}
        {xrayPanel ? (
          <aside className="xray-panel" aria-label="X-Ray search results">
            <div className="xray-panel-header">
              <div>
                <span>X-Ray</span>
                <h2>{xrayPanel.term}</h2>
              </div>
              <button aria-label="Close X-Ray panel" onClick={() => setXrayPanel(null)}>
                <X size={18} />
              </button>
            </div>
            <p className="xray-panel-count">
              {xrayPanel.matches.length} occurrence{xrayPanel.matches.length === 1 ? "" : "s"} in this book
            </p>
            <div className="xray-tabs">
              <button
                className={xrayPanel.tab === "local" ? "active" : ""}
                onClick={() => setXrayPanel((current) => (current ? { ...current, tab: "local" } : current))}
              >
                Local Snippets
              </button>
              <button
                className={xrayPanel.tab === "community" ? "active" : ""}
                onClick={() => setXrayPanel((current) => (current ? { ...current, tab: "community" } : current))}
              >
                Explore Community Insights
              </button>
            </div>
            <div className="xray-results">
              {xrayPanel.tab === "community" ? (
                <article className="xray-community-profile">
                  <span>Character Profile</span>
                  <h3>{xrayPanel.profile.role}</h3>
                  <p>{xrayPanel.profile.summary}</p>
                  <small>Notable pages: {xrayPanel.profile.notablePages.length ? xrayPanel.profile.notablePages.join(", ") : "No strong page cluster found"}</small>
                </article>
              ) : xrayPanel.matches.length ? (
                xrayPanel.matches.map((match) => (
                  <button
                    key={match.id}
                    className="xray-result"
                    onClick={() => {
                      goToFlipPage(match.pageIndex + 1);
                    }}
                  >
                    <span>Page {match.pageIndex + 1}</span>
                    <p>{match.snippet}</p>
                  </button>
                ))
              ) : (
                <p className="xray-empty">No other mentions found in the loaded book text.</p>
              )}
            </div>
          </aside>
        ) : null}
        {isPdf && safePages[0]?.loading ? (
          <div className="reader-pdf-loading" role="status">
            <span />
            <p>{pdfError ?? "Rendering PDF pages..."}</p>
          </div>
        ) : null}
        {fixedPageMode ? (
          <div
            ref={flipbookHostRef}
            className="book-container-host"
            data-reader-key={readerDomKey}
            data-highlighter-mode={highlighterMode ? "true" : "false"}
            suppressHydrationWarning
          />
        ) : (
          <ScrollReaderPages
            pages={safePages}
            title={title}
            highlights={readerHighlights}
            bionicReading={bionicReading}
            pageRefs={scrollPageRefs}
          />
        )}
      </section>

      <footer className="reader-tts-panel" data-collapsed={isToolbarCollapsed ? "true" : "false"}>
        <button
          className="reader-toolbar-collapse-toggle"
          aria-label={isToolbarCollapsed ? "Show reader controls" : "Hide reader controls"}
          aria-expanded={!isToolbarCollapsed}
          onClick={toggleToolbarCollapsed}
        >
          {isToolbarCollapsed ? <ChevronsUp size={18} /> : <ChevronsDown size={18} />}
          <span>{isToolbarCollapsed ? "Controls" : "Hide"}</span>
        </button>

        <div className="reader-toolbar-collapsed-actions" aria-hidden={!isToolbarCollapsed}>
          <span className="reader-toolbar-collapsed-status">
            {isReadingActive && !isSpeechPaused ? "Reading" : isSpeechPaused ? "Paused" : "Ready"}
          </span>
          <button
            className="reader-toolbar-mini-button"
            onClick={isSpeechUnlocked ? toggleSpeech : unlockSpeechAndStart}
            disabled={!speechSupported}
            aria-label={isReadingActive && !isSpeechPaused ? "Pause reading" : "Play reading"}
          >
            {isReadingActive && !isSpeechPaused ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
          </button>
          <button
            className="reader-toolbar-mini-button"
            onClick={stopSpeech}
            disabled={!isReadingActive && !isSpeechPaused}
            aria-label="Stop reading"
          >
            <X size={17} />
          </button>
        </div>

        <div className="reader-toolbar-content" aria-hidden={isToolbarCollapsed}>
        <button className="icon-button" onClick={() => goToFlipPage(flipIndex - 1)} disabled={flipIndex === 0}>
          <ChevronLeft size={22} />
        </button>
        <button className="icon-button" onClick={() => goToFlipPage(flipIndex + 1)} disabled={flipIndex === safePages.length}>
          <ChevronRight size={22} />
        </button>

        <div className="reader-tts-divider" />

        {!isSpeechUnlocked ? (
          <button
            className="reader-start-button"
            onClick={unlockSpeechAndStart}
            disabled={!speechSupported}
          >
            Start Reading
          </button>
        ) : (
          <button
            className="reader-play"
            onClick={toggleSpeech}
            disabled={!speechSupported}
          >
            {isReadingActive && !isSpeechPaused ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
            <span>{isReadingActive && !isSpeechPaused ? "Pause" : "Play"}</span>
          </button>
        )}

        <button className="reader-stop-button" onClick={stopSpeech} disabled={!isReadingActive && !isSpeechPaused}>
          Stop
        </button>

        <label className="reader-fixed-mode-toggle">
          <span>Fixed Page Mode</span>
          <input type="checkbox" checked={fixedPageMode} onChange={(event) => toggleFixedPageMode(event.target.checked)} />
        </label>

        <label className="reader-tts-field reader-theme-field">
          <span>Theme</span>
          <select value={readerTheme} onChange={(event) => saveReaderTheme(event.target.value)}>
            <option value="paper">Paper</option>
            <option value="night">Night</option>
            <option value="scroll">Ancient scroll</option>
            <option value="deepsea">Deep Sea</option>
            <option value="eink">E-Ink</option>
            <option value="reseda">Reseda</option>
          </select>
        </label>

        <button className="reader-ruler-toggle" onClick={() => setReadingRulerEnabled((current) => !current)}>
          {readingRulerEnabled ? "Hide Ruler" : "Reading Ruler"}
        </button>

        <div className="reader-toolbar-timer">
          <button className="reader-ruler-toggle" onClick={() => setIsTimerVisible((current) => !current)}>
            {isTimerVisible ? "Hide Timer" : "Timer"}
          </button>
          {isTimerVisible ? <ReadingSprintTimer compact onSprintStateChange={setSprintState} onClose={() => setIsTimerVisible(false)} /> : null}
        </div>

        <div className="reader-text-settings">
          <button
            className="reader-ruler-toggle reader-text-settings-trigger"
            aria-label="Text Settings"
            aria-expanded={isTextSettingsOpen}
            onClick={() => setIsTextSettingsOpen((current) => !current)}
          >
            <Type size={18} />
            Aa
          </button>
          {isTextSettingsOpen ? (
            <div className="reader-text-settings-menu">
              <label>
                <span>Font</span>
                <select value={readerTextSettings.fontFamily} onChange={(event) => updateReaderTextSettings({ fontFamily: event.target.value })}>
                  {readerFontOptions.map((group) => (
                    <optgroup key={group.group} label={group.group}>
                      {group.fonts.map((font) => (
                        <option key={font.label} value={font.value}>
                          {font.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              <label className="reader-settings-switch">
                <span>Bold Text</span>
                <input
                  type="checkbox"
                  checked={readerTextSettings.boldText}
                  onChange={(event) => updateReaderTextSettings({ boldText: event.target.checked })}
                />
              </label>
              <label>
                <span>Font Size {readerTextSettings.fontSize}px</span>
                <input
                  min="12"
                  max="48"
                  step="1"
                  type="range"
                  value={readerTextSettings.fontSize}
                  onChange={(event) => updateReaderTextSettings({ fontSize: Number(event.target.value) })}
                />
              </label>
              <label>
                <span>Line Height {readerTextSettings.lineHeight.toFixed(1)}</span>
                <input
                  min="1"
                  max="2.5"
                  step="0.1"
                  type="range"
                  value={readerTextSettings.lineHeight}
                  onChange={(event) => updateReaderTextSettings({ lineHeight: Number(event.target.value) })}
                />
              </label>
              <label>
                <span>Word Spacing {readerTextSettings.wordSpacing}px</span>
                <input
                  min="0"
                  max="10"
                  step="1"
                  type="range"
                  value={readerTextSettings.wordSpacing}
                  onChange={(event) => updateReaderTextSettings({ wordSpacing: Number(event.target.value) })}
                />
              </label>
              <button
                className="reader-clear-page-highlights"
                disabled={!readerHighlights.some((highlight) => highlight.pageIndex === pageIndex)}
                onClick={clearHighlightsOnCurrentPage}
              >
                <Trash2 size={14} />
                Clear All Highlights on Page
              </button>
            </div>
          ) : null}
        </div>

        <div className="reader-prediction">
          <span>{minutesLeft}m left in chapter</span>
          <strong>{finishPrediction}</strong>
        </div>
        </div>
      </footer>
    </main>
  );
}

function countWords(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function isTrackableWordToken(token: string) {
  return /[A-Za-z0-9]/.test(token);
}

function formatFinishPrediction(minutesLeft: number) {
  if (minutesLeft < 60) {
    return `Finish in about ${minutesLeft}m`;
  }
  const hours = Math.floor(minutesLeft / 60);
  const minutes = minutesLeft % 60;
  if (hours < 24) {
    return `Finish in about ${hours}h ${minutes}m`;
  }
  const days = Math.floor(hours / 24);
  return `Finish in about ${days}d ${hours % 24}h`;
}

function ScrollReaderPages({
  pages,
  title,
  highlights,
  bionicReading,
  pageRefs,
}: {
  pages: FlipPage[];
  title: string;
  highlights: ReaderHighlight[];
  bionicReading: boolean;
  pageRefs: React.MutableRefObject<Array<HTMLElement | null>>;
}) {
  return (
    <div className="reader-scroll-document">
      <article className="reader-scroll-cover">
        <span>ChapterChase</span>
        <h2>{title}</h2>
      </article>
      {pages.map((page, index) => (
        <article
          className={`reader-book-page reader-scroll-page ${page.image ? "reader-pdf-book-page" : ""}`}
          data-page-index={index}
          key={`${index}-${page.title ?? "page"}`}
          ref={(element) => {
            pageRefs.current[index] = element;
          }}
        >
          <div className={`reader-page-content ${page.image ? "reader-pdf-page-content" : ""}`}>
            {page.loading ? (
              <div className="reader-page-spinner" role="status">
                <span />
                <p>Rendering page...</p>
              </div>
            ) : page.image ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={page.image} alt={`Page ${index + 1}`} className="reader-pdf-page-image" loading="lazy" decoding="async" />
                {page.text.trim() ? (
                  <p className="reader-page-text reader-pdf-text-layer whitespace-pre-wrap">
                    {renderHighlightedText(page.text, highlights.filter((highlight) => highlight.pageIndex === index), bionicReading, index)}
                  </p>
                ) : null}
              </>
            ) : (
              <>
                {page.title ? <p className="reader-page-title mb-4 text-xs uppercase tracking-[0.22em]">{page.title}</p> : null}
                <p className="reader-page-text whitespace-pre-wrap">
                  {renderHighlightedText(page.text, highlights.filter((highlight) => highlight.pageIndex === index), bionicReading, index)}
                </p>
              </>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

function loadReaderTextSettings(): ReaderTextSettings {
  if (typeof window === "undefined") {
    return defaultReaderTextSettings;
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(readerTextSettingsStorageKey) ?? "{}") as Partial<ReaderTextSettings>;
    const fontFamily =
      typeof parsed.fontFamily === "string" && readerFontFlatOptions.some((font) => font.value === parsed.fontFamily)
        ? parsed.fontFamily
        : defaultReaderTextSettings.fontFamily;
    return {
      fontFamily,
      fontSize: clampNumber(parsed.fontSize, 12, 48, defaultReaderTextSettings.fontSize),
      lineHeight: clampNumber(parsed.lineHeight, 1, 2.5, defaultReaderTextSettings.lineHeight),
      wordSpacing: clampNumber(parsed.wordSpacing, 0, 10, defaultReaderTextSettings.wordSpacing),
      boldText: parsed.boldText === true,
    };
  } catch {
    return defaultReaderTextSettings;
  }
}

function loadFixedPageMode() {
  if (typeof window === "undefined") {
    return true;
  }

  try {
    const stored = JSON.parse(window.localStorage.getItem(readerFixedPageModeStorageKey) ?? "true") as unknown;
    return typeof stored === "boolean" ? stored : true;
  } catch {
    return true;
  }
}

function loadToolbarCollapsed() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const stored = window.localStorage.getItem(readerToolbarCollapsedStorageKey);
    if (stored !== null) {
      return JSON.parse(stored) === true;
    }
  } catch {
    return window.matchMedia("(max-width: 780px)").matches;
  }

  return window.matchMedia("(max-width: 780px)").matches;
}

function saveReaderTextSettings(settings: ReaderTextSettings) {
  window.localStorage.setItem(readerTextSettingsStorageKey, JSON.stringify(settings));
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

function loadLocalReaderSettings(): LocalReaderSettings {
  if (typeof window === "undefined") {
    return { bionicReading: false, ttsVoice: String(defaultKokoroVoiceId), ttsEngine: "server" };
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem("userSettings") ?? "{}") as {
      activeReadingProfile?: unknown;
      ttsVoice?: unknown;
      ttsEngine?: unknown;
      bionicReading?: unknown;
    };
    const activeReadingProfile = typeof parsed.activeReadingProfile === "string" ? parsed.activeReadingProfile : undefined;
    return {
      activeReadingProfile,
      ttsVoice: String(resolveKokoroVoiceId(parsed.ttsVoice ?? defaultKokoroVoiceId)),
      ttsEngine: normalizeTtsEngine(parsed.ttsEngine),
      bionicReading: parsed.bionicReading === true,
    };
  } catch {
    return { bionicReading: false, ttsVoice: String(defaultKokoroVoiceId), ttsEngine: "server" };
  }
}

function warmKokoroTts(voiceId: string) {
  const body = JSON.stringify({ voiceId });
  if (typeof window.fetch === "function") {
    void window
      .fetch("/api/tts/warmup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      })
      .catch(() => undefined);
    return;
  }

  const request = new XMLHttpRequest();
  request.open("POST", "/api/tts/warmup");
  request.setRequestHeader("Content-Type", "application/json");
  request.send(body);
}

function getSpeechPlaybackPrompt(error: unknown) {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "Speech is ready. Press Play to start.";
  }
  if (error instanceof Error && /user didn't interact|notallowed/i.test(error.message)) {
    return "Speech is ready. Press Play to start.";
  }
  return error instanceof Error ? error.message : "Press Play to start generated speech.";
}

async function fetchPreferredTtsAudioBlob(
  text: string,
  voiceId: string,
  signal: AbortSignal,
  timeoutMs = ttsChunkRequestTimeoutMs
): Promise<Blob> {
  return fetchTtsAudioBlob(text, voiceId, signal, timeoutMs);
}

async function fetchTtsAudioBlob(text: string, voiceId: string, signal: AbortSignal, timeoutMs = ttsChunkRequestTimeoutMs): Promise<Blob> {
  const body = JSON.stringify({ text, voiceId });
  const requestController = new AbortController();
  const timeout = window.setTimeout(() => requestController.abort("timeout"), timeoutMs);
  const abortRequest = () => requestController.abort(signal.reason ?? "aborted");
  if (signal.aborted) {
    abortRequest();
  } else {
    signal.addEventListener("abort", abortRequest, { once: true });
  }

  if (typeof window.fetch === "function") {
    try {
      const response = await window.fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: requestController.signal,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Unable to synthesize speech.");
      }

      return response.blob();
    } catch (error) {
      if (requestController.signal.aborted && !signal.aborted) {
        throw new Error("Speech took too long to generate audio. Try again in a moment while the model finishes warming up.");
      }
      throw error;
    } finally {
      window.clearTimeout(timeout);
      signal.removeEventListener("abort", abortRequest);
    }
  }

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.timeout = timeoutMs;
    request.open("POST", "/api/tts");
    request.responseType = "blob";
    request.setRequestHeader("Content-Type", "application/json");
    request.onload = () => {
      window.clearTimeout(timeout);
      signal.removeEventListener("abort", abortRequest);
      if (request.status >= 200 && request.status < 300) {
        resolve(request.response);
        return;
      }
      reject(new Error("Unable to synthesize speech."));
    };
    request.onerror = () => {
      window.clearTimeout(timeout);
      signal.removeEventListener("abort", abortRequest);
      reject(new Error("Unable to synthesize speech."));
    };
    request.ontimeout = () => {
      window.clearTimeout(timeout);
      signal.removeEventListener("abort", abortRequest);
      reject(new Error("Speech took too long to generate audio. Try again in a moment while the model finishes warming up."));
    };
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timeout);
        signal.removeEventListener("abort", abortRequest);
        request.abort();
        reject(new DOMException("Speech request was aborted.", "AbortError"));
      },
      { once: true }
    );
    request.send(body);
  });
}

async function fetchBookFileBlob(bookId: string) {
  const offlineBook = await getOfflineBook(bookId).catch(() => null);
  if (offlineBook?.blob) {
    return offlineBook.blob;
  }

  const response = await fetch(`/api/books/${bookId}/file`);
  if (!response.ok) {
    throw new Error("Unable to load PDF file.");
  }

  return response.blob();
}

function buildXrayMatches(pages: FlipPage[], rawTerm: string): XRayMatch[] {
  const term = rawTerm.trim();
  if (!term) {
    return [];
  }

  const matches: XRayMatch[] = [];
  const lowerTerm = term.toLocaleLowerCase();

  for (const [pageIndex, page] of pages.entries()) {
    if (!page.text.trim()) {
      continue;
    }

    const lowerText = page.text.toLocaleLowerCase();
    let cursor = 0;
    let occurrence = 0;

    while (cursor < lowerText.length) {
      const index = lowerText.indexOf(lowerTerm, cursor);
      if (index === -1) {
        break;
      }

      matches.push({
        id: `${pageIndex}-${index}-${occurrence}`,
        pageIndex,
        snippet: createXraySnippet(page.text, index, term.length),
      });
      occurrence += 1;
      cursor = index + term.length;
    }
  }

  return matches;
}

function buildCommunityProfile(pages: FlipPage[], rawTerm: string): XRayProfile {
  const matches = buildXrayMatches(pages, rawTerm);
  const notablePages = [...new Set(matches.slice(0, 5).map((match) => match.pageIndex + 1))];
  const term = rawTerm.trim();
  const early = matches.some((match) => match.pageIndex < Math.max(3, pages.length * 0.2));
  const late = matches.some((match) => match.pageIndex > pages.length * 0.65);
  const frequency = matches.length;
  const role = frequency > 20 ? "Major recurring figure or central term" : frequency > 6 ? "Supporting figure or repeated motif" : "Briefly mentioned figure or concept";
  const arc = early && late ? "appears across the arc of the book" : late ? "becomes more relevant later in the book" : "is concentrated in a smaller section of the book";

  return {
    role,
    summary: `${term} is mentioned ${frequency} time${frequency === 1 ? "" : "s"} and ${arc}. This profile is generated from the local book text and summarizes community-style context without revealing full passages.`,
    notablePages,
  };
}

function createXraySnippet(text: string, index: number, length: number) {
  const contextLength = 90;
  const start = Math.max(0, index - contextLength);
  const end = Math.min(text.length, index + length + contextLength);
  const prefix = start > 0 ? "... " : "";
  const suffix = end < text.length ? " ..." : "";
  return `${prefix}${text.slice(start, end).replace(/\s+/g, " ").trim()}${suffix}`;
}

function getHighlightsStorageKey(bookId: string) {
  return `chapterchase:book:${bookId}:highlights`;
}

function loadBookHighlights(bookId: string): ReaderHighlight[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(getHighlightsStorageKey(bookId)) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isReaderHighlight) : [];
  } catch {
    return [];
  }
}

function saveBookHighlights(bookId: string, highlights: ReaderHighlight[]) {
  window.localStorage.setItem(getHighlightsStorageKey(bookId), JSON.stringify(highlights));
}

function parseHighlightLocator(locator: string | null): Pick<ReaderHighlight, "pageIndex" | "occurrence"> | null {
  if (!locator) {
    return null;
  }

  try {
    const parsed = JSON.parse(locator) as { pageIndex?: unknown; occurrence?: unknown };
    if (typeof parsed.pageIndex !== "number" || typeof parsed.occurrence !== "number") {
      return null;
    }
    return { pageIndex: parsed.pageIndex, occurrence: parsed.occurrence };
  } catch {
    return null;
  }
}

function getHighlightAnchorKey(highlight: Pick<ReaderHighlight, "pageIndex" | "occurrence" | "text" | "color">) {
  return `${highlight.pageIndex}:${highlight.occurrence}:${highlight.text}:${highlight.color}`;
}

function isReaderHighlight(value: unknown): value is ReaderHighlight {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ReaderHighlight>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.pageIndex === "number" &&
    typeof candidate.text === "string" &&
    typeof candidate.occurrence === "number" &&
    typeof candidate.color === "string"
  );
}

function getSelectedReaderTextElement(selection: Selection) {
  const anchor = selection.anchorNode;
  const focus = selection.focusNode;
  const anchorTextElement = anchor instanceof Element ? anchor.closest(".reader-page-text") : anchor?.parentElement?.closest(".reader-page-text");
  const focusTextElement = focus instanceof Element ? focus.closest(".reader-page-text") : focus?.parentElement?.closest(".reader-page-text");

  if (anchorTextElement && anchorTextElement === focusTextElement) {
    return anchorTextElement as HTMLElement;
  }

  return null;
}

function getPendingHighlightFromCurrentSelection(): Pick<HighlightPopover, "pageIndex" | "text" | "occurrence"> | null {
  const selection = window.getSelection();
  const selectedText = selection?.toString().trim() ?? "";
  if (!selection || selection.rangeCount === 0 || selectedText.length < 2) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const textElement = getSelectedReaderTextElement(selection);
  const article = textElement?.closest<HTMLElement>(".reader-book-page");
  const selectedPageIndex = Number(article?.dataset.pageIndex);
  if (!textElement || !Number.isFinite(selectedPageIndex)) {
    return null;
  }

  const details = getSelectionDetails(textElement, range);
  if (!details || details.text.length < 2) {
    return null;
  }

  return {
    pageIndex: selectedPageIndex,
    text: details.text,
    occurrence: details.occurrence,
  };
}

function getSelectionDetails(textElement: HTMLElement, range: Range): { text: string; occurrence: number } | null {
  const preSelectionRange = range.cloneRange();
  preSelectionRange.selectNodeContents(textElement);
  preSelectionRange.setEnd(range.startContainer, range.startOffset);

  const fullText = textElement.textContent ?? "";
  const startOffset = preSelectionRange.toString().length;
  const rangeText = range.toString();
  const rawText = fullText.slice(startOffset, startOffset + rangeText.length);
  const leadingWhitespace = rawText.match(/^\s*/)?.[0].length ?? 0;
  const trailingWhitespace = rawText.match(/\s*$/)?.[0].length ?? 0;
  const text = rawText.slice(leadingWhitespace, rawText.length - trailingWhitespace);

  if (!text) {
    return null;
  }

  const occurrence = countOccurrences(fullText.slice(0, startOffset + leadingWhitespace), text);
  return { text, occurrence };
}

function countOccurrences(haystack: string, needle: string) {
  if (!needle) {
    return 0;
  }

  let count = 0;
  let cursor = 0;
  while (cursor < haystack.length) {
    const nextIndex = haystack.indexOf(needle, cursor);
    if (nextIndex === -1) {
      break;
    }
    count += 1;
    cursor = nextIndex + needle.length;
  }
  return count;
}

function appendHighlightedText(
  container: HTMLElement,
  text: string,
  highlights: ReaderHighlight[],
  bionicReading: boolean,
  pageIndex: number
) {
  const ranges = highlights
    .map((highlight) => {
      const start = findOccurrenceIndex(text, highlight.text, highlight.occurrence);
      return start >= 0 ? { start, end: start + highlight.text.length, highlight } : null;
    })
    .filter((range): range is { start: number; end: number; highlight: ReaderHighlight } => Boolean(range))
    .sort((a, b) => a.start - b.start);

  let cursor = 0;
  const tracker: ReaderWordTracker = { pageIndex, nextWordIndex: 0 };
  for (const range of ranges) {
    if (range.start < cursor) {
      continue;
    }

    if (range.start > cursor) {
      appendReaderText(container, text.slice(cursor, range.start), bionicReading, tracker);
    }

    const mark = document.createElement("mark");
    mark.className = "reader-highlight";
    mark.dataset.highlightId = range.highlight.id;
    mark.style.backgroundColor = range.highlight.color;
    appendReaderText(mark, text.slice(range.start, range.end), bionicReading, tracker);
    container.appendChild(mark);
    cursor = range.end;
  }

  if (cursor < text.length) {
    appendReaderText(container, text.slice(cursor), bionicReading, tracker);
  }
}

function appendReaderText(container: HTMLElement, text: string, bionicReading: boolean, tracker?: ReaderWordTracker) {
  for (const token of text.split(/(\s+)/)) {
    if (!token || /^\s+$/.test(token)) {
      container.appendChild(document.createTextNode(token));
      continue;
    }

    if (!tracker || !isTrackableWordToken(token)) {
      if (bionicReading) {
        appendBionicToken(container, token);
      } else {
        container.appendChild(document.createTextNode(token));
      }
      continue;
    }

    const word = document.createElement("span");
    word.className = "reader-word";
    word.dataset.pageIndex = String(tracker.pageIndex);
    word.dataset.wordIndex = String(tracker.nextWordIndex);
    tracker.nextWordIndex += 1;

    if (bionicReading) {
      appendBionicToken(word, token);
    } else {
      word.textContent = token;
    }
    container.appendChild(word);
  }
}

function appendBionicToken(container: HTMLElement, token: string) {
  const match = /^([^A-Za-z0-9]*)([A-Za-z0-9]+(?:['\u2019-][A-Za-z0-9]+)*)([^A-Za-z0-9]*)$/.exec(token);
  if (!match) {
    container.appendChild(document.createTextNode(token));
    return;
  }

  const [, leading, word, trailing] = match;
  const boldLength = Math.max(1, Math.ceil(word.length * 0.4));
  if (leading) {
    container.appendChild(document.createTextNode(leading));
  }

  const bold = document.createElement("b");
  bold.textContent = word.slice(0, boldLength);
  container.appendChild(bold);
  container.appendChild(document.createTextNode(word.slice(boldLength)));

  if (trailing) {
    container.appendChild(document.createTextNode(trailing));
  }
}

function renderHighlightedText(text: string, highlights: ReaderHighlight[], bionicReading: boolean, pageIndex: number) {
  const ranges = highlights
    .map((highlight) => {
      const start = findOccurrenceIndex(text, highlight.text, highlight.occurrence);
      return start >= 0 ? { start, end: start + highlight.text.length, highlight } : null;
    })
    .filter((range): range is { start: number; end: number; highlight: ReaderHighlight } => Boolean(range))
    .sort((a, b) => a.start - b.start);

  const nodes: ReactNode[] = [];
  let cursor = 0;
  const tracker: ReaderWordTracker = { pageIndex, nextWordIndex: 0 };

  for (const range of ranges) {
    if (range.start < cursor) {
      continue;
    }

    if (range.start > cursor) {
      nodes.push(...renderReaderText(text.slice(cursor, range.start), bionicReading, `text-${cursor}`, tracker));
    }

    nodes.push(
      <mark
        className="reader-highlight"
        data-highlight-id={range.highlight.id}
        key={range.highlight.id}
        style={{ backgroundColor: range.highlight.color }}
      >
        {renderReaderText(text.slice(range.start, range.end), bionicReading, `mark-${range.highlight.id}`, tracker)}
      </mark>
    );
    cursor = range.end;
  }

  if (cursor < text.length) {
    nodes.push(...renderReaderText(text.slice(cursor), bionicReading, `text-${cursor}`, tracker));
  }

  return nodes;
}

function renderReaderText(text: string, bionicReading: boolean, keyPrefix: string, tracker?: ReaderWordTracker): ReactNode[] {
  return text.split(/(\s+)/).map((token, index) => {
    if (!token || /^\s+$/.test(token)) {
      return token;
    }

    if (!tracker || !isTrackableWordToken(token)) {
      return bionicReading ? renderBionicToken(token, `${keyPrefix}-${index}`) : token;
    }

    const wordIndex = tracker.nextWordIndex;
    tracker.nextWordIndex += 1;

    return (
      <span className="reader-word" data-page-index={tracker.pageIndex} data-word-index={wordIndex} key={`${keyPrefix}-${index}`}>
        {bionicReading ? renderBionicTokenContent(token) : token}
      </span>
    );
  });
}

function renderBionicToken(token: string, key: string) {
  return <span key={key}>{renderBionicTokenContent(token)}</span>;
}

function renderBionicTokenContent(token: string) {
  const match = /^([^A-Za-z0-9]*)([A-Za-z0-9]+(?:['\u2019-][A-Za-z0-9]+)*)([^A-Za-z0-9]*)$/.exec(token);
  if (!match) {
    return token;
  }

  const [, leading, word, trailing] = match;
  const boldLength = Math.max(1, Math.ceil(word.length * 0.4));
  return (
    <>
      {leading}
      <b>{word.slice(0, boldLength)}</b>
      {word.slice(boldLength)}
      {trailing}
    </>
  );
}

function findOccurrenceIndex(text: string, needle: string, occurrence: number) {
  let cursor = 0;
  for (let index = 0; index <= occurrence; index += 1) {
    const nextIndex = text.indexOf(needle, cursor);
    if (nextIndex === -1) {
      return -1;
    }
    if (index === occurrence) {
      return nextIndex;
    }
    cursor = nextIndex + needle.length;
  }

  return -1;
}

function createCoverPageElement({ title, author, format }: { title: string; author: string | null; format: string }) {
  const article = document.createElement("article");
  article.className = "reader-book-page reader-book-cover";
  article.dataset.density = "hard";

  const content = document.createElement("div");
  content.className = "reader-cover-content";

  const formatLabel = document.createElement("p");
  formatLabel.className = "text-xs uppercase tracking-[0.28em] text-sky-200";
  formatLabel.textContent = format;

  const heading = document.createElement("h2");
  heading.textContent = title;

  const authorText = document.createElement("p");
  authorText.textContent = author ?? "Unknown author";

  content.append(formatLabel, heading, authorText);
  article.appendChild(content);
  return article;
}

function createContentPageElement(page: FlipPage, index: number, highlights: ReaderHighlight[], bionicReading: boolean) {
  const article = document.createElement("article");
  article.className = "reader-book-page";
  article.dataset.pageIndex = String(index);

  const content = document.createElement("div");
  content.className = "reader-page-content";

  if (page.loading) {
    const spinner = document.createElement("div");
    spinner.className = "reader-page-spinner";
    spinner.setAttribute("role", "status");
    const spinnerIcon = document.createElement("span");
    const spinnerText = document.createElement("p");
    spinnerText.textContent = "Rendering page...";
    spinner.append(spinnerIcon, spinnerText);
    content.appendChild(spinner);
  } else if (page.image) {
    article.classList.add("reader-pdf-book-page");
    content.classList.add("reader-pdf-page-content");
    const image = document.createElement("img");
    image.src = page.image;
    image.alt = `Page ${index + 1}`;
    image.className = "reader-pdf-page-image";
    image.loading = "lazy";
    image.decoding = "async";
    content.appendChild(image);

    if (page.text.trim()) {
      const text = document.createElement("p");
      text.className = "reader-page-text reader-pdf-text-layer whitespace-pre-wrap text-sm leading-6";
      appendHighlightedText(text, page.text, highlights.filter((highlight) => highlight.pageIndex === index), bionicReading, index);
      content.appendChild(text);
    }
  } else {
    if (page.title) {
      const pageTitle = document.createElement("p");
      pageTitle.className = "reader-page-title mb-4 text-xs uppercase tracking-[0.22em]";
      pageTitle.textContent = page.title;
      content.appendChild(pageTitle);
    }

    const text = document.createElement("p");
    text.className = "reader-page-text whitespace-pre-wrap text-lg leading-9 md:text-xl md:leading-10";
    appendHighlightedText(text, page.text, highlights.filter((highlight) => highlight.pageIndex === index), bionicReading, index);
    content.appendChild(text);
  }

  article.appendChild(content);
  return article;
}

function getResponsivePageFlipSize() {
  const viewportWidth = Math.max(320, window.innerWidth);
  const viewportHeight = Math.max(480, window.innerHeight);
  const isPortrait = viewportHeight >= viewportWidth;
  const toolbarCollapsed = document.querySelector(".reader-shell")?.getAttribute("data-toolbar-collapsed") === "true";
  const horizontalChrome = isPortrait ? 18 : 36;
  const verticalChrome = toolbarCollapsed ? (isPortrait ? 82 : 96) : isPortrait ? 116 : 132;
  const availableWidth = Math.max(300, viewportWidth - horizontalChrome);
  const availableHeight = Math.max(420, viewportHeight - verticalChrome);
  const pageWidth = isPortrait ? availableWidth : Math.floor(availableWidth / 2);

  return {
    mode: isPortrait ? "portrait" : "landscape",
    width: pageWidth,
    height: availableHeight,
    minWidth: Math.max(280, Math.floor(pageWidth * 0.7)),
    maxWidth: pageWidth,
    minHeight: Math.max(380, Math.floor(availableHeight * 0.7)),
    maxHeight: availableHeight,
  } as const;
}

function getScrollReadableAreaSize() {
  const pageFlipSize = getResponsivePageFlipSize();
  return {
    width: Math.max(220, Math.floor(pageFlipSize.width * 0.76)),
    height: Math.max(300, Math.floor(pageFlipSize.height * 0.72)),
  };
}

async function renderPdfPages(
  pdf: PDFDocumentProxy,
  startPage: number,
  endPage: number,
  readableArea: { width: number; height: number }
): Promise<FlipPage[]> {
  const renderedPages: FlipPage[] = [];

  for (let pageNumber = startPage; pageNumber <= endPage; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const nativeViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(readableArea.width / nativeViewport.width, readableArea.height / nativeViewport.height);
    const viewport = page.getViewport({ scale: Math.max(0.6, scale) });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) {
      renderedPages.push({ text: "", loading: true });
      continue;
    }

    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    const textContent = await page.getTextContent();
    const text = textContent.items.map((item) => ("str" in item ? item.str : "")).join(" ").replace(/\s+/g, " ").trim();

    renderedPages.push({
      title: `Page ${pageNumber}`,
      text,
      image: canvas.toDataURL("image/webp", 0.92),
    });
  }

  return renderedPages;
}
