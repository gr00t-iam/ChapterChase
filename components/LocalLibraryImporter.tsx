"use client";

import { HardDriveUpload } from "lucide-react";
import { useRef, useState } from "react";
import { addLocalSourceBook } from "@/lib/local-library";

export function LocalLibraryImporter() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  async function importFiles(files: FileList | null) {
    if (!files?.length || isImporting) {
      return;
    }

    setIsImporting(true);
    setStatus(null);
    const selectedFiles = Array.from(files);

    try {
      await Promise.all(selectedFiles.map((file) => addLocalSourceBook(file)));
      setStatus(`${selectedFiles.length} local book${selectedFiles.length === 1 ? "" : "s"} added to this browser.`);
    } catch {
      setStatus("Unable to add the selected local book.");
    } finally {
      setIsImporting(false);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }

  return (
    <section className="local-library-importer">
      <div>
        <strong>Local Library</strong>
        <span>Store books in this browser only. These files are not sent to the ChapterChase server.</span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".epub,.pdf,.txt,.html,.htm,application/epub+zip,application/pdf,text/plain,text/html"
        multiple
        onChange={(event) => void importFiles(event.target.files)}
      />
      <button className="secondary-button" onClick={() => inputRef.current?.click()} disabled={isImporting}>
        <HardDriveUpload size={16} />
        {isImporting ? "Adding..." : "Add Local Source"}
      </button>
      {status ? <p>{status}</p> : null}
    </section>
  );
}
