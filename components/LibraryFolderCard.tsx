"use client";

import { useTransition } from "react";
import { removeLibraryFolderAction, scanLibraryAction, toggleLibraryFolderAction } from "@/app/admin/libraries/actions";

type LibraryFolderCardProps = {
  folder: {
    id: string;
    name: string;
    rootPath: string;
    enabled: boolean;
    lastScanAt: Date | null;
    _count: { books: number };
  };
};

export function LibraryFolderCard({ folder }: LibraryFolderCardProps) {
  const [isPending, startTransition] = useTransition();

  function runAction(action: (formData: FormData) => Promise<void>, fields: Record<string, string>) {
    const formData = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      formData.set(key, value);
    }
    startTransition(() => {
      void action(formData);
    });
  }

  function removeLibrary() {
    if (!window.confirm("Are you sure? This will remove the library from ChapterChase, but your book files will remain safe on your drive.")) {
      return;
    }

    runAction(removeLibraryFolderAction, { id: folder.id });
  }

  return (
    <section className="rounded bg-[#202124] p-5 shadow ring-1 ring-white/10" aria-busy={isPending}>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold">{folder.name}</h2>
          <p className="mt-1 break-all text-sm text-zinc-400">{folder.rootPath}</p>
          <p className="mt-2 text-xs text-zinc-500">
            {folder._count.books} books · {folder.enabled ? "Enabled" : "Disabled"} · Last scan{" "}
            {folder.lastScanAt ? folder.lastScanAt.toLocaleString() : "never"}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            className="kavita-light-button"
            disabled={isPending || !folder.enabled}
            onClick={() => runAction(scanLibraryAction, { id: folder.id })}
            title={folder.enabled ? "Scan this library now" : "Enable this library before scanning"}
          >
            Force Scan
          </button>
          <button
            className="kavita-light-button"
            disabled={isPending}
            onClick={() => runAction(toggleLibraryFolderAction, { id: folder.id, enabled: folder.enabled ? "false" : "true" })}
          >
            {folder.enabled ? "Disable" : "Enable"}
          </button>
          <button className="kavita-danger-button" disabled={isPending} onClick={removeLibrary}>
            Remove Library
          </button>
        </div>
      </div>
    </section>
  );
}
