"use client";

import { useEffect, useMemo, useState } from "react";

type InsightDay = { date: string; seconds: number; words: number; pages: number };
type LibraryProjection = {
  id: string;
  title: string;
  author: string | null;
  progressPercent: number;
  wordCount: number;
  remainingWords: number;
  remainingMinutes: number;
  remainingLabel: string;
};
type Insights = {
  totalHours: number;
  averageWpm: number;
  readingSpeedWpm: number;
  days: InsightDay[];
  heatmapDays: InsightDay[];
  projections: LibraryProjection[];
};
type RangeMode = "week" | "month" | "year";

const dailyGoalStorageKey = "chapterchase:daily-reading-goal-minutes";

export function ReadingInsightsDashboard({ initialInsights }: { initialInsights: Insights }) {
  const [insights, setInsights] = useState(initialInsights);
  const [isResetting, setIsResetting] = useState(false);
  const [rangeMode, setRangeMode] = useState<RangeMode>("year");
  const [dailyGoalMinutes, setDailyGoalMinutes] = useState(30);
  const todayMinutes = Math.round((insights.heatmapDays.at(-1)?.seconds ?? 0) / 60);
  const streaks = useMemo(() => calculateStreaks(insights.heatmapDays), [insights.heatmapDays]);
  const displayedBarDays = rangeMode === "week" ? insights.heatmapDays.slice(-7) : insights.heatmapDays.slice(-30);

  useEffect(() => {
    const startupId = window.setTimeout(() => {
      const storedGoal = Number(window.localStorage.getItem(dailyGoalStorageKey));
      if (Number.isFinite(storedGoal) && storedGoal > 0) {
        setDailyGoalMinutes(storedGoal);
      }

      fetch("/api/insights")
        .then((response) => response.json())
        .then((data: Insights) => setInsights(data))
        .catch(() => undefined);
    }, 0);

    return () => window.clearTimeout(startupId);
  }, []);

  function updateDailyGoal(value: number) {
    const nextGoal = Math.max(5, Math.min(600, Math.round(value || 30)));
    setDailyGoalMinutes(nextGoal);
    window.localStorage.setItem(dailyGoalStorageKey, String(nextGoal));
  }

  async function resetStatistics() {
    setIsResetting(true);
    const response = await fetch("/api/insights/reset", { method: "POST" }).catch(() => null);
    if (response?.ok) {
      setInsights({
        ...insights,
        totalHours: 0,
        averageWpm: 0,
        readingSpeedWpm: 285,
        days: insights.days.map((day) => ({ ...day, seconds: 0, words: 0, pages: 0 })),
        heatmapDays: insights.heatmapDays.map((day) => ({ ...day, seconds: 0, words: 0, pages: 0 })),
      });
    }
    setIsResetting(false);
  }

  return (
    <section className="insights-dashboard">
      <div className="insights-range-row">
        <div className="insights-range-control" aria-label="Reading activity range">
          <button className={rangeMode === "week" ? "active" : ""} onClick={() => setRangeMode("week")}>
            This Week
          </button>
          <button className={rangeMode === "month" ? "active" : ""} onClick={() => setRangeMode("month")}>
            This Month
          </button>
          <button className={rangeMode === "year" ? "active" : ""} onClick={() => setRangeMode("year")}>
            Yearly
          </button>
        </div>
      </div>

      <div className="insight-stat">
        <span>Total hours read</span>
        <strong>{insights.totalHours.toFixed(1)}h</strong>
      </div>
      <div className="insight-stat">
        <span>Average speed</span>
        <strong>{insights.averageWpm || insights.readingSpeedWpm || 285} wpm</strong>
      </div>
      <div className="insight-stat">
        <span>Pages read</span>
        <strong>{insights.days.reduce((sum, day) => sum + day.pages, 0)}</strong>
      </div>
      <DailyGoalCard todayMinutes={todayMinutes} goalMinutes={dailyGoalMinutes} onGoalChange={updateDailyGoal} />

      <LibraryProjections projections={insights.projections} readingSpeedWpm={insights.readingSpeedWpm || 285} />

      {rangeMode === "year" ? (
        <ReadingActivityHeatmap days={insights.heatmapDays} streaks={streaks} />
      ) : (
        <ReadingActivityBarChart
          days={displayedBarDays}
          streaks={streaks}
          title={rangeMode === "week" ? "This Week" : "This Month"}
          description={rangeMode === "week" ? "Minutes read per day this week." : "Minutes read per day this month."}
        />
      )}
      <button className="insights-reset-button" onClick={resetStatistics} disabled={isResetting}>
        {isResetting ? "Resetting..." : "Reset All Statistics"}
      </button>
    </section>
  );
}

