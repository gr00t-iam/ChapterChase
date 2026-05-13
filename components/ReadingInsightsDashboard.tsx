"use client";

import { useEffect, useState } from "react";

type InsightDay = { date: string; seconds: number; words: number; pages: number };
type Insights = { totalHours: number; averageWpm: number; days: InsightDay[]; heatmapDays: InsightDay[] };

export function ReadingInsightsDashboard({ initialInsights }: { initialInsights: Insights }) {
  const [insights, setInsights] = useState(initialInsights);
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    fetch("/api/insights")
      .then((response) => response.json())
      .then((data: Insights) => setInsights(data))
      .catch(() => undefined);
  }, []);

  async function resetStatistics() {
    setIsResetting(true);
    const response = await fetch("/api/insights/reset", { method: "POST" }).catch(() => null);
    if (response?.ok) {
      setInsights({
        totalHours: 0,
        averageWpm: 0,
        days: insights.days.map((day) => ({ ...day, seconds: 0, words: 0, pages: 0 })),
        heatmapDays: insights.heatmapDays.map((day) => ({ ...day, seconds: 0, words: 0, pages: 0 })),
      });
    }
    setIsResetting(false);
  }

  return (
    <section className="insights-dashboard">
      <div className="insight-stat">
        <span>Total hours read</span>
        <strong>{insights.totalHours.toFixed(1)}h</strong>
      </div>
      <div className="insight-stat">
        <span>Average speed</span>
        <strong>{insights.averageWpm || 0} wpm</strong>
      </div>
      <div className="insight-stat">
        <span>Pages read</span>
        <strong>{insights.days.reduce((sum, day) => sum + day.pages, 0)}</strong>
      </div>

      <ReadingActivityHeatmap days={insights.heatmapDays} />
      <button className="insights-reset-button" onClick={resetStatistics} disabled={isResetting}>
        {isResetting ? "Resetting..." : "Reset All Statistics"}
      </button>
    </section>
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
