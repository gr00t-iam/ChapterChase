"use client";

import { useMemo, useState } from "react";
import { Folder, FolderOpen, HardDrive, Plus, RotateCw, X } from "lucide-react";
import { addLibraryFolderAction } from "@/app/admin/libraries/actions";
import { MetadataDownloaderCard } from "@/components/MetadataDownloaderCard";

type FolderListing = {
  currentPath: string | null;
  parentPath: string | null;
  roots: Array<{ name: string; path: string }>;
  directories: Array<{ name: string; path: string }>;
  error?: string;
};

type FolderEditorTab = "general" | "folder" | "cover" | "advanced" | "tasks";

export function MediaFolderEditor() {
  const [activeTab, setActiveTab] = useState<FolderEditorTab>("folder");
  const [libraryName, setLibraryName] = useState("Books");
  const [selectedPath, setSelectedPath] = useState("");
  const [isBrowserOpen, setIsBrowserOpen] = useState(false);
  const [listing, setListing] = useState<FolderListing | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function loadFolder(path?: string | null) {
    if (path !== undefined && path !== null) {
      setSelectedPath(path);
    }
    setIsLoading(true);
    const suffix = path ? `?path=${encodeURIComponent(path)}` : "";
    const response = await fetch(`/api/media-folders${suffix}`);
    const data = (await response.json()) as FolderListing;
    setListing(data);
    setIsLoading(false);
  }

  function openBrowser() {
    setIsBrowserOpen(true);
    void loadFolder(selectedPath || null);
  }

  const currentChoices = useMemo(() => {
    if (!listing) {
      return [];
    }
    return listing.currentPath ? listing.directories : listing.roots;
  }, [listing]);

  return (
    <>
      <div className="kavita-editor">
        <aside className="kavita-editor-tabs">
          <button className={activeTab === "general" ? "active" : ""} onClick={() => setActiveTab("general")}>
            General
          </button>
          <button className={activeTab === "folder" ? "active" : ""} onClick={() => setActiveTab("folder")}>
            Folder
          </button>
          <button className={activeTab === "cover" ? "active" : ""} onClick={() => setActiveTab("cover")}>
            Cover Image
          </button>
          <button className={activeTab === "advanced" ? "active" : ""} onClick={() => setActiveTab("advanced")}>
            Advanced
          </button>
          <button className={activeTab === "tasks" ? "active" : ""} onClick={() => setActiveTab("tasks")}>
            Tasks
          </button>
        </aside>
        <section className="kavita-editor-panel">
          <p className="text-sm font-semibold text-zinc-200">
            {activeTab === "folder" ? "Add folders to your library" : "Library folder settings"}
          </p>
          <form action={addLibraryFolderAction} className="mt-5 space-y-4">
            {activeTab === "general" || activeTab === "folder" ? (
              <label className="grid gap-2 text-sm text-zinc-400">
                Library name
                <input className="kavita-input" name="name" value={libraryName} onChange={(event) => setLibraryName(event.target.value)} />
              </label>
            ) : (
              <input name="name" type="hidden" value={libraryName} />
            )}
            {activeTab === "folder" ? (
              <>
                <label className="grid gap-2 text-sm text-zinc-400">
                  Media folder path
                  <input
                    className="kavita-input"
                    value={selectedPath}
                    onChange={(event) => setSelectedPath(event.target.value)}
                    placeholder="D:\\Books, X:\\Books, \\\\server\\share\\Books, /library"
                  />
                </label>
                <div className="rounded bg-black/20 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Selected folder</p>
                      <p className="mt-1 truncate text-sm text-zinc-100">{selectedPath || "No media folder selected"}</p>
                    </div>
                    {selectedPath ? (
                      <button type="button" className="kavita-icon-button" onClick={() => setSelectedPath("")} aria-label="Clear selected folder">
                        <X size={16} />
                      </button>
                    ) : null}
                  </div>
                </div>
              </>
            ) : null}
            <input type="hidden" name="rootPath" value={selectedPath} />
            {activeTab === "folder" ? (
              <>
                <button type="button" className="kavita-browse-button" onClick={openBrowser}>
                  <Plus size={16} />
                  + Browse for Media Folders
                </button>
                <p className="text-sm leading-6 text-zinc-300">
                  ChapterChase scans folders that are visible to the server or container. You can browse from common locations,
                  type an exact path, or mount a NAS share to a path like <span className="text-emerald-300">/library</span>.
                </p>
              </>
            ) : null}
            {activeTab === "cover" ? <p className="text-sm text-zinc-300">Folder cover image settings are handled per book in v1.</p> : null}
            {activeTab === "advanced" ? <p className="text-sm text-zinc-300">Advanced scan settings will apply when scheduled scans are enabled.</p> : null}
            {activeTab === "tasks" ? (
              <div className="grid gap-4">
                <p className="text-sm text-zinc-300">Use Force Scan on an existing folder below to refresh this library.</p>
                <MetadataDownloaderCard />
              </div>
            ) : null}
            <div className="flex justify-end gap-2 border-t border-white/20 pt-4">
              <button type="reset" className="kavita-light-button" onClick={() => setSelectedPath("")}>
                Reset
              </button>
              <button className="kavita-save-button" disabled={!selectedPath || !libraryName}>
                Save
              </button>
            </div>
          </form>
        </section>
      </div>

      {isBrowserOpen ? (
        <div className="kavita-dialog-backdrop" role="dialog" aria-modal="true">
          <div className="kavita-folder-dialog">
            <header className="flex items-center justify-between border-b border-white/20 px-4 py-3">
              <div>
                <h2 className="text-lg font-semibold">Browse for Media Folders</h2>
                <p className="text-xs text-zinc-400">{listing?.currentPath ?? "Choose a media root"}</p>
              </div>
              <button className="kavita-icon-button" onClick={() => setIsBrowserOpen(false)} aria-label="Close folder browser">
                <X size={18} />
              </button>
            </header>
            <div className="grid max-h-[58vh] gap-2 overflow-y-auto p-4">
              {listing?.error ? <p className="rounded bg-red-500/10 p-3 text-sm text-red-200">{listing.error}</p> : null}
              {listing?.parentPath ? (
                <button className="kavita-folder-row" onClick={() => loadFolder(listing.parentPath)}>
                  <FolderOpen size={18} />
                  ..
                </button>
              ) : null}
              {currentChoices.map((folder) => (
                <button key={folder.path} className="kavita-folder-row" onClick={() => loadFolder(folder.path)}>
                  {listing?.currentPath ? <Folder size={18} /> : <HardDrive size={18} />}
                  <span className="min-w-0 truncate">{folder.name}</span>
                  <span className="ml-auto min-w-0 truncate text-xs text-zinc-500">{folder.path}</span>
                </button>
              ))}
              {!currentChoices.length && !isLoading ? <p className="p-4 text-center text-sm text-zinc-400">No folders found here.</p> : null}
            </div>
            <footer className="flex items-center justify-between border-t border-white/20 px-4 py-3">
              <button className="kavita-light-button" onClick={() => loadFolder(listing?.currentPath ?? null)}>
                <RotateCw size={15} />
                Refresh
              </button>
              <div className="flex gap-2">
                <button className="kavita-light-button" onClick={() => setIsBrowserOpen(false)}>
                  Cancel
                </button>
                <button
                  className="kavita-save-button"
                  disabled={!listing?.currentPath}
                  onClick={() => {
                    if (listing?.currentPath) {
                      setSelectedPath(listing.currentPath);
                    }
                    setIsBrowserOpen(false);
                  }}
                >
                  Select Folder
                </button>
              </div>
            </footer>
          </div>
        </div>
      ) : null}
    </>
  );
}
