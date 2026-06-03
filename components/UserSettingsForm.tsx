"use client";

import Link from "next/link";
import { Plus, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { defaultKokoroVoiceId, kokoroVoices, resolveKokoroVoiceId } from "@/lib/kokoro-voices";
import { normalizeSettingsSection, settingsSectionPath, settingsSections, type SettingsSection } from "@/lib/settings-tabs";
import { normalizeTtsEngine, type TtsEngine } from "@/lib/tts-client";

type ReadingProfile = {
  id: string;
  name: string;
  theme: "paper" | "night" | "scroll" | "eink" | "reseda" | "deepsea";
  fontScale: number;
  lineHeight: number;
};

type SettingsUser = {
  name: string;
  email: string;
  readerTheme: string;
  ttsVoice: string;
  uiLayout: string;
  defaultReadingMode: string;
  disableAnimations: boolean;
  annotationHighlightColors: string;
  shareProfile: boolean;
  shareSeriesReviews: boolean;
  viewSharedAnnotations: boolean;
  readingProfiles: string;
};

type HighlightedAnnotation = {
  id: string;
  quote: string;
  note: string | null;
  color: string;
  locator: string | null;
  book: {
    id: string;
    title: string;
    author: string | null;
  };
};

const defaultColors = ["#facc15", "#38bdf8", "#fb7185", "#4ade80"];
const defaultProfiles: ReadingProfile[] = [
  { id: "paper", name: "Paper", theme: "paper", fontScale: 1, lineHeight: 1.55 },
  { id: "night", name: "Night Mode", theme: "night", fontScale: 1, lineHeight: 1.6 },
  { id: "scroll", name: "Ancient Scroll", theme: "scroll", fontScale: 1.06, lineHeight: 1.7 },
  { id: "eink", name: "E-Ink", theme: "eink", fontScale: 1, lineHeight: 1.58 },
  { id: "reseda", name: "Reseda", theme: "reseda", fontScale: 1, lineHeight: 1.62 },
  { id: "deepsea", name: "Deep Sea", theme: "deepsea", fontScale: 1, lineHeight: 1.62 },
];

export function UserSettingsForm({ user }: { user: SettingsUser }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = normalizeSettingsSection(searchParams.get("section"));
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);
  const [form, setForm] = useState(() => ({
    ...user,
    ttsVoice: String(resolveKokoroVoiceId(user.ttsVoice)),
    annotationHighlightColors: parseColors(user.annotationHighlightColors),
    readingProfiles: parseProfiles(user.readingProfiles),
  }));
  const [localSettingsReady, setLocalSettingsReady] = useState(false);
  const [bionicReading, setBionicReading] = useState(false);
  const ttsEngine: TtsEngine = "server";
  const [highlightedAnnotations, setHighlightedAnnotations] = useState<HighlightedAnnotation[]>([]);
  const [highlightedWordsStatus, setHighlightedWordsStatus] = useState<string | null>(null);
  const selectedReaderTheme = resolveReaderTheme(form.readerTheme);

  const payload = useMemo(
    () => ({
      ...form,
      annotationHighlightColors: form.annotationHighlightColors,
      readingProfiles: form.readingProfiles,
    }),
    [form]
  );

  function update<K extends keyof typeof form>(field: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function switchSection(section: SettingsSection) {
    router.replace(settingsSectionPath(section), { scroll: false });
  }

  function updateColor(index: number, value: string) {
    setForm((current) => ({
      ...current,
      annotationHighlightColors: current.annotationHighlightColors.map((color, colorIndex) => (colorIndex === index ? value : color)),
    }));
  }

  useEffect(() => {
    if (!localSettingsReady) {
      return;
    }

    saveLocalUserSettings({
      activeReadingProfile: form.readerTheme,
      ttsVoice: form.ttsVoice,
      ttsEngine,
      bionicReading,
      readingProfiles: form.readingProfiles,
    });
  }, [bionicReading, form.readerTheme, form.readingProfiles, form.ttsVoice, localSettingsReady, ttsEngine]);

  useEffect(() => {
    if (activeTab !== "Social" || highlightedAnnotations.length) {
      return;
    }

    let cancelled = false;
    fetch("/api/annotations")
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("Unable to load highlighted words"))))
      .then((data: { annotations?: HighlightedAnnotation[] }) => {
        if (!cancelled) {
          setHighlightedAnnotations(Array.isArray(data.annotations) ? data.annotations : []);
          setHighlightedWordsStatus(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHighlightedWordsStatus("Unable to load highlighted words.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, highlightedAnnotations.length]);

  useEffect(() => {
    const refreshLocalUserSettings = () => {
      const localSettings = loadLocalUserSettings();
      setBionicReading(localSettings.bionicReading);
      setLocalSettingsReady(true);
    };
    refreshLocalUserSettings();
    window.addEventListener("chapterchase:user-settings", refreshLocalUserSettings);
    return () => {
      window.removeEventListener("chapterchase:user-settings", refreshLocalUserSettings);
    };
  }, []);

  async function save() {
    setStatus(null);
    const response = await fetch("/api/user/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      setStatus("Unable to save settings.");
      return;
    }

    setStatus("Settings saved.");
    startTransition(() => router.refresh());
  }

  async function clearLibrary() {
    if (!window.confirm("This will only remove the entry from your library; your files will remain safe.")) {
      return;
    }

    setStatus(null);
    const response = await fetch("/api/admin/library/clear", { method: "POST" });
    if (!response.ok) {
      setStatus("Unable to clear library entries.");
      return;
    }

    setStatus("Library entries cleared. Your book files were not deleted.");
    startTransition(() => router.refresh());
  }

  return (
    <section className="preferences-dashboard">
      <aside className="preferences-tabs" aria-label="Preferences sections">
        {settingsSections.map((tab) => (
          <button key={tab} className={activeTab === tab ? "active" : ""} onClick={() => switchSection(tab)}>
            {tab}
          </button>
        ))}
      </aside>

      <div className="preferences-panel">
        {activeTab === "Account" ? (
          <div className="settings-section">
            <h2>Account</h2>
            <p>{form.email}</p>
            <label className="settings-field">
              <span>Display name</span>
              <input value={form.name} onChange={(event) => update("name", event.target.value)} />
            </label>
          </div>
        ) : null}

        {activeTab === "Preferences" ? (
          <div className="settings-section">
            <h2>Preferences</h2>
            <div className="settings-grid">
              <label className="settings-field">
                <span>Preferred library layout</span>
                <select value={form.uiLayout} onChange={(event) => update("uiLayout", event.target.value)}>
                  <option value="flat">Flat grid</option>
                  <option value="shelf">Wooden shelf</option>
                </select>
              </label>
              <label className="settings-field">
                <span>Default reader mode</span>
                <select value={form.defaultReadingMode} onChange={(event) => update("defaultReadingMode", event.target.value)}>
                  <option value="auto">Auto</option>
                  <option value="portrait">Portrait</option>
                  <option value="landscape">Landscape</option>
                </select>
              </label>
              <label className="settings-field">
                <span>Speech voice</span>
                <select value={form.ttsVoice} onChange={(event) => update("ttsVoice", String(resolveKokoroVoiceId(event.target.value)))}>
                  {kokoroVoices.map((voice) => (
                    <option key={voice.id} value={voice.id}>
                      {voice.label}
                    </option>
                  ))}
                </select>
              </label>
              <Toggle label="Disable Animations" checked={form.disableAnimations} onChange={(value) => update("disableAnimations", value)} />
            </div>
            <div className="settings-danger-zone">
              <div>
                <strong>Clear Library</strong>
                <p>Remove all indexed book entries from ChapterChase while preserving every physical file.</p>
              </div>
              <button className="kavita-danger-button" onClick={clearLibrary}>
                Clear Library
              </button>
            </div>
          </div>
        ) : null}

        {activeTab === "Reading Profiles" ? (
          <div className="settings-section">
            <h2>Reading Profiles</h2>
            <label className="settings-field">
              <span>Default reader theme</span>
              <select value={selectedReaderTheme} onChange={(event) => update("readerTheme", event.target.value)}>
                {defaultProfiles.map((profile) => (
                  <option key={profile.theme} value={profile.theme}>
                    {themeLabel(profile.theme)}
                  </option>
                ))}
              </select>
            </label>
            <Toggle label="Bionic Reading" checked={bionicReading} onChange={setBionicReading} />
            <article className="reader-theme-preview profile-card" data-reader-theme={selectedReaderTheme} aria-live="polite">
              <div className="reader-theme-preview-page">
                <strong>{themeLabel(selectedReaderTheme)}</strong>
                <p>
                  The next chapter opened with a quiet page, a steady margin, and enough contrast for the words to settle clearly into place.
                </p>
              </div>
            </article>
          </div>
        ) : null}

        {activeTab === "Annotations" ? (
          <div className="settings-section">
            <h2>Annotations</h2>
            <div className="annotation-colors">
              {form.annotationHighlightColors.map((color, index) => (
                <label key={`${color}-${index}`} className="color-chip">
                  <input type="color" value={color} onChange={(event) => updateColor(index, event.target.value)} />
                  <span>{color}</span>
                  {form.annotationHighlightColors.length > 1 ? (
                    <button
                      aria-label="Remove color"
                      onClick={() =>
                        update(
                          "annotationHighlightColors",
                          form.annotationHighlightColors.filter((_, colorIndex) => colorIndex !== index)
                        )
                      }
                    >
                      <X size={14} />
                    </button>
                  ) : null}
                </label>
              ))}
            </div>
            <button className="secondary-button" onClick={() => update("annotationHighlightColors", [...form.annotationHighlightColors, "#a78bfa"])}>
              <Plus size={16} /> Add Highlight Color
            </button>
          </div>
        ) : null}

        {activeTab === "Social" ? (
          <div className="settings-section">
            <h2>Highlighted words</h2>
            <div className="highlighted-words-list">
              {highlightedAnnotations.map((annotation) => (
                <Link key={annotation.id} className="highlighted-word-row" href={`/reader/${annotation.book.id}${getAnnotationReaderQuery(annotation.locator)}`}>
                  <span style={{ borderColor: annotation.color }}>{formatHighlightedQuote(annotation.quote)}</span>
                  <small>
                    {annotation.book.title}
                    {annotation.book.author ? ` by ${annotation.book.author}` : ""}
                  </small>
                </Link>
              ))}
              {!highlightedAnnotations.length && !highlightedWordsStatus ? <p>No highlighted words yet.</p> : null}
              {highlightedWordsStatus ? <p>{highlightedWordsStatus}</p> : null}
            </div>
          </div>
        ) : null}

        <div className="settings-actions">
          <button className="kavita-save-button" onClick={save} disabled={isPending}>
            Save Preferences
          </button>
          {status ? <p>{status}</p> : null}
        </div>
      </div>
    </section>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="settings-toggle">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function parseColors(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) && parsed.length ? parsed.filter((color) => typeof color === "string") : defaultColors;
  } catch {
    return defaultColors;
  }
}

function parseProfiles(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) && parsed.length ? (parsed as ReadingProfile[]) : cloneDefaultProfiles();
  } catch {
    return cloneDefaultProfiles();
  }
}

function cloneDefaultProfiles() {
  return defaultProfiles.map((profile) => ({ ...profile }));
}

function resolveReaderTheme(value: string): ReadingProfile["theme"] {
  return defaultProfiles.find((profile) => profile.theme === value)?.theme ?? "paper";
}

function loadLocalUserSettings() {
  if (typeof window === "undefined") {
    return { bionicReading: false, ttsVoice: String(defaultKokoroVoiceId), ttsEngine: "server" as TtsEngine };
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem("userSettings") ?? "{}") as { bionicReading?: unknown; ttsVoice?: unknown; ttsEngine?: unknown };
    return {
      bionicReading: parsed.bionicReading === true,
      ttsVoice: String(resolveKokoroVoiceId(parsed.ttsVoice ?? defaultKokoroVoiceId)),
      ttsEngine: normalizeTtsEngine(parsed.ttsEngine),
    };
  } catch {
    return { bionicReading: false, ttsVoice: String(defaultKokoroVoiceId), ttsEngine: "server" as TtsEngine };
  }
}

function saveLocalUserSettings(settings: { activeReadingProfile: string; ttsVoice: string; ttsEngine: TtsEngine; bionicReading: boolean; readingProfiles: ReadingProfile[] }) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem("userSettings", JSON.stringify(settings));
  window.dispatchEvent(new CustomEvent("chapterchase:user-settings"));
}

function formatHighlightedQuote(value: string) {
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed;
}

function getAnnotationReaderQuery(locator: string | null) {
  if (!locator) {
    return "";
  }

  try {
    const parsed = JSON.parse(locator) as { pageIndex?: unknown };
    return typeof parsed.pageIndex === "number" && Number.isFinite(parsed.pageIndex) ? `?page=${Math.max(0, parsed.pageIndex)}` : "";
  } catch {
    return "";
  }
}

function themeLabel(theme: ReadingProfile["theme"]) {
  if (theme === "scroll") {
    return "Ancient Scroll";
  }
  if (theme === "night") {
    return "Night";
  }
  if (theme === "eink") {
    return "E-Ink";
  }
  if (theme === "deepsea") {
    return "Deep Sea";
  }
  if (theme === "reseda") {
    return "Reseda";
  }
  return "Paper";
}
