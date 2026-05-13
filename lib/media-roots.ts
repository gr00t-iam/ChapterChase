import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

export type MediaDirectory = {
  name: string;
  path: string;
};

const execFileAsync = promisify(execFile);

export async function getMediaRoots(): Promise<MediaDirectory[]> {
  const configured = process.env.CHAPTERCHASE_MEDIA_ROOTS ?? process.env.CHAPTERCHASE_LIBRARY_DIR;
  const roots = configured
    ? configured.split(path.delimiter).map((root) => root.trim()).filter(Boolean)
    : ["/library", path.join(process.cwd(), "library")];

  if (!restrictMediaRoots()) {
    roots.push(os.homedir(), process.cwd());

    if (process.platform === "win32") {
      roots.push(...(await discoverWindowsFileSystemRoots()));
    } else {
      roots.push("/", "/share", "/volume1", "/volume2", "/mnt", "/media");
    }
  }

  return uniquePaths(roots).map((root) => ({
    name: root,
    path: path.resolve(root),
  }));
}

export async function listMediaDirectories(requestedPath?: string | null) {
  const roots = await getMediaRoots();
  const basePath = requestedPath ? normalizeUserPath(requestedPath) : null;
  const currentPath = basePath && isAllowedPath(basePath, roots) ? basePath : null;

  if (!currentPath) {
    return {
      currentPath: null,
      parentPath: null,
      roots,
      directories: [] satisfies MediaDirectory[],
    };
  }

  const entries = await fs.readdir(currentPath, { withFileTypes: true });
  const directories = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => ({
      name: entry.name,
      path: path.join(currentPath, entry.name),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const parentPath = path.dirname(currentPath);

  return {
    currentPath,
    parentPath: parentPath !== currentPath && isAllowedPath(parentPath, roots) ? parentPath : null,
    roots,
    directories,
  };
}

function isAllowedPath(candidate: string, roots: MediaDirectory[]) {
  if (!restrictMediaRoots() && path.isAbsolute(candidate)) {
    return true;
  }

  const normalizedCandidate = normalize(candidate);
  return roots.some((root) => {
    const normalizedRoot = normalize(root.path);
    return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}${path.sep}`);
  });
}

function restrictMediaRoots() {
  return process.env.CHAPTERCHASE_RESTRICT_MEDIA_ROOTS === "true";
}

function normalize(value: string) {
  return normalizeUserPath(value).toLowerCase();
}

function uniquePaths(values: string[]) {
  return Array.from(new Set(values.map((value) => normalizeUserPath(value))));
}

function normalizeUserPath(value: string) {
  const trimmed = value.trim();
  if (process.platform === "win32") {
    const driveRoot = /^([a-z]):?\\?$/i.exec(trimmed);
    if (driveRoot) {
      return `${driveRoot[1].toUpperCase()}:\\`;
    }
  }
  return path.resolve(trimmed);
}

async function discoverWindowsFileSystemRoots() {
  const fallbackRoots = ["C:\\", "D:\\", "E:\\", "X:\\", "Z:\\"];

  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "$ErrorActionPreference='SilentlyContinue'; " +
          "$drives = Get-PSDrive -PSProvider FileSystem | Select-Object -ExpandProperty Root; " +
          "$logical = Get-CimInstance Win32_LogicalDisk | ForEach-Object { $_.DeviceID + '\\' }; " +
          "@($drives + $logical) | Where-Object { $_ } | Sort-Object -Unique | ConvertTo-Json -Compress",
      ],
      { windowsHide: true, timeout: 5000 }
    );
    const parsed = JSON.parse(stdout.trim() || "[]") as unknown;
    const discovered = (Array.isArray(parsed) ? parsed : [parsed])
      .filter((value): value is string => typeof value === "string" && /^[a-z]:\\$/i.test(value.trim()))
      .map((value) => normalizeUserPath(value));
    return discovered.length ? Array.from(new Set([...discovered, ...fallbackRoots.map(normalizeUserPath)])) : fallbackRoots;
  } catch {
    return fallbackRoots;
  }
}
