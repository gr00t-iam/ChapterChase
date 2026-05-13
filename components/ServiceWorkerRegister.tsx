"use client";

import { useEffect } from "react";
import { registerChapterChaseServiceWorker, syncPendingProgress } from "@/lib/offline-client";

export function ServiceWorkerRegister() {
  useEffect(() => {
    void registerChapterChaseServiceWorker();
    const sync = () => void syncPendingProgress();
    window.addEventListener("online", sync);
    return () => window.removeEventListener("online", sync);
  }, []);

  return null;
}
