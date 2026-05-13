"use client";

import { useEffect, useState, useTransition } from "react";

type ScanFrequency = "hourly" | "six-hours" | "daily" | "weekly" | "custom";

type LibraryAutomationSettings = {
  enabled: boolean;
  frequency: ScanFrequency;
  customMinutes: number;
};

const defaultSettings: LibraryAutomationSettings = {
  enabled: false,
  frequency: "daily",
  customMinutes: 1440,
};

export function LibraryAutomationOptions() {
  const [settings, setSettings] = useState<LibraryAutomationSettings>(defaultSettings);
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      const response = await fetch("/api/admin/library-automation", { cache: "no-store" }).catch(() => null);
      if (!cancelled && response?.ok) {
        setSettings((await response.json()) as LibraryAutomationSettings);
      }
    }

    void loadSettings();
    return () => {
      cancelled = true;
    };
  }, []);

  function update(patch: Partial<LibraryAutomationSettings>) {
    setSettings((current) => ({ ...current, ...patch }));
  }

  function save() {
    setStatus(null);
    startTransition(async () => {
      const response = await fetch("/api/admin/library-automation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        setStatus("Unable to save library automation settings.");
        return;
      }

      setSettings((await response.json()) as LibraryAutomationSettings);
      setStatus("Library automation settings saved.");
    });
  }

  return (
    <section className="library-automation-options">
      <div>
        <h2>Library Automation Options</h2>
        <p>Periodically scan enabled library folders for new, changed, or missing files.</p>
      </div>
      <div className="settings-grid">
        <label className="settings-toggle">
          <span>Enable Periodic Library Scans</span>
          <input type="checkbox" checked={settings.enabled} onChange={(event) => update({ enabled: event.target.checked })} />
        </label>
        <label className="settings-field">
          <span>Scan Frequency</span>
          <select value={settings.frequency} onChange={(event) => update({ frequency: event.target.value as ScanFrequency })}>
            <option value="hourly">Hourly</option>
            <option value="six-hours">Every 6 Hours</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="custom">Custom Interval</option>
          </select>
        </label>
        {settings.frequency === "custom" ? (
          <label className="settings-field">
            <span>Custom Interval in Minutes</span>
            <input
              min="5"
              max="10080"
              step="1"
              type="number"
              value={settings.customMinutes}
              onChange={(event) => update({ customMinutes: Number(event.target.value) })}
            />
          </label>
        ) : null}
      </div>
      <div className="settings-actions">
        <button className="kavita-save-button" disabled={isPending} onClick={save}>
          Save Automation
        </button>
        {status ? <p>{status}</p> : null}
      </div>
    </section>
  );
}
