"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, BookOpen, CheckCircle2, FolderOpen, RotateCcw, Server, Terminal, Users } from "lucide-react";

type AdminCounts = {
  users: number;
  folders: number;
  books: number;
  failedImports: number;
};

type FailedImport = {
  id: string;
  title: string;
  filePath: string;
  error: string | null;
  updatedAt: string;
};

type FolderConfig = {
  id: string;
  name: string;
  rootPath: string;
  enabled: boolean;
  formats: string;
  scanIntervalMinutes: number | null;
  lastScanAt: string | null;
  updatedAt: string;
  _count: { books: number };
};

type HealthItem = {
  label: string;
  ok: boolean;
  detail: string;
};

type ActivePanel = "users" | "folders" | "books" | "failed";

export function AdminDashboard({ initialCounts }: { initialCounts: AdminCounts }) {
  const [counts, setCounts] = useState(initialCounts);
  const [activePanel, setActivePanel] = useState<ActivePanel>("failed");
  const [failedImports, setFailedImports] = useState<FailedImport[]>([]);
  const [folders, setFolders] = useState<FolderConfig[]>([]);
  const [healthItems, setHealthItems] = useState<HealthItem[]>([]);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [isLoadingPanel, setIsLoadingPanel] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const fetchLogs = useCallback(async () => {
    const response = await fetch("/api/admin/system-logs?limit=50", { cache: "no-store" }).catch(() => null);
    if (!response?.ok) {
      return;
    }
    const data = (await response.json()) as { lines?: string[] };
    const nextLines = Array.isArray(data.lines) ? data.lines.filter(Boolean) : [];
    setLogLines((currentLines) => mergeLogLines(currentLines, nextLines));
  }, []);

  const fetchHealth = useCallback(async () => {
    const response = await fetch("/api/admin/system-health", { cache: "no-store" }).catch(() => null);
    if (!response?.ok) {
      setHealthItems([
        { label: "Database Connection", ok: false, detail: "Unable to load health check." },
        { label: "Storage Directory Write Permissions", ok: false, detail: "Unable to load health check." },
        { label: "Cache Server status", ok: false, detail: "Unable to load health check." },
      ]);
      return;
    }
    const data = (await response.json()) as { items?: HealthItem[] };
    setHealthItems(Array.isArray(data.items) ? data.items : []);
  }, []);

  const loadFailedImports = useCallback(async () => {
    setActivePanel("failed");
    setIsLoadingPanel(true);
    const response = await fetch("/api/admin/failed-imports", { cache: "no-store" }).catch(() => null);
    if (response?.ok) {
      const data = (await response.json()) as { failedImports?: FailedImport[] };
      const rows = Array.isArray(data.failedImports) ? data.failedImports : [];
      setFailedImports(rows);
      setCounts((current) => ({ ...current, failedImports: rows.length }));
    }
    setIsLoadingPanel(false);
    void fetchLogs();
  }, [fetchLogs]);

  const loadFolders = useCallback(async () => {
    setActivePanel("folders");
    setIsLoadingPanel(true);
    const response = await fetch("/api/admin/folders", { cache: "no-store" }).catch(() => null);
    if (response?.ok) {
      const data = (await response.json()) as { folders?: FolderConfig[] };
      const rows = Array.isArray(data.folders) ? data.folders : [];
      setFolders(rows);
      setCounts((current) => ({ ...current, folders: rows.length }));
    }
    setIsLoadingPanel(false);
    void fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    const startupId = window.setTimeout(() => {
      void fetchHealth();
      void fetchLogs();
      void loadFailedImports();
    }, 0);
    const intervalId = window.setInterval(fetchLogs, 5000);
    return () => {
      window.clearTimeout(startupId);
      window.clearInterval(intervalId);
    };
  }, [fetchHealth, fetchLogs, loadFailedImports]);

  async function resetFailedImports() {
    if (isResetting) {
      return;
    }
    setIsResetting(true);
    const response = await fetch("/api/admin/failed-imports", { method: "POST" }).catch(() => null);
    if (response?.ok) {
      setFailedImports([]);
      setCounts((current) => ({ ...current, failedImports: 0 }));
      setActivePanel("failed");
    }
    setIsResetting(false);
    void fetchLogs();
  }

  const metrics = useMemo(
    () => [
      {
        key: "users" as const,
        label: "Users",
        value: counts.users,
        icon: <Users size={19} />,
        action: () => setActivePanel("users"),
      },
      {
        key: "folders" as const,
        label: "Folders",
        value: counts.folders,
        icon: <FolderOpen size={19} />,
        action: loadFolders,
      },
      {
        key: "books" as const,
        label: "Books",
        value: counts.books,
        icon: <BookOpen size={19} />,
        action: () => setActivePanel("books"),
      },
      {
        key: "failed" as const,
        label: "Failed imports",
        value: counts.failedImports,
        icon: <AlertTriangle size={19} />,
        action: loadFailedImports,
      },
    ],
    [counts.books, counts.failedImports, counts.folders, counts.users, loadFailedImports, loadFolders]
  );

  return (
    <section className="admin-dashboard">
      <div className="admin-overview-layout">
        <div className="admin-metric-grid">
          {metrics.map((metric) => (
            <button
              key={metric.key}
              type="button"
              className={`admin-metric-card ${activePanel === metric.key ? "active" : ""}`}
              onClick={metric.action}
            >
              <span className="admin-metric-icon">{metric.icon}</span>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
            </button>
          ))}
        </div>
        <SystemHealthCheck items={healthItems} onRefresh={fetchHealth} />
      </div>

      <AdminDetailPanel
        activePanel={activePanel}
        failedImports={failedImports}
        folders={folders}
        isLoading={isLoadingPanel}
        isResetting={isResetting}
        onResetFailedImports={resetFailedImports}
      />

      <section className="admin-log-card" aria-labelledby="admin-live-logs-title">
        <div className="admin-section-header">
          <div>
            <p className="admin-section-kicker">Live System Logs</p>
            <h2 id="admin-live-logs-title">Last 50 server log lines</h2>
          </div>
          <Terminal size={18} aria-hidden="true" />
        </div>
        <pre className="admin-log-terminal" aria-live="polite">
          {logLines.length ? logLines.join("\n") : "Waiting for server logs..."}
        </pre>
      </section>
    </section>
  );
}

