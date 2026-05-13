"use client";

import { useEffect, useState } from "react";
import { loadFocusBadges } from "@/components/ReadingSprintTimer";
import { loadEchoes, loadGamificationSettings, loadSpeedsterBadges, type EchoLoot } from "@/lib/gamification";

type InsightDay = { date: string; seconds: number; words: number; pages: number };
type Insights = { totalHours: number; averageWpm: number; streakDays: number; days: InsightDay[]; heatmapDays: InsightDay[] };

export function ReadingInsightsDashboard({ initialInsights }: { initialInsights: Insights }) {
  const [insights, setInsights] = useState(initialInsights);
  const [isResetting, setIsResetting] = useState(false);
  const [focusBadges, setFocusBadges] = useState<string[]>(() => loadFocusBadges());
  const [echoes, setEchoes] = useState<EchoLoot[]>(() => loadEchoes());
  const [speedsterBadges] = useState<string[]>(() => loadSpeedsterBadges());
  const [activeTab, setActiveTab] = useState<"overview" | "gallery">("overview");
  const [now] = useState(() => Date.now());
  const [gamification] = useState(() => loadGamificationSettings());

  useEffect(() => {
    fetch("/api/insights")
      .then((response) => response.json())
      .then((data: Insights) => setInsights(data))
      .catch(() => undefined);
    const refreshBadges = () => setFocusBadges(loadFocusBadges());
    const refreshEchoes = () => setEchoes(loadEchoes());
    window.addEventListener("chapterchase:focus-badge", refreshBadges);
    window.addEventListener("chapterchase:echoes", refreshEchoes);
    return () => {
      window.removeEventListener("chapterchase:focus-badge", refreshBadges);
      window.removeEventListener("chapterchase:echoes", refreshEchoes);
    };
  }, []);

  async function resetStatistics() {
    setIsResetting(true);
    const response = await fetch("/api/insights/reset", { method: "POST" }).catch(() => null);
    if (response?.ok) {
      setInsights({
        totalHours: 0,
        averageWpm: 0,
        streakDays: 0,
        days: insights.days.map((day) => ({ ...day, seconds: 0, words: 0, pages: 0 })),
        heatmapDays: insights.heatmapDays.map((day) => ({ ...day, seconds: 0, words: 0, pages: 0 })),
      });
    }
    setIsResetting(false);
  }

  return (
    <section className="insights-dashboard">
      {gamification.assistantAvatar ? (
        <AssistantAvatar pagesRead={insights.heatmapDays.reduce((sum, day) => sum + day.pages, 0)} days={insights.heatmapDays} echoes={echoes} now={now} />
      ) : null}
      <div className="insights-tabs">
        <button className={activeTab === "overview" ? "active" : ""} onClick={() => setActiveTab("overview")}>Overview</button>
        <button className={activeTab === "gallery" ? "active" : ""} onClick={() => setActiveTab("gallery")}>Gallery</button>
      </div>
      {activeTab === "gallery" ? (
        <section className="echo-gallery">
          {echoes.length ? echoes.map((echo) => (
            <article key={echo.id} data-rarity={echo.rarity}>
              <span>{echo.icon}</span>
              <strong>{echo.title}</strong>
              <small>{echo.rarity} · Page {echo.pageIndex}</small>
            </article>
          )) : <p>No Echoes discovered yet. Keep reading to uncover one every 50 pages.</p>}
        </section>
      ) : (
        <>
      <div className="insight-stat">
        <span>7-day streak</span>
        <strong>{insights.streakDays} days</strong>
      </div>
      <div className="insight-stat">
        <span>Total hours read</span>
        <strong>{insights.totalHours.toFixed(1)}h</strong>
      </div>
      <div className="insight-stat">
        <span>Average speed</span>
        <strong>{insights.averageWpm || 0} wpm</strong>
      </div>
      <div className="insight-stat">
        <span>Focus Badges</span>
        <strong>{focusBadges.length}</strong>
      </div>
      <div className="insight-stat">
        <span>Speedster Badges</span>
        <strong>{speedsterBadges.length}</strong>
      </div>

      <div className="streak-calendar">
        {insights.days.map((day) => (
          <article key={day.date} className={day.seconds > 0 ? "active" : ""}>
            <span>{new Date(`${day.date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short" })}</span>
            <strong>{Math.round(day.seconds / 60)}m</strong>
          </article>
        ))}
      </div>

      <ReadingActivityHeatmap days={insights.heatmapDays} />
      <button className="insights-reset-button" onClick={resetStatistics} disabled={isResetting}>
        {isResetting ? "Resetting..." : "Reset All Statistics"}
      </button>
        </>
      )}
    </section>
  );
}

function AssistantAvatar({ pagesRead, days, echoes, now }: { pagesRead: number; days: InsightDay[]; echoes: EchoLoot[]; now: number }) {
  const lastRead = [...days].reverse().find((day) => day.seconds > 0)?.date;
  const sleeping = !lastRead || now - new Date(`${lastRead}T00:00:00`).getTime() > 48 * 60 * 60 * 1000;
  const level = Math.max(1, Math.floor(pagesRead / 100) + 1);
  const hasVisor = echoes.some((echo) => echo.title.toLowerCase().includes("sci") || echo.icon === "potion");
  const hasWand = echoes.some((echo) => echo.title.toLowerCase().includes("fantasy") || echo.icon === "sword");

  return (
    <aside className="assistant-avatar-card" data-sleeping={sleeping}>
      <svg viewBox="0 0 96 96" aria-hidden="true">
        <circle cx="48" cy="48" r="34" />
        <circle cx="36" cy="43" r={sleeping ? "2" : "4"} />
        <circle cx="60" cy="43" r={sleeping ? "2" : "4"} />
        <path d="M35 61 Q48 69 61 61" />
        {hasVisor ? <path className="avatar-visor" d="M26 36h44v15H26z" /> : null}
        {hasWand ? <path className="avatar-wand" d="M70 20l10-10m-6 1l5 5m-12 0l5 5" /> : null}
        {sleeping ? <text x="66" y="24">Z</text> : null}
      </svg>
      <div>
        <span>Assistant Avatar</span>
        <strong>Level {level}</strong>
        <p>{sleeping ? "Sleeping until your next session." : "Traveling with your reading rhythm."}</p>
      </div>
    </aside>
  );
}

function ReadingActivityHeatmap({ days }: { days: InsightDay[] }) {
  const cellSize = 11;
  const cellGap = 4;
  const labelWidth = 34;
  const topPadding = 22;
  const rowHeight = cellSize + cellGap;
  const columnWidth = cellSize + cellGap;
  const weeks = buildHeatmapWeeks(days);
  const width = labelWidth + weeks.length * columnWidth;
  const height = topPadding + 7 * rowHeight;
  const monthLabels = buildMonthLabels(weeks);

  return (
    <section className="activity-heatmap-card" aria-labelledby="reading-activity-title">
      <div className="activity-heatmap-header">
        <div>
          <h2 id="reading-activity-title">Reading Activity</h2>
          <p>Minutes read per day across the last year.</p>
        </div>
        <div className="activity-heatmap-legend" aria-hidden="true">
          <span>Less</span>
          {[0, 1, 2, 3, 4].map((level) => (
            <i key={level} className={`heatmap-cell-level-${level}`} />
          ))}
          <span>More</span>
        </div>
      </div>

      <div className="activity-heatmap-scroll">
        <svg
          className="activity-heatmap"
          role="img"
          aria-label="Reading activity heatmap for the last year"
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
        >
          {monthLabels.map((label) => (
            <text key={`${label.month}-${label.x}`} x={labelWidth + label.x * columnWidth} y="12" className="heatmap-month-label">
              {label.month}
            </text>
          ))}
          {["Mon", "Wed", "Fri"].map((label, index) => (
            <text key={label} x="0" y={topPadding + (index * 2 + 1) * rowHeight + 9} className="heatmap-day-label">
              {label}
            </text>
          ))}
          {weeks.map((week, weekIndex) =>
            week.map((day) =>
              day ? (
                <rect
                  key={day.date}
                  x={labelWidth + weekIndex * columnWidth}
                  y={topPadding + day.weekday * rowHeight}
                  width={cellSize}
                  height={cellSize}
                  rx="2"
                  className={`heatmap-cell heatmap-cell-level-${getHeatmapLevel(day.seconds)}`}
                >
                  <title>
                    {formatHeatmapTitle(day.date, day.seconds)}
                  </title>
                </rect>
              ) : null
            )
          )}
        </svg>
      </div>
    </section>
  );
}

type HeatmapDay = InsightDay & { weekday: number; month: string };

function buildHeatmapWeeks(days: InsightDay[]) {
  const weeks: Array<Array<HeatmapDay | null>> = [];

  for (const day of days) {
    const date = new Date(`${day.date}T00:00:00`);
    const weekday = date.getDay();
    const heatmapDay = {
      ...day,
      weekday,
      month: date.toLocaleDateString(undefined, { month: "short" }),
    };
    let currentWeek = weeks[weeks.length - 1];

    if (!currentWeek || weekday === 0) {
      currentWeek = Array.from({ length: 7 }, () => null);
      weeks.push(currentWeek);
    }

    currentWeek[weekday] = heatmapDay;
  }

  return weeks;
}

function buildMonthLabels(weeks: Array<Array<HeatmapDay | null>>) {
  const labels: Array<{ month: string; x: number }> = [];
  let previousMonth = "";

  weeks.forEach((week, index) => {
    const firstDay = week.find(Boolean);
    if (firstDay && firstDay.month !== previousMonth) {
      labels.push({ month: firstDay.month, x: index });
      previousMonth = firstDay.month;
    }
  });

  return labels;
}

function getHeatmapLevel(seconds: number) {
  const minutes = Math.round(seconds / 60);
  if (minutes <= 0) {
    return 0;
  }
  if (minutes < 10) {
    return 1;
  }
  if (minutes < 30) {
    return 2;
  }
  if (minutes < 60) {
    return 3;
  }
  return 4;
}

function formatHeatmapTitle(date: string, seconds: number) {
  const minutes = Math.round(seconds / 60);
  const label = new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${minutes} minute${minutes === 1 ? "" : "s"} read on ${label}`;
}
