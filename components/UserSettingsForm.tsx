"use client";

import { CheckCircle2, Download, Loader2, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { createClientId } from "@/lib/client-id";
import { defaultKokoroVoiceId, kokoroVoices, resolveKokoroVoiceId } from "@/lib/kokoro-voices";
import {
  getLocalKokoroInstallState,
  installLocalKokoroModel,
  isLocalKokoroReady,
  localKokoroDownloadDescription,
  normalizeTtsEngine,
  supportsLocalKokoroRuntime,
  type LocalKokoroInstallState,
  type TtsEngine,
} from "@/lib/local-kokoro-tts";

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
  blurUnreadSummaries: boolean;
  disableAnimations: boolean;
  collapseSeriesRelationships: boolean;
  annotationHighlightColors: string;
  shareProfile: boolean;
  shareSeriesReviews: boolean;
  viewSharedAnnotations: boolean;
  readingProfiles: string;
};

const tabs = ["Account", "Preferences", "Reading Profiles", "Annotations", "Social"] as const;
const defaultColors = ["#facc15", "#38bdf8", "#fb7185", "#4ade80"];
const defaultProfiles: ReadingProfile[] = [
  { id: "paper", name: "Paper", theme: "paper", fontScale: 1, lineHeight: 1.55 },
  { id: "night", name: "Night Mode", theme: "night", fontScale: 1, lineHeight: 1.6 },
  { id: "scroll", name: "Ancient Scroll", theme: "scroll", fontScale: 1.06, lineHeight: 1.7 },
  { id: "eink", name: "E-Ink", theme: "eink", fontScale: 1, lineHeight: 1.58 },
  { id: "reseda", name: "Reseda", theme: "reseda", fontScale: 1, lineHeight: 1.62 },
  { id: "deepsea", name: "Deep Sea", theme: "deepsea", fontScale: 1, lineHeight: 1.62 },
];

const defaultProfileIds = new Set(defaultProfiles.map((profile) => profile.id));

