"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Timer } from "lucide-react";

type SprintState = {
  active: boolean;
  progress: number;
  remainingSeconds: number;
};

const sprintDurationSeconds = 25 * 60;
const sprintStorageKey = "chapterchase:readingSprint";

export function ReadingSprintTimer({
  onSprintStateChange,
  onClose,
  compact = false,
}: {
  onSprintStateChange?: (state: SprintState) => void;
  onClose?: () => void;
  compact?: boolean;
}) {
  const [endsAt, setEndsAt] = useState<number | null>(() => loadSprintEndTime());
  const [now, setNow] = useState(() => Date.now());
  const remainingSeconds = endsAt ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : 0;
  const active = Boolean(endsAt && remainingSeconds > 0);
  const progress = active ? 1 - remainingSeconds / sprintDurationSeconds : 0;
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const timeLabel = `${minutes}:${seconds.toString().padStart(2, "0")}`;

  useEffect(() => {
    const sprintState = { active, progress, remainingSeconds };
    onSprintStateChange?.(sprintState);
    window.dispatchEvent(new CustomEvent("chapterchase:reading-sprint", { detail: sprintState }));
  }, [active, onSprintStateChange, progress, remainingSeconds]);

  useEffect(() => {
    if (!endsAt) {
      return undefined;
    }

    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [endsAt]);

  useEffect(() => {
    if (!endsAt || remainingSeconds > 0) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      window.localStorage.removeItem(sprintStorageKey);
      setEndsAt(null);
      setNow(Date.now());
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [endsAt, remainingSeconds]);

  const status = useMemo(() => (active ? `Sprint ${timeLabel}` : "Start 25m Sprint"), [active, timeLabel]);

  function startSprint() {
    const nextEndsAt = Date.now() + sprintDurationSeconds * 1000;
    window.localStorage.setItem(sprintStorageKey, JSON.stringify({ endsAt: nextEndsAt }));
    setEndsAt(nextEndsAt);
    setNow(Date.now());
  }

  function stopSprint() {
    window.localStorage.removeItem(sprintStorageKey);
    setEndsAt(null);
    setNow(Date.now());
  }

  return (
    <section className="reading-sprint-widget" data-active={active} data-compact={compact ? "true" : "false"}>
      <div className="reading-sprint-header">
        <Timer size={16} />
        <span>{status}</span>
        {onClose ? (
          <button className="reading-sprint-close" aria-label="Hide timer" onClick={onClose}>
            <X size={14} />
          </button>
        ) : null}
      </div>
      <div className="reading-sprint-track" aria-hidden="true">
        <span style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
      <button onClick={active ? stopSprint : startSprint}>{active ? "End Sprint" : "Begin Focus"}</button>
    </section>
  );
}

function loadSprintEndTime() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const sprint = JSON.parse(window.localStorage.getItem(sprintStorageKey) ?? "null") as { endsAt?: number } | null;
    return sprint?.endsAt && sprint.endsAt > Date.now() ? sprint.endsAt : null;
  } catch {
    return null;
  }
}
