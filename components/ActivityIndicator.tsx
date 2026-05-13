"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, Cog } from "lucide-react";

type ScanActivityTask = {
  id: string;
  active: boolean;
  phase: "discovering" | "scanning" | "complete" | "failed";
  currentFile: string | null;
  processedFiles: number;
  totalFiles: number;
  message: string;
};

type ActivityResponse = {
  tasks: ScanActivityTask[];
};

export function ActivityIndicator() {
  const [tasks, setTasks] = useState<ScanActivityTask[]>([]);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | null = null;

    async function poll() {
      const response = await fetch("/api/activity", { cache: "no-store" }).catch(() => null);
      let nextTasks: ScanActivityTask[] = [];
      if (!cancelled && response?.ok) {
        const data = (await response.json().catch(() => ({ tasks: [] }))) as ActivityResponse;
        nextTasks = Array.isArray(data.tasks) ? data.tasks : [];
        setTasks(nextTasks);
      }

      if (!cancelled) {
        const hasActiveTask = nextTasks.some((task) => task.active);
        timeoutId = window.setTimeout(poll, hasActiveTask ? 850 : 2500);
      }
    }

    void poll();
    return () => {
      cancelled = true;
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  const activeTasks = tasks.filter((task) => task.active);
  const isActive = activeTasks.length > 0;
  const visibleTasks = useMemo(() => activeTasks.slice(0, 3), [activeTasks]);

  return (
    <div className="activity-indicator">
      <button className="activity-indicator-trigger" aria-label="Activity">
        {isActive ? <Cog size={17} className="activity-indicator-spin" /> : <Activity size={17} />}
      </button>
      <div className="activity-tooltip" role="status">
        <div className="activity-tooltip-arrow" aria-hidden="true" />
        <span className="activity-tooltip-label">Activity</span>
        {visibleTasks.length ? (
          visibleTasks.map((task) => {
            const progressPercent = getTaskProgress(task);
            return (
              <div className="activity-task" key={task.id}>
                <p>{task.message}</p>
                <div className="activity-progress" aria-label={`${Math.round(progressPercent)} percent complete`}>
                  <span style={{ width: `${progressPercent}%` }} />
                </div>
                <small>{task.totalFiles > 0 ? `${task.processedFiles} / ${task.totalFiles} files` : "Finding files..."}</small>
              </div>
            );
          })
        ) : (
          <div className="activity-task">
            <p>Not much going on here</p>
            <small>System Idle</small>
          </div>
        )}
      </div>
    </div>
  );
}

function getTaskProgress(task: ScanActivityTask | null) {
  if (!task || task.totalFiles <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, (task.processedFiles / task.totalFiles) * 100));
}