function DailyGoalCard({
  todayMinutes,
  goalMinutes,
  onGoalChange,
}: {
  todayMinutes: number;
  goalMinutes: number;
  onGoalChange: (value: number) => void;
}) {
  const progress = Math.min(1, todayMinutes / goalMinutes);
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const remainingStroke = circumference * (1 - progress);
  const isMet = todayMinutes >= goalMinutes;

  return (
    <div className={`insight-stat daily-goal-card ${isMet ? "met" : ""}`}>
      <span>Daily Goal</span>
      <div className="daily-goal-content">
        <svg viewBox="0 0 88 88" role="img" aria-label={`${todayMinutes} of ${goalMinutes} minutes read today`}>
          <circle cx="44" cy="44" r={radius} className="daily-goal-track" />
          <circle
            cx="44"
            cy="44"
            r={radius}
            className="daily-goal-progress"
            strokeDasharray={circumference}
            strokeDashoffset={remainingStroke}
          />
          <text x="44" y="48" textAnchor="middle">
            {Math.round(progress * 100)}%
          </text>
        </svg>
        <div>
          <strong>{todayMinutes}m</strong>
          <label>
            Goal
            <input type="number" min="5" max="600" step="5" value={goalMinutes} onChange={(event) => onGoalChange(Number(event.target.value))} />
          </label>
        </div>
      </div>
    </div>
  );
}

function LibraryProjections({ projections, readingSpeedWpm }: { projections: LibraryProjection[]; readingSpeedWpm: number }) {
  return (
    <section className="library-projections-card" aria-labelledby="library-projections-title">
      <div className="activity-heatmap-header">
        <div>
          <h2 id="library-projections-title">Library Projections</h2>
          <p>Currently reading books estimated at {readingSpeedWpm} wpm.</p>
        </div>
      </div>
      {projections.length ? (
        <div className="projection-list">
          {projections.map((projection) => (
            <article key={projection.id}>
              <div>
                <strong>{projection.title}</strong>
                <span>{projection.author ?? "Unknown author"}</span>
              </div>
              <div className="projection-progress" aria-label={`${Math.round(projection.progressPercent)} percent read`}>
                <span style={{ width: `${projection.progressPercent}%` }} />
              </div>
              <strong>{projection.remainingLabel}</strong>
            </article>
          ))}
        </div>
      ) : (
        <p className="projection-empty">No currently reading books are being tracked yet.</p>
      )}
    </section>
  );
}

function ReadingActivityHeatmap({ days, streaks }: { days: InsightDay[]; streaks: StreakSummary }) {
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
      <ReadingActivityHeader
        titleId="reading-activity-title"
        title="Reading Activity"
        description="Minutes read per day across the last year."
        streaks={streaks}
        showLegend
      />

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
                  <title>{formatHeatmapTitle(day.date, day.seconds)}</title>
                </rect>
              ) : null
            )
          )}
        </svg>
      </div>
    </section>
  );
}

function ReadingActivityBarChart({
  days,
  streaks,
  title,
  description,
}: {
  days: InsightDay[];
  streaks: StreakSummary;
  title: string;
  description: string;
}) {
  const maxMinutes = Math.max(1, ...days.map((day) => Math.round(day.seconds / 60)));

  return (
    <section className="activity-heatmap-card" aria-labelledby="reading-bar-title">
      <ReadingActivityHeader titleId="reading-bar-title" title={title} description={description} streaks={streaks} />
      <div className="reading-bar-chart" role="img" aria-label={`${title} minutes read per day`}>
        {days.map((day) => {
          const minutes = Math.round(day.seconds / 60);
          const height = Math.max(4, Math.round((minutes / maxMinutes) * 100));
          return (
            <div className="reading-bar-column" key={day.date}>
              <span style={{ height: `${height}%` }} title={formatHeatmapTitle(day.date, day.seconds)} />
              <small>{formatBarLabel(day.date)}</small>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ReadingActivityHeader({
  titleId,
  title,
  description,
  streaks,
  showLegend = false,
}: {
  titleId: string;
  title: string;
  description: string;
  streaks: StreakSummary;
  showLegend?: boolean;
}) {
  return (
    <>
      <div className="activity-streak-row">
        <span>🔥 Current streak {streaks.current} day{streaks.current === 1 ? "" : "s"}</span>
        <span>Longest streak {streaks.longest} day{streaks.longest === 1 ? "" : "s"}</span>
      </div>
      <div className="activity-heatmap-header">
        <div>
          <h2 id={titleId}>{title}</h2>
          <p>{description}</p>
        </div>
        {showLegend ? (
          <div className="activity-heatmap-legend" aria-hidden="true">
            <span>Less</span>
            {[0, 1, 2, 3, 4].map((level) => (
              <i key={level} className={`heatmap-cell-level-${level}`} />
            ))}
            <span>More</span>
          </div>
        ) : null}
      </div>
    </>
  );
}

type HeatmapDay = InsightDay & { weekday: number; month: string };
type StreakSummary = { current: number; longest: number };

function calculateStreaks(days: InsightDay[]): StreakSummary {
  let longest = 0;
  let running = 0;

  for (const day of days) {
    if (day.seconds > 0) {
      running += 1;
      longest = Math.max(longest, running);
    } else {
      running = 0;
    }
  }

  let current = 0;
  for (let index = days.length - 1; index >= 0; index -= 1) {
    if (days[index].seconds <= 0) {
      break;
    }
    current += 1;
  }

  return { current, longest };
}

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

function formatBarLabel(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
}