function SystemHealthCheck({ items, onRefresh }: { items: HealthItem[]; onRefresh: () => void }) {
  const safeItems = items.length
    ? items
    : [
        { label: "Database Connection", ok: false, detail: "Checking..." },
        { label: "Storage Directory Write Permissions", ok: false, detail: "Checking..." },
        { label: "Cache Server status", ok: false, detail: "Checking..." },
      ];

  return (
    <section className="admin-health-card" aria-labelledby="admin-health-title">
      <div className="admin-section-header compact">
        <div>
          <p className="admin-section-kicker">System Health Check</p>
          <h2 id="admin-health-title">Environment</h2>
        </div>
        <button type="button" className="admin-icon-button" onClick={onRefresh} aria-label="Refresh system health">
          <RotateCcw size={16} />
        </button>
      </div>
      <ul className="admin-health-list">
        {safeItems.map((item) => (
          <li key={item.label}>
            <i className={item.ok ? "ok" : "bad"} aria-hidden="true" />
            <div>
              <strong>{item.label}</strong>
              <span>{item.detail}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AdminDetailPanel({
  activePanel,
  failedImports,
  folders,
  isLoading,
  isResetting,
  onResetFailedImports,
}: {
  activePanel: ActivePanel;
  failedImports: FailedImport[];
  folders: FolderConfig[];
  isLoading: boolean;
  isResetting: boolean;
  onResetFailedImports: () => void;
}) {
  if (activePanel === "folders") {
    return (
      <section className="admin-detail-card" aria-labelledby="admin-folders-title">
        <div className="admin-section-header">
          <div>
            <p className="admin-section-kicker">Folders</p>
            <h2 id="admin-folders-title">Mapped path configurations</h2>
          </div>
          <FolderOpen size={18} aria-hidden="true" />
        </div>
        {isLoading ? <p className="admin-empty-state">Loading folder paths...</p> : <FolderTable folders={folders} />}
      </section>
    );
  }

  if (activePanel === "books") {
    return (
      <section className="admin-detail-card">
        <div className="admin-section-header">
          <div>
            <p className="admin-section-kicker">Books</p>
            <h2>Indexed book records</h2>
          </div>
          <BookOpen size={18} aria-hidden="true" />
        </div>
        <p className="admin-empty-state">Use the Bookshelf page to inspect indexed books and open book actions.</p>
      </section>
    );
  }

  if (activePanel === "users") {
    return (
      <section className="admin-detail-card">
        <div className="admin-section-header">
          <div>
            <p className="admin-section-kicker">Users</p>
            <h2>Account overview</h2>
          </div>
          <Users size={18} aria-hidden="true" />
        </div>
        <p className="admin-empty-state">User account administration is intentionally limited to the setup and authentication flows.</p>
      </section>
    );
  }

  return (
    <section className="admin-detail-card" aria-labelledby="admin-failed-title">
      <div className="admin-section-header">
        <div>
          <p className="admin-section-kicker">Failed imports</p>
          <h2 id="admin-failed-title">Import errors and file paths</h2>
        </div>
        <button
          type="button"
          className="admin-reset-button"
          disabled={isResetting || (!failedImports.length && !isLoading)}
          onClick={onResetFailedImports}
        >
          <RotateCcw size={15} />
          {isResetting ? "Resetting..." : "Reset Failed Imports"}
        </button>
      </div>
      {isLoading ? <p className="admin-empty-state">Loading failed imports...</p> : <FailedImportsTable failedImports={failedImports} />}
    </section>
  );
}

function FailedImportsTable({ failedImports }: { failedImports: FailedImport[] }) {
  if (!failedImports.length) {
    return <p className="admin-empty-state">No failed imports are currently tracked.</p>;
  }

  return (
    <div className="admin-table-scroll">
      <table className="admin-data-table">
        <thead>
          <tr>
            <th>Title</th>
            <th>File path</th>
            <th>Error log</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {failedImports.map((item) => (
            <tr key={item.id}>
              <td>{item.title}</td>
              <td>
                <code>{item.filePath}</code>
              </td>
              <td>
                <pre>{item.error || "No error log captured."}</pre>
              </td>
              <td>{formatDateTime(item.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FolderTable({ folders }: { folders: FolderConfig[] }) {
  if (!folders.length) {
    return <p className="admin-empty-state">No mapped folders are configured.</p>;
  }

  return (
    <div className="admin-table-scroll">
      <table className="admin-data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Root path</th>
            <th>Formats</th>
            <th>Books</th>
            <th>Status</th>
            <th>Last scan</th>
          </tr>
        </thead>
        <tbody>
          {folders.map((folder) => (
            <tr key={folder.id}>
              <td>{folder.name}</td>
              <td>
                <code>{folder.rootPath}</code>
              </td>
              <td>{folder.formats}</td>
              <td>{folder._count.books}</td>
              <td>
                <span className={`admin-status-chip ${folder.enabled ? "ok" : "bad"}`}>
                  {folder.enabled ? <CheckCircle2 size={13} /> : <Server size={13} />}
                  {folder.enabled ? "Enabled" : "Disabled"}
                </span>
              </td>
              <td>{folder.lastScanAt ? formatDateTime(folder.lastScanAt) : "Not scanned"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function mergeLogLines(currentLines: string[], nextLines: string[]) {
  if (!nextLines.length) {
    return currentLines.slice(-50);
  }
  const seen = new Set(currentLines);
  const merged = [...currentLines, ...nextLines.filter((line) => !seen.has(line))];
  return merged.slice(-50);
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