export function UserSettingsForm({ user }: { user: SettingsUser }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>("Account");
  const [status, setStatus] = useState<string | null>(null);
  const [initialLocalSettings] = useState(loadLocalUserSettings);
  const [form, setForm] = useState(() => ({
    ...user,
    ttsVoice: String(resolveKokoroVoiceId(user.ttsVoice)),
    annotationHighlightColors: parseColors(user.annotationHighlightColors),
    readingProfiles: parseProfiles(user.readingProfiles),
  }));
  const [bionicReading, setBionicReading] = useState(initialLocalSettings.bionicReading);
  const [ttsEngine, setTtsEngine] = useState<TtsEngine>(initialLocalSettings.ttsEngine);
  const [localKokoroState, setLocalKokoroState] = useState<LocalKokoroInstallState>(() =>
    typeof window === "undefined" ? { status: "not-installed" } : getLocalKokoroInstallState()
  );
  const [localKokoroProgress, setLocalKokoroProgress] = useState<string | null>(null);
  const [isInstallingLocalKokoro, setIsInstallingLocalKokoro] = useState(false);
  const localKokoroReady = isLocalKokoroReady(localKokoroState);

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

  function updateColor(index: number, value: string) {
    setForm((current) => ({
      ...current,
      annotationHighlightColors: current.annotationHighlightColors.map((color, colorIndex) => (colorIndex === index ? value : color)),
    }));
  }

  function addProfile(theme: ReadingProfile["theme"]) {
    setForm((current) => ({
      ...current,
      readingProfiles: [
        ...current.readingProfiles,
        { id: createClientId("reading-profile"), name: `${themeLabel(theme)} Profile`, theme, fontScale: 1, lineHeight: 1.6 },
      ],
    }));
  }

  function updateProfile(id: string, patch: Partial<ReadingProfile>) {
    setForm((current) => ({
      ...current,
      readingProfiles: current.readingProfiles.map((profile) => (profile.id === id ? { ...profile, ...patch } : profile)),
    }));
  }

  function deleteProfile(profile: ReadingProfile) {
    if (isFactoryProfile(profile)) {
      return;
    }

    if (!window.confirm(`Delete the "${profile.name}" reading profile?`)) {
      return;
    }

    setForm((current) => ({
      ...current,
      readingProfiles: current.readingProfiles.filter((candidate) => candidate.id !== profile.id),
    }));
  }

  function resetProfiles() {
    if (!window.confirm("Reset all reading profiles to the ChapterChase defaults? This will remove custom profiles.")) {
      return;
    }

    setForm((current) => ({
      ...current,
      readingProfiles: cloneDefaultProfiles(),
      readerTheme: "paper",
    }));
  }

  useEffect(() => {
    saveLocalUserSettings({
      activeReadingProfile: form.readerTheme,
      ttsVoice: form.ttsVoice,
      ttsEngine,
      bionicReading,
      readingProfiles: form.readingProfiles,
    });
  }, [bionicReading, form.readerTheme, form.readingProfiles, form.ttsVoice, ttsEngine]);

  useEffect(() => {
    const refreshLocalKokoroState = () => setLocalKokoroState(getLocalKokoroInstallState());
    window.addEventListener("chapterchase:local-kokoro-tts", refreshLocalKokoroState);
    return () => window.removeEventListener("chapterchase:local-kokoro-tts", refreshLocalKokoroState);
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

  async function prepareLocalKokoro() {
    if (isInstallingLocalKokoro) {
      return;
    }

    if (!supportsLocalKokoroRuntime()) {
      setLocalKokoroProgress("This browser cannot run on-device Kokoro.");
      return;
    }

    setIsInstallingLocalKokoro(true);
    setLocalKokoroProgress("Preparing on-device Kokoro...");
    try {
      const nextState = await installLocalKokoroModel({
        onProgress: (progress) => setLocalKokoroProgress(progress.message),
      });
      setLocalKokoroState(nextState);
      setTtsEngine("local");
    } catch {
      setLocalKokoroProgress("Unable to download on-device Kokoro. Check the connection and try again.");
    } finally {
      setIsInstallingLocalKokoro(false);
    }
  }

  return (
    <section className="preferences-dashboard">
      <aside className="preferences-tabs" aria-label="Preferences sections">
        {tabs.map((tab) => (
          <button key={tab} className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>
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
              <label className="settings-field">
                <span>Speech engine</span>
                <select value={ttsEngine} onChange={(event) => setTtsEngine(normalizeTtsEngine(event.target.value))}>
                  <option value="auto">Auto</option>
                  <option value="local">On-device Kokoro</option>
                  <option value="server">Server Kokoro</option>
                </select>
              </label>
              <div className="settings-field settings-local-tts">
                <span>On-device Kokoro</span>
                <div className="local-tts-card" data-ready={localKokoroReady ? "true" : "false"}>
                  <div>
                    <strong>Speaker 5 - am_adam</strong>
                    <p>
                      {localKokoroReady
                        ? "Downloaded on this device. Auto and On-device modes can speak without the server TTS bottleneck."
                        : `One-time ${localKokoroDownloadDescription} download for local speech on this device.`}
                    </p>
                  </div>
                  <button className="secondary-button" onClick={prepareLocalKokoro} disabled={isInstallingLocalKokoro || localKokoroReady}>
                    {isInstallingLocalKokoro ? <Loader2 className="settings-spin-icon" size={16} /> : localKokoroReady ? <CheckCircle2 size={16} /> : <Download size={16} />}
                    {isInstallingLocalKokoro ? "Downloading" : localKokoroReady ? "Ready" : "Download"}
                  </button>
                  {localKokoroProgress ? <p className="local-tts-status">{localKokoroProgress}</p> : null}
                </div>
              </div>
              <Toggle label="Blur Unread Summaries" checked={form.blurUnreadSummaries} onChange={(value) => update("blurUnreadSummaries", value)} />
              <Toggle label="Disable Animations" checked={form.disableAnimations} onChange={(value) => update("disableAnimations", value)} />
              <Toggle
                label="Collapse Series Relationships"
                checked={form.collapseSeriesRelationships}
                onChange={(value) => update("collapseSeriesRelationships", value)}
              />
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
              <select value={form.readerTheme} onChange={(event) => update("readerTheme", event.target.value)}>
                <option value="paper">Paper</option>
                <option value="night">Night</option>
                <option value="scroll">Ancient scroll</option>
                <option value="deepsea">Deep Sea</option>
                <option value="eink">E-Ink</option>
                <option value="reseda">Reseda</option>
              </select>
            </label>
            <Toggle label="Bionic Reading" checked={bionicReading} onChange={setBionicReading} />
            <div className="profile-list">
              {form.readingProfiles.map((profile) => {
                const factoryProfile = isFactoryProfile(profile);
                return (
                  <article className="profile-card" key={profile.id} data-reader-theme={profile.theme}>
                    {factoryProfile ? (
                      <span className="profile-default-badge">Default</span>
                    ) : (
                      <button className="profile-delete-button" aria-label={`Delete ${profile.name}`} onClick={() => deleteProfile(profile)}>
                        <Trash2 size={14} />
                      </button>
                    )}
                    <input value={profile.name} onChange={(event) => updateProfile(profile.id, { name: event.target.value })} />
                    <select value={profile.theme} onChange={(event) => updateProfile(profile.id, { theme: event.target.value as ReadingProfile["theme"] })}>
                      <option value="paper">Paper</option>
                      <option value="night">Night</option>
                      <option value="scroll">Ancient scroll</option>
                      <option value="deepsea">Deep Sea</option>
                      <option value="eink">E-Ink</option>
                      <option value="reseda">Reseda</option>
                    </select>
                  </article>
                );
              })}
            </div>
            <div className="settings-actions">
              <button className="secondary-button" onClick={() => addProfile("night")}>
                <Plus size={16} /> Add Night Profile
              </button>
              <button className="secondary-button" onClick={() => addProfile("scroll")}>
                <Plus size={16} /> Add Scroll Profile
              </button>
              <button className="secondary-button" onClick={() => addProfile("eink")}>
                <Plus size={16} /> Add E-Ink Profile
              </button>
              <button className="secondary-button" onClick={() => addProfile("reseda")}>
                <Plus size={16} /> Add Reseda Profile
              </button>
            </div>
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
            <h2>Social</h2>
            <div className="settings-grid">
              <Toggle label="Share Profile" checked={form.shareProfile} onChange={(value) => update("shareProfile", value)} />
              <Toggle label="Share Series Reviews" checked={form.shareSeriesReviews} onChange={(value) => update("shareSeriesReviews", value)} />
              <Toggle label="View Shared Annotations" checked={form.viewSharedAnnotations} onChange={(value) => update("viewSharedAnnotations", value)} />
            </div>
          </div>
        ) : null}

        <div className="settings-actions">
          {activeTab === "Reading Profiles" ? (
            <button className="secondary-button" onClick={resetProfiles}>
              Reset All to Default
            </button>
          ) : null}
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

function isFactoryProfile(profile: ReadingProfile) {
  return defaultProfileIds.has(profile.id);
}

function loadLocalUserSettings() {
  if (typeof window === "undefined") {
    return { bionicReading: false, ttsVoice: String(defaultKokoroVoiceId), ttsEngine: "auto" as TtsEngine };
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem("userSettings") ?? "{}") as { bionicReading?: unknown; ttsVoice?: unknown; ttsEngine?: unknown };
    return {
      bionicReading: parsed.bionicReading === true,
      ttsVoice: String(resolveKokoroVoiceId(parsed.ttsVoice ?? defaultKokoroVoiceId)),
      ttsEngine: normalizeTtsEngine(parsed.ttsEngine),
    };
  } catch {
    return { bionicReading: false, ttsVoice: String(defaultKokoroVoiceId), ttsEngine: "auto" as TtsEngine };
  }
}

function saveLocalUserSettings(settings: { activeReadingProfile: string; ttsVoice: string; ttsEngine: TtsEngine; bionicReading: boolean; readingProfiles: ReadingProfile[] }) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem("userSettings", JSON.stringify(settings));
  window.dispatchEvent(new CustomEvent("chapterchase:user-settings"));
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
