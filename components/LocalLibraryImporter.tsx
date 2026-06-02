"use client";

import { HardDriveUpload } from "lucide-react";
import { type ChangeEvent, useId, useState } from "react";
import { addLocalSourceBook } from "@/lib/local-library";

export function LocalLibraryImporter() {
  const inputId = useId();
  const [status, setStatus] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  async function importFiles(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const selectedFiles = Array.from(input.files ?? []);

    if (!selectedFiles.length || isImporting) {
      return;
    }

    setIsImporting(true);
    setStatus(null);

    try {
      await Promise.all(selectedFiles.map((file) => addLocalSourceBook(file)));
      setStatus(`${selectedFiles.length} local book${selectedFiles.length === 1 ? "" : "s"} added to this browser.`);
    } catch {
      setStatus("Unable to add the selected local book.");
    } finally {
      setIsImporting(false);
      input.value = "";
    }
  }

  return (
    <section className="local-library-importer">
      <div>
        <strong>Local Library</strong>
        <span>Store books in this browser only. These files are not sent to the ChapterChase server.</span>
      </div>
      <label className="secondary-button local-library-file-button" htmlFor={inputId} aria-disabled={isImporting ? "true" : "false"}>
        <HardDriveUpload size={16} />
        <span>{isImporting ? "Adding..." : "Add Local Source"}</span>
        <input
          id={inputId}
          type="file"
          accept=".epub,.pdf,application/epub+zip,application/pdf"
          multiple
          disabled={isImporting}
          onChange={(event) => void importFiles(event)}
        />
      </label>
      {status ? <p>{status}</p> : null}
    </section>
  );
}
