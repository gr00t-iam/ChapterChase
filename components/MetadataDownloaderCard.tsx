"use client";

import { useState } from "react";
import { RotateCw } from "lucide-react";

type SyncResult = {
  updated?: number;
  failed?: number;
  total?: number;
  error?: string;
};

export function MetadataDownloaderCard() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function syncMissingMetadata() {
    if (isSyncing) {
      return;
    }

    setIsSyncing(true);
    setStatus("Starting metadata sync...");
    const response = await fetch("/api/metadata/sync", { method: "POST" }).catch(() => null);
    const result = (await response?.json().catch(() => null)) as SyncResult | null;

    if (!response?.ok) {
      setStatus(result?.error ?? "Unable to sync metadata.");
      setIsSyncing(false);
      return;
    }

    setStatus(`Metadata sync complete: ${result?.updated ?? 0} updated${result?.failed ? `, ${result.failed} failed` : ""}.`);
    setIsSyncing(false);
  }

  return (
    <section className="library-automation-options metadata-downloader-card">
      <div>
        <h2>Automated Metadata Downloader</h2>
        <p>Fetch missing descriptions and cover artwork from Hardcover for books that need enrichment.</p>
      </div>
      <button type="button" className="kavita-save-button metadata-sync-button" onClick={syncMissingMetadata} disabled={isSyncing}>
        {isSyncing ? <RotateCw size={16} className="activity-indicator-spin" /> : null}
        {isSyncing ? "Syncing Missing Metadata..." : "Sync Missing Library Metadata"}
      </button>
      {status ? <p className="metadata-sync-status">{status}</p> : null}
    </section>
  );
}
